"""
Grabbr Native Backend
FastAPI + SQLite + asyncio job engine that drives the bundled gallery-dl binary.

Single-file (mirrors Foldr). Sections:
  - Paths / logging / SQLite helpers
  - Schema + migrations + settings + per-site auth
  - Hermetic gallery-dl config generation  (--config-ignore + our own JSON)
  - argv builder + stdout parser + auth-error detection
  - JobManager (asyncio queue + concurrency gate + subprocess runner)
  - OAuth helper (drives `gallery-dl oauth:<site>`)
  - WebSocket manager
  - FastAPI routes
"""
import asyncio
import ctypes
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import threading
import time
import traceback as _traceback
import urllib.request
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Dict, List, Optional

import logging
import uvicorn
from fastapi import APIRouter, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# ── Paths ─────────────────────────────────────────────────────────────────────
def _default_data_dir() -> Path:
    env = os.environ.get("GRABBR_DATA")
    if env:
        return Path(env)
    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "Grabbr"
    return Path.home() / ".grabbr"

BASE_DIR = _default_data_dir()
BASE_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = BASE_DIR / "grabbr.db"
LOG_DIR = BASE_DIR / "logs"
JOB_LOG_DIR = LOG_DIR / "jobs"
JOB_LOG_DIR.mkdir(parents=True, exist_ok=True)
ARCHIVE_PATH = BASE_DIR / "archive.sqlite"
CONFIG_PATH = BASE_DIR / "gallery-dl.json"
CACHE_PATH = BASE_DIR / "gallery-dl-cache.sqlite3"   # gallery-dl's token/cursor cache
TOOLS_DIR = BASE_DIR / "tools"
THUMBS_DIR = BASE_DIR / "thumbs"                     # generated video frame cache
COOKIES_DIR = BASE_DIR / "cookies"                   # drop cookies.txt exports here
COOKIES_MERGED = BASE_DIR / "cookies-merged.txt"     # generated: all of the above, deduped
COOKIES_DIR.mkdir(parents=True, exist_ok=True)
TOOLS_DIR.mkdir(parents=True, exist_ok=True)
THUMBS_DIR.mkdir(parents=True, exist_ok=True)

PORT = int(os.environ.get("GRABBR_PORT", "8766"))

GDL_BIN_ENV = os.environ.get("GRABBR_GDL_BIN") or ""
_EXE = ".exe" if os.name == "nt" else ""

# Keep console-subsystem children (gallery-dl.exe, ffmpeg, taskkill, ...) from
# flashing a command window when the packaged GUI backend has no console itself.
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def tool_path(name: str) -> Optional[str]:
    """A binary Grabbr downloaded into its own tools/ folder, if present."""
    p = TOOLS_DIR / f"{name}{_EXE}"
    return str(p) if p.exists() else None


def gdl_bin() -> str:
    return (
        tool_path("gallery-dl")
        or GDL_BIN_ENV
        or shutil.which("gallery-dl")
        or shutil.which("gallery-dl.exe")
        or "gallery-dl"
    )


def sub_env() -> dict:
    """Env for gallery-dl subprocesses: tools/ on PATH so a downloaded
    ffmpeg / yt-dlp is found without extra config."""
    env = dict(os.environ)
    env["PATH"] = str(TOOLS_DIR) + os.pathsep + env.get("PATH", "")
    return env


# Where downloads land by default. Electron passes the real Downloads path via
# GRABBR_DEFAULT_OUTPUT; the fallback is used only for a bare `python server.py`.
DEFAULT_OUTPUT_DIR = (
    os.environ.get("GRABBR_DEFAULT_OUTPUT")
    or str(Path.home() / "Downloads" / "Grabbr")
)
APP_VERSION = "1.1.1"                                # single source at runtime


def _abs_output(p: Optional[str]) -> str:
    """An absolute download root. A blank or relative setting must never make
    gallery-dl write into the process's working directory (the user's home
    folder when launched from the Start menu)."""
    p = (p or "").strip()
    try:
        path = Path(p).expanduser() if p else Path(DEFAULT_OUTPUT_DIR)
        if not path.is_absolute():
            path = Path(DEFAULT_OUTPUT_DIR)
        return str(path)
    except Exception:
        return DEFAULT_OUTPUT_DIR

# Browsers gallery-dl can read cookies from. "operagx" is synthetic; we map it
# to opera + the Opera GX profile path in build_gdl_config().
COOKIE_BROWSERS = [
    "firefox", "librewolf", "zen", "floorp",
    "chrome", "chromium", "edge", "brave", "opera", "operagx", "vivaldi", "thorium",
    "safari",
]


def _operagx_profile() -> str:
    root = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    return str(Path(root) / "Opera Software" / "Opera GX Stable")


def cookies_spec_for_browser(name: str):
    """Return the gallery-dl `cookies` value (a list) for a browser choice."""
    if name == "operagx":
        return ["opera", _operagx_profile()]
    return [name]


# ── Cookie folder (drop any number of cookies.txt exports in one place) ───────
def _cookie_txt_files() -> list:
    try:
        return sorted(
            p for p in COOKIES_DIR.iterdir()
            if p.is_file() and p.suffix.lower() in (".txt", ".cookies")
        )
    except Exception:
        return []


def _cookie_lines(text: str):
    """Yield (domain, cookie_line) for each real cookie row in a cookies.txt.
    Handles the `#HttpOnly_` prefix (which is where sessionid usually lives) and
    tolerates space- or tab-separated columns."""
    for raw in text.splitlines():
        line = raw.rstrip("\r\n")
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            if not s.startswith("#HttpOnly_"):
                continue
            line = line.replace("#HttpOnly_", "", 1)
            s = line.strip()
        parts = s.split("\t")
        if len(parts) < 7:
            parts = s.split()
        if len(parts) < 7 or not parts[0]:
            continue
        yield parts[0].lstrip("."), "\t".join(parts[:7])


def _parse_netscape_domains(path) -> set:
    try:
        txt = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return set()
    return {dom for dom, _ in _cookie_lines(txt)}


def scan_cookie_folder() -> list:
    """[{file, name, domains:[...], lines:int}] for every cookies.txt in the folder."""
    out = []
    for p in _cookie_txt_files():
        try:
            rows = list(_cookie_lines(p.read_text(encoding="utf-8", errors="replace")))
        except Exception:
            rows = []
        out.append({
            "file": str(p), "name": p.name,
            "domains": sorted({d for d, _ in rows}), "lines": len(rows),
        })
    return out


def merge_cookie_folder() -> Optional[str]:
    """Concatenate every cookies.txt in the folder into one deduped, normalised
    file that gallery-dl can load as `extractor.cookies`. Returns its path."""
    files = _cookie_txt_files()
    if not files:
        try:
            COOKIES_MERGED.unlink(missing_ok=True)
        except Exception:
            pass
        return None
    seen = {}                       # (domain, path, name) -> normalised line, last wins
    for p in files:
        try:
            for _dom, norm in _cookie_lines(p.read_text(encoding="utf-8", errors="replace")):
                cols = norm.split("\t")
                seen[(cols[0], cols[2], cols[5])] = norm
        except Exception:
            continue
    if not seen:
        return None
    body = "# Netscape HTTP Cookie File\n# merged by Grabbr\n" + "\n".join(seen.values()) + "\n"
    try:
        COOKIES_MERGED.write_text(body, encoding="utf-8")
        return str(COOKIES_MERGED)
    except Exception:
        return None


def _folder_domains() -> set:
    """Every domain covered by any cookies.txt currently in the folder."""
    out: set = set()
    for f in scan_cookie_folder():
        out.update(f.get("domains") or [])
    return out


# Cookie-tier sites → the domain(s) a cookies.txt would carry for them.
SITE_DOMAINS = {
    "instagram": ("instagram.com",),
    "twitter": ("twitter.com", "x.com"),
    "tiktok": ("tiktok.com",),
    "patreon": ("patreon.com",),
    "fanbox": ("fanbox.cc",),
    "fantia": ("fantia.jp",),
}


def _site_in_folder(site: str, domains: set) -> bool:
    for c in SITE_DOMAINS.get(site, ()):  # tolerate sub/parent domain matches
        if any(d == c or d.endswith("." + c) or c.endswith("." + d) for d in domains):
            return True
    return False


# gallery-dl OAuth helper subcategories (drive `gallery-dl oauth:<x>`)
OAUTH_SITES = {"reddit", "deviantart", "flickr", "tumblr", "smugmug", "mastodon"}

# ── Logging ───────────────────────────────────────────────────────────────────
_LOG_FMT = "%(asctime)s %(levelname)-8s %(message)s"
_LOG_DATEFMT = "%Y-%m-%d %H:%M:%S"
logging.basicConfig(level=logging.INFO, format=_LOG_FMT, datefmt=_LOG_DATEFMT)
log = logging.getLogger("grabbr")
_fh = RotatingFileHandler(str(LOG_DIR / "grabbr.log"), maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
_fh.setFormatter(logging.Formatter(_LOG_FMT, datefmt=_LOG_DATEFMT))
log.addHandler(_fh)

# ── SQLite ────────────────────────────────────────────────────────────────────
_db_lock = threading.Lock()


def _conn():
    c = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


def db_one(sql, p=()):
    with _db_lock:
        c = _conn()
        try:
            r = c.execute(sql, p).fetchone()
            return dict(r) if r else None
        finally:
            c.close()


def db_all(sql, p=()):
    with _db_lock:
        c = _conn()
        try:
            return [dict(r) for r in c.execute(sql, p).fetchall()]
        finally:
            c.close()


def db_run(sql, p=()):
    with _db_lock:
        c = _conn()
        try:
            c.execute(sql, p)
            c.commit()
        except sqlite3.Error as e:
            log.error("db_run failed: %s\nSQL: %s\n%s", e, sql.strip(), _traceback.format_exc().rstrip())
            raise
        finally:
            c.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Schema ────────────────────────────────────────────────────────────────────
def init_db():
    with _db_lock:
        c = _conn()
        c.executescript(
            """
CREATE TABLE IF NOT EXISTS settings (
    id                TEXT PRIMARY KEY,
    output_dir        TEXT DEFAULT '',
    filename_format   TEXT DEFAULT '',
    folder_structure  TEXT DEFAULT 'site_user',
    folder_custom     TEXT DEFAULT '',
    default_range     TEXT DEFAULT '',
    max_concurrent    INTEGER DEFAULT 2,
    rate_limit        TEXT DEFAULT '',
    proxy             TEXT DEFAULT '',
    sleep_request     REAL DEFAULT 0,
    retries           INTEGER DEFAULT 4,
    skip_existing     INTEGER DEFAULT 1,
    write_metadata    INTEGER DEFAULT 0,
    notifications_enabled INTEGER DEFAULT 1,
    cookies_mode      TEXT DEFAULT 'browser',
    cookies_browser   TEXT DEFAULT 'firefox',
    cookies_file      TEXT DEFAULT '',
    theme             TEXT DEFAULT 'system',
    language          TEXT DEFAULT 'en',
    autostart         INTEGER DEFAULT 0,
    updated_at        TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
    id             TEXT PRIMARY KEY,
    url            TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'queued',
    title          TEXT DEFAULT '',
    dest_dir       TEXT DEFAULT '',
    options_json   TEXT DEFAULT '{}',
    command        TEXT DEFAULT '',
    hint           TEXT DEFAULT '',
    files_ok       INTEGER DEFAULT 0,
    files_skipped  INTEGER DEFAULT 0,
    files_error    INTEGER DEFAULT 0,
    files_json     TEXT DEFAULT '[]',
    total          INTEGER DEFAULT 0,
    current_file   TEXT DEFAULT '',
    error_text     TEXT DEFAULT '',
    log_path       TEXT DEFAULT '',
    return_code    INTEGER,
    created_at     TEXT,
    started_at     TEXT,
    finished_at    TEXT
);

CREATE TABLE IF NOT EXISTS site_auth (
    site            TEXT PRIMARY KEY,
    cookies_mode    TEXT DEFAULT 'global',
    cookies_browser TEXT DEFAULT '',
    cookies_file    TEXT DEFAULT '',
    username        TEXT DEFAULT '',
    password        TEXT DEFAULT '',
    token_json      TEXT DEFAULT '{}',
    instance        TEXT DEFAULT '',
    updated_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status  ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
"""
        )
        c.commit()
        # Defensive migrations for installs created before a column existed.
        for table, col, ddl in [
            ("settings", "folder_structure", "TEXT DEFAULT 'site_user'"),
            ("settings", "folder_custom", "TEXT DEFAULT ''"),
            ("settings", "proxy", "TEXT DEFAULT ''"),
            ("settings", "default_range", "TEXT DEFAULT ''"),
            ("settings", "notifications_enabled", "INTEGER DEFAULT 1"),
            ("jobs", "hint", "TEXT DEFAULT ''"),
            ("jobs", "files_json", "TEXT DEFAULT '[]'"),
        ]:
            try:
                c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
                c.commit()
            except sqlite3.OperationalError:
                pass
        row = c.execute("SELECT id FROM settings WHERE id='singleton'").fetchone()
        if not row:
            c.execute(
                "INSERT INTO settings (id, output_dir, updated_at) VALUES ('singleton', ?, ?)",
                (DEFAULT_OUTPUT_DIR, _now()),
            )
            c.commit()
        c.close()

    for j in db_all("SELECT id FROM jobs WHERE status IN ('running','queued')"):
        db_run(
            "UPDATE jobs SET status='error', error_text=?, finished_at=? WHERE id=?",
            ("Interrupted: backend restarted before this job finished.", _now(), j["id"]),
        )
    write_gdl_config()


def get_settings() -> dict:
    s = db_one("SELECT * FROM settings WHERE id='singleton'")
    if not s:
        init_db()
        s = db_one("SELECT * FROM settings WHERE id='singleton'")
    if not s.get("output_dir"):
        s["output_dir"] = DEFAULT_OUTPUT_DIR
    return s


def get_sites() -> List[dict]:
    return db_all("SELECT * FROM site_auth ORDER BY site")


# ── Hermetic gallery-dl config ───────────────────────────────────────────────
def build_gdl_config(settings: dict, sites: List[dict]) -> dict:
    ex: Dict = {"base-directory": _abs_output(settings.get("output_dir"))}

    if int(settings.get("skip_existing", 1)):
        ex["archive"] = str(ARCHIVE_PATH)
    if settings.get("filename_format"):
        ex["filename"] = settings["filename_format"]

    fs = settings.get("folder_structure", "site_user")
    if fs == "site":
        ex["directory"] = ["{category}"]
    elif fs == "flat":
        ex["directory"] = []
    elif fs == "custom" and settings.get("folder_custom"):
        parts = [p for p in re.split(r"[\\/]+", settings["folder_custom"]) if p.strip()]
        ex["directory"] = parts
    # "site_user" → leave unset so each extractor keeps its own layout.

    if float(settings.get("sleep_request", 0) or 0) > 0:
        ex["sleep-request"] = settings["sleep_request"]
    if int(settings.get("retries", 4)) != 4:
        ex["retries"] = int(settings.get("retries", 4))
    if settings.get("proxy"):
        ex["proxy"] = settings["proxy"].strip()

    # One cookie model: the selected browser is the base for every site; an
    # uploaded cookies.txt (merged folder) overrides it for the sites it covers.
    merged_folder = merge_cookie_folder()
    browser = (settings.get("cookies_browser") or "").strip().lower()
    if browser and browser != "none":
        ex["cookies"] = cookies_spec_for_browser(browser)
    elif merged_folder:
        ex["cookies"] = merged_folder
    folder_domains = _folder_domains() if merged_folder else set()

    for s in sites:
        node: Dict = {}
        mode = s.get("cookies_mode") or "auto"
        covered = bool(merged_folder) and _site_in_folder(s["site"], folder_domains)
        if mode == "folder" or (mode in ("auto", "global") and covered):
            if merged_folder:
                node["cookies"] = merged_folder
        elif mode == "browser" and s.get("cookies_browser"):
            node["cookies"] = cookies_spec_for_browser(s["cookies_browser"])
        elif mode == "file" and s.get("cookies_file"):
            node["cookies"] = s["cookies_file"]
        elif mode == "none":
            node["cookies"] = None
        # auto + not covered → inherit the global browser cookies.
        if s.get("username"):
            node["username"] = s["username"]
        if s.get("password"):
            node["password"] = s["password"]
        try:
            tok = json.loads(s.get("token_json") or "{}")
        except Exception:
            tok = {}
        for k, v in tok.items():
            if v:
                node[k] = v
        if not node:
            continue
        if s["site"] == "mastodon" and s.get("instance"):
            ex.setdefault("mastodon", {})[s["instance"]] = node
        else:
            ex[s["site"]] = node

    # Keep gallery-dl's own cache (OAuth tokens, pagination cursors) inside the
    # Grabbr data folder instead of %APPDATA%\gallery-dl\.
    return {"extractor": ex, "cache": {"file": str(CACHE_PATH)}}


def write_gdl_config():
    try:
        cfg = build_gdl_config(get_settings(), get_sites())
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    except Exception as e:
        log.error("could not write gallery-dl config: %s", e)


# ── argv + parsing ───────────────────────────────────────────────────────────
def _norm_range(v: str) -> str:
    """A bare number N means 'the latest N' → '1-N'. Anything else passes through."""
    v = (v or "").strip()
    return f"1-{v}" if re.fullmatch(r"\d+", v) else v


def build_argv(url: str, settings: dict, options: Optional[dict] = None,
               simulate: bool = False) -> List[str]:
    options = options or {}
    argv = [gdl_bin(), "--config", str(CONFIG_PATH), "--config-ignore", "--no-colors"]
    if settings.get("rate_limit"):
        argv += ["-r", str(settings["rate_limit"])]
    if options.get("range"):
        argv += ["--range", _norm_range(str(options["range"]))]
    if options.get("no_archive"):
        # ignore the download archive for this run, re-checks the filesystem
        # instead, so deleted files get pulled again
        argv += ["-o", "archive="]
    if int(settings.get("write_metadata", 0)) and not simulate:
        argv += ["--write-metadata"]
    if simulate:
        argv.append("--simulate")
    argv.append(url)
    return argv


_LOG_LINE = re.compile(r"^\[[\w.\-]+\]\[(\w+)\]\s*(.*)$")
_PROGRESS = re.compile(r"^\s*\d+(\.\d+)?\s*[KMG]?i?B(/s)?\b")
_AUTH_ERR = re.compile(
    r"login|log ?in required|authenticat|authoriz|\b401\b|\b403\b|forbidden|"
    r"no (?:valid )?cookies|cookies.*(?:expired|invalid)|session|private|"
    r"account.*required|subscribe|not logged in|browser cookies instead|"
    r"redirect to .*/(?:accounts/)?login|unable to find .{0,40}cookies database|"
    r"failed to load .{0,30}cookies|does not support profiles",
    re.I,
)

# Site is throttling this IP. Retrying quickly makes it worse; the UI shows a
# cooldown instead of an active Retry button.
_RATE_LIMIT = re.compile(
    r"\b429\b|too many requests|rate limit|rate-limit|ratelimit|"
    r"redirect to home page|temporarily blocked|try again later|"
    r"request was throttled|please wait",
    re.I,
)

# gallery-dl can't open a Chromium cookie DB while that browser is running
# (exclusive file lock). Distinct from a plain auth failure; the fix is
# different (close the browser / use Firefox / cookies.txt).
_COOKIE_LOCKED = re.compile(
    r"cookies:.*(?:\[errno 13\]|permission denied|winerror 32|being used by another process)",
    re.I,
)

# Sites where an anonymous request routinely fails with a non-obvious message
# (e.g. Instagram → "NotFoundError"). If a job for one of these errors and no
# per-site auth is configured, we still surface the "needs login" hint.
_COOKIE_HOSTS = {
    "instagram.com": "instagram", "www.instagram.com": "instagram",
    "twitter.com": "twitter", "x.com": "twitter", "mobile.twitter.com": "twitter",
    "patreon.com": "patreon", "www.patreon.com": "patreon",
    "fanbox.cc": "fanbox", "fantia.jp": "fantia",
}


def _site_for_url(url: str) -> Optional[str]:
    m = re.match(r"https?://([^/]+)", url or "", re.I)
    if not m:
        return None
    host = m.group(1).lower().split(":")[0]
    return _COOKIE_HOSTS.get(host) or _COOKIE_HOSTS.get(host.lstrip("www."))


def classify_line(raw: str) -> tuple:
    line = raw.rstrip("\r\n").strip()
    if not line:
        return ("noise", "")
    if line.startswith("# "):
        return ("skip", line[2:].strip())
    m = _LOG_LINE.match(line)
    if m:
        level = m.group(1).lower()
        if level == "error":
            return ("error", m.group(2) or line)
        if level == "warning":
            return ("warning", m.group(2) or line)
        return ("info", m.group(2) or line)
    if line.startswith("[") or _PROGRESS.match(line):
        return ("noise", line)
    if ("/" in line or "\\" in line) or re.search(r"\.\w{1,5}$", line):
        return ("file", line)
    return ("noise", line)


# ── WebSocket manager ────────────────────────────────────────────────────────
class WSManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, message: dict):
        payload = json.dumps(message, default=str)
        for ws in list(self.active):
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(ws)


ws_manager = WSManager()


# ── Job engine ───────────────────────────────────────────────────────────────
def _job_row(job_id: str) -> Optional[dict]:
    return db_one("SELECT * FROM jobs WHERE id=?", (job_id,))


def _job_public(row: Optional[dict]) -> dict:
    if not row:
        return {}
    row = dict(row)
    try:
        row["options"] = json.loads(row.pop("options_json", "{}") or "{}")
    except Exception:
        row["options"] = {}
    row.pop("files_json", None)  # internal; served via GET /jobs/{id}/files
    return row


class JobManager:
    def __init__(self):
        self.queue: "asyncio.Queue[str]" = asyncio.Queue()
        self.running: dict = {}
        self.cancelled: set = set()
        self.max_concurrent: int = 2
        self.cond: Optional[asyncio.Condition] = None

    async def start(self):
        self.cond = asyncio.Condition()
        self.max_concurrent = int(get_settings().get("max_concurrent", 2) or 2)
        asyncio.create_task(self._dispatch_loop())
        for j in db_all("SELECT id FROM jobs WHERE status='queued' ORDER BY created_at"):
            await self.queue.put(j["id"])

    async def set_concurrency(self, n: int):
        self.max_concurrent = max(0, int(n))
        if self.cond:
            async with self.cond:
                self.cond.notify_all()

    async def enqueue(self, job_id: str):
        await self.queue.put(job_id)

    async def cancel(self, job_id: str):
        self.cancelled.add(job_id)
        proc = self.running.get(job_id)
        if proc and proc.returncode is None:
            pid = proc.pid
            try:
                if os.name == "nt":
                    import signal
                    try:
                        proc.send_signal(signal.CTRL_BREAK_EVENT)
                        await asyncio.sleep(0.3)
                    except Exception:
                        pass
                proc.kill()
            except Exception:
                pass
            # Reap the whole tree: the frozen gallery-dl has a bootloader child,
            # and video jobs spawn yt-dlp / ffmpeg.
            if os.name == "nt":
                try:
                    await asyncio.to_thread(
                        subprocess.run, ["taskkill", "/F", "/T", "/PID", str(pid)],
                        capture_output=True, timeout=5, creationflags=CREATE_NO_WINDOW,
                    )
                except Exception:
                    pass
        else:
            row = _job_row(job_id)
            if row and row["status"] == "queued":
                db_run("UPDATE jobs SET status='canceled', finished_at=? WHERE id=?", (_now(), job_id))
                await ws_manager.broadcast({"type": "job.update", "job": _job_public(_job_row(job_id))})

    async def _dispatch_loop(self):
        while True:
            job_id = await self.queue.get()
            row = _job_row(job_id)
            if not row or row["status"] != "queued":
                continue
            async with self.cond:
                await self.cond.wait_for(lambda: len(self.running) < self.max_concurrent)
            if job_id in self.cancelled:
                self.cancelled.discard(job_id)
                db_run("UPDATE jobs SET status='canceled', finished_at=? WHERE id=?", (_now(), job_id))
                await ws_manager.broadcast({"type": "job.update", "job": _job_public(_job_row(job_id))})
                continue
            asyncio.create_task(self._run(job_id))

    async def _run(self, job_id: str):
        row = _job_row(job_id)
        if not row:
            return
        settings = get_settings()
        write_gdl_config()
        url = row["url"]
        try:
            job_opts = json.loads(row.get("options_json") or "{}")
        except Exception:
            job_opts = {}
        dest = _abs_output(settings.get("output_dir"))
        try:
            Path(dest).mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
        argv = build_argv(url, settings, job_opts)
        log_path = str(JOB_LOG_DIR / f"{job_id}.log")

        db_run(
            "UPDATE jobs SET status='running', started_at=?, dest_dir=?, command=?, log_path=?, hint='' WHERE id=?",
            (_now(), dest, " ".join(argv), log_path, job_id),
        )
        await ws_manager.broadcast({"type": "job.update", "job": _job_public(_job_row(job_id))})

        creationflags = (subprocess.CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW) if os.name == "nt" else 0
        counts = {"files_ok": 0, "files_skipped": 0, "files_error": 0}
        errors: List[str] = []
        last_flush = 0.0

        try:
            proc = await asyncio.create_subprocess_exec(
                *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
                creationflags=creationflags, env=sub_env(), cwd=dest,
            )
        except FileNotFoundError:
            db_run(
                "UPDATE jobs SET status='error', error_text=?, finished_at=? WHERE id=?",
                (f"gallery-dl binary not found at: {gdl_bin()}", _now(), job_id),
            )
            await ws_manager.broadcast({"type": "job.update", "job": _job_public(_job_row(job_id))})
            async with self.cond:
                self.cond.notify_all()
            return

        self.running[job_id] = proc
        logf = open(log_path, "w", encoding="utf-8", errors="replace")
        logf.write(" ".join(argv) + "\n\n")
        cur = None
        written_dirs: set = set()
        written_files: List[str] = []

        try:
            while True:
                chunk = await proc.stdout.readline()
                if not chunk:
                    break
                raw = chunk.decode("utf-8", errors="replace")
                logf.write(raw)
                for piece in raw.replace("\r", "\n").split("\n"):
                    kind, text = classify_line(piece)
                    if kind == "file":
                        counts["files_ok"] += 1
                        cur = text
                        d = os.path.dirname(text)
                        if d:
                            written_dirs.add(d)
                        # Exact per-job file list for History thumbnails; a
                        # directory scan can't tell one job's files apart from
                        # another's when they share a flat destination folder.
                        if len(written_files) < 500:
                            written_files.append(str(Path(dest, text)))
                    elif kind == "skip":
                        counts["files_skipped"] += 1
                    elif kind == "error":
                        counts["files_error"] += 1
                        errors.append(text)
                    if kind in ("file", "skip", "error", "warning"):
                        await ws_manager.broadcast({"type": "job.line", "id": job_id, "kind": kind, "text": text})
                now = time.monotonic()
                if now - last_flush > 0.25:
                    last_flush = now
                    logf.flush()
                    db_run(
                        "UPDATE jobs SET files_ok=?, files_skipped=?, files_error=?, current_file=? WHERE id=?",
                        (counts["files_ok"], counts["files_skipped"], counts["files_error"], (cur or "")[:400], job_id),
                    )
                    await ws_manager.broadcast({"type": "job.progress", "id": job_id, **counts, "current_file": cur or ""})
            rc = await proc.wait()
        finally:
            logf.flush()
            logf.close()
            self.running.pop(job_id, None)

        cancelled = job_id in self.cancelled
        self.cancelled.discard(job_id)
        status = "canceled" if cancelled else ("done" if rc == 0 else "error")

        blob = "\n".join(errors[-40:])
        try:
            tail = Path(log_path).read_text(encoding="utf-8", errors="replace")[-6000:]
        except Exception:
            tail = ""
        hint = ""
        if status == "error":
            if _COOKIE_LOCKED.search(blob) or _COOKIE_LOCKED.search(tail):
                hint = "cookies_locked"
            elif _RATE_LIMIT.search(blob) or _RATE_LIMIT.search(tail):
                hint = "rate_limited"
            elif _AUTH_ERR.search(blob) or _AUTH_ERR.search(tail):
                hint = "auth"
            else:
                site = _site_for_url(url)
                if site:
                    cfg_site = db_one("SELECT username, token_json, cookies_mode FROM site_auth WHERE site=?", (site,))
                    has_auth = cfg_site and (
                        cfg_site.get("username")
                        or (cfg_site.get("cookies_mode") not in (None, "", "global", "none"))
                        or (cfg_site.get("token_json") not in (None, "", "{}"))
                    )
                    if not has_auth:
                        hint = "auth"

        # Narrow dest_dir from the base output folder to the actual folder(s)
        # gallery-dl wrote into, so "Open folder" lands somewhere useful.
        dest_final = dest
        if written_dirs:
            try:
                common = (os.path.commonpath(list(written_dirs))
                          if len(written_dirs) > 1 else next(iter(written_dirs)))
                if common and Path(common).is_dir() and _under_output(Path(common)):
                    dest_final = common
            except Exception:
                pass

        db_run(
            """UPDATE jobs SET status=?, files_ok=?, files_skipped=?, files_error=?, files_json=?,
                   error_text=?, return_code=?, hint=?, dest_dir=?, current_file='', finished_at=? WHERE id=?""",
            (status, counts["files_ok"], counts["files_skipped"], counts["files_error"], json.dumps(written_files),
             "\n".join(errors[-20:]), rc, hint, dest_final, _now(), job_id),
        )
        final_row = _job_row(job_id)
        if final_row:  # may be gone if the user hit Delete mid-run
            await ws_manager.broadcast({"type": "job.update", "job": _job_public(final_row)})
        async with self.cond:
            self.cond.notify_all()


manager = JobManager()


# ── Preview ──────────────────────────────────────────────────────────────────
async def run_preview(url: str, options: Optional[dict] = None,
                      limit: int = 60, timeout: float = 45.0) -> dict:
    write_gdl_config()
    argv = build_argv(url, get_settings(), options or {}, simulate=True)
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            env=sub_env(), creationflags=CREATE_NO_WINDOW, cwd=str(BASE_DIR),
        )
    except FileNotFoundError:
        raise HTTPException(500, f"gallery-dl binary not found at: {gdl_bin()}")

    files: List[str] = []
    errors: List[str] = []
    count = 0
    try:
        async def _read():
            nonlocal count
            while True:
                chunk = await proc.stdout.readline()
                if not chunk:
                    break
                for piece in chunk.decode("utf-8", errors="replace").replace("\r", "\n").split("\n"):
                    kind, text = classify_line(piece)
                    if kind in ("file", "skip"):
                        count += 1
                        if len(files) < limit:
                            files.append(text)
                    elif kind == "error":
                        errors.append(text)

        await asyncio.wait_for(_read(), timeout=timeout)
        rc = await asyncio.wait_for(proc.wait(), timeout=5)
    except asyncio.TimeoutError:
        proc.kill()
        eblob = "\n".join(errors)
        return {"url": url, "count": count, "files": files, "truncated": True,
                "errors": errors, "needs_auth": bool(_AUTH_ERR.search(eblob)),
                "rate_limited": bool(_RATE_LIMIT.search(eblob)),
                "note": "Preview timed out. Partial result."}

    eblob = "\n".join(errors)
    return {
        "url": url, "count": count, "files": files,
        "truncated": count > len(files), "errors": errors,
        "needs_auth": bool(_AUTH_ERR.search(eblob)),
        "rate_limited": bool(_RATE_LIMIT.search(eblob)),
        "return_code": rc,
    }


# ── OAuth helper ─────────────────────────────────────────────────────────────
class OAuthRun:
    def __init__(self):
        self.proc: Optional[asyncio.subprocess.Process] = None
        self.url: str = ""
        self.done: bool = False
        self.ok: bool = False
        self.keys: Dict = {}
        self.error: str = ""
        self.output: str = ""


_oauth_runs: Dict[str, OAuthRun] = {}
_URL_RE = re.compile(r"https?://\S+")
_TOKEN_BLOCK = re.compile(
    r"Your ((?:'[\w-]+'(?: and )?)+) (?:is|are)\s*\n\s*\n(.+?)\n\s*\n", re.S
)


def _parse_oauth_tokens(text: str) -> Dict[str, str]:
    m = _TOKEN_BLOCK.search(text)
    if not m:
        return {}
    names = re.findall(r"'([\w-]+)'", m.group(1))
    values = [v.strip() for v in m.group(2).strip().splitlines() if v.strip()]
    return dict(zip(names, values))


async def _oauth_worker(site: str, run: OAuthRun, target: str):
    try:
        proc = await asyncio.create_subprocess_exec(
            gdl_bin(), "--no-colors", target,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            env=sub_env(), creationflags=CREATE_NO_WINDOW, cwd=str(BASE_DIR),
        )
    except FileNotFoundError:
        run.done, run.error = True, f"gallery-dl not found at {gdl_bin()}"
        await ws_manager.broadcast({"type": "site.oauth", "site": site, "done": True, "ok": False, "error": run.error})
        return

    run.proc = proc
    buf = []

    async def _pump():
        while True:
            chunk = await proc.stdout.readline()
            if not chunk:
                break
            s = chunk.decode("utf-8", errors="replace")
            buf.append(s)
            run.output = "".join(buf)
            if not run.url:
                m = _URL_RE.search(s)
                if m:
                    run.url = m.group(0).rstrip(").,")
                    await ws_manager.broadcast({"type": "site.oauth", "site": site, "url": run.url})
            await ws_manager.broadcast({"type": "site.oauth.line", "site": site, "text": s.rstrip()})

    try:
        # gallery-dl runs a local callback server and blocks until the browser
        # redirect arrives. Give the user 5 minutes, then give up.
        await asyncio.wait_for(_pump(), timeout=300)
        await asyncio.wait_for(proc.wait(), timeout=5)
    except asyncio.TimeoutError:
        run.error = "Timed out waiting for browser authorization."
        try:
            if os.name == "nt":
                await asyncio.to_thread(
                    subprocess.run, ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                    capture_output=True, timeout=5, creationflags=CREATE_NO_WINDOW)
            else:
                proc.kill()
        except Exception:
            pass
    run.keys = _parse_oauth_tokens(run.output)
    run.done = True
    run.ok = bool(run.keys)
    if run.keys:
        prev = db_one("SELECT token_json FROM site_auth WHERE site=?", (site,))
        merged = {}
        if prev:
            try:
                merged = json.loads(prev.get("token_json") or "{}")
            except Exception:
                merged = {}
        merged.update(run.keys)
        _upsert_site(site, {"token_json": json.dumps(merged)})
        write_gdl_config()
    else:
        run.error = "No tokens found in gallery-dl output. See the log."
    await ws_manager.broadcast(
        {"type": "site.oauth", "site": site, "done": True, "ok": run.ok, "keys": list(run.keys), "error": run.error}
    )


# ── site_auth helpers ───────────────────────────────────────────────────────
_SITE_COLS = ["cookies_mode", "cookies_browser", "cookies_file", "username", "password", "token_json", "instance"]


def _upsert_site(site: str, patch: dict):
    cur = db_one("SELECT * FROM site_auth WHERE site=?", (site,))
    if cur:
        merged = {**cur, **patch, "updated_at": _now()}
        db_run(
            f"UPDATE site_auth SET {', '.join(f'{c}=?' for c in _SITE_COLS)}, updated_at=? WHERE site=?",
            tuple(merged.get(c) for c in _SITE_COLS) + (merged["updated_at"], site),
        )
    else:
        base = {c: "" for c in _SITE_COLS}
        base["cookies_mode"] = "auto"
        base["token_json"] = "{}"
        base.update(patch)
        db_run(
            f"INSERT INTO site_auth (site, {', '.join(_SITE_COLS)}, updated_at) "
            f"VALUES (?, {', '.join('?' for _ in _SITE_COLS)}, ?)",
            (site,) + tuple(base.get(c) for c in _SITE_COLS) + (_now(),),
        )


# ── tools (gallery-dl / ffmpeg / yt-dlp) ───────────────────────────────────
def _run_version(exe: str) -> str:
    try:
        out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=10,
                             env=sub_env(), creationflags=CREATE_NO_WINDOW)
        return (out.stdout or out.stderr).strip().splitlines()[0] if (out.stdout or out.stderr).strip() else ""
    except Exception:
        return ""


def gdl_version() -> str:
    return _run_version(gdl_bin()) or "unavailable"


# Keep in sync with the version in TOOL_SOURCES["gallery-dl"]. Bumping this in a
# Grabbr release is what prompts users to update their downloaded copy.
_latest_cache: Dict[str, tuple] = {}   # name -> (ts, version|None)
_DATE_RE = re.compile(r"(\d{4})[.\-](\d{2})[.\-](\d{2})")


def _num_tuple(v: str):
    parts = re.findall(r"\d+", v or "")
    return tuple(int(p) for p in parts) if parts else (0,)


def _ver_ge(installed: str, latest: str) -> bool:
    """Is `installed` at least as new as `latest`? Date-style compare when both
    look like YYYY.MM.DD (gdl-org / yt-dlp builds), else numeric-tuple."""
    di, dl = _DATE_RE.search(installed or ""), _DATE_RE.search(latest or "")
    if di and dl:
        return di.groups() >= dl.groups()
    return _num_tuple(installed) >= _num_tuple(latest)


def _cached_fetch(key: str, fn) -> Optional[str]:
    hit = _latest_cache.get(key)
    if hit and time.time() - hit[0] < 3600:
        return hit[1]
    try:
        val = fn() or None
    except Exception:
        val = None
    _latest_cache[key] = (time.time(), val)
    return val


def _gh_latest_tag(repo: str) -> Optional[str]:
    def fetch():
        req = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/releases/latest",
            headers={"User-Agent": "Grabbr", "Accept": "application/vnd.github+json"},
        )
        with urllib.request.urlopen(req, timeout=6) as r:
            return json.loads(r.read()).get("tag_name")
    return _cached_fetch(f"gh:{repo}", fetch)


def _ffmpeg_latest() -> Optional[str]:
    def fetch():
        req = urllib.request.Request(
            "https://www.gyan.dev/ffmpeg/builds/release-version",
            headers={"User-Agent": "Grabbr"},
        )
        with urllib.request.urlopen(req, timeout=6) as r:
            return r.read().decode("utf-8", "replace").strip()
    return _cached_fetch("ffmpeg:gyan", fetch)


def latest_version(name: str) -> Optional[str]:
    """Newest available (cached 1h). Returns None only if the feed is unreachable."""
    if name == "gallery-dl":
        return _gh_latest_tag("gdl-org/builds")
    if name == "yt-dlp":
        return _gh_latest_tag("yt-dlp/yt-dlp")
    if name == "ffmpeg":
        return _ffmpeg_latest()
    return None


def _ffmpeg_version(exe: str) -> str:
    try:
        out = subprocess.run([exe, "-version"], capture_output=True, text=True, timeout=10,
                             creationflags=CREATE_NO_WINDOW)
        m = re.search(r"ffmpeg version (\d[\w.]*)", out.stdout or "")
        return m.group(1).rstrip(".") if m else ((out.stdout or "").splitlines()[:1] or [""])[0]
    except Exception:
        return ""


def find_tool(name: str) -> dict:
    """Resolution + version + update state. name: gallery-dl | ffmpeg | yt-dlp"""
    downloaded = tool_path(name)
    on_path = shutil.which(name) or shutil.which(name + ".exe")
    exe = downloaded or on_path
    ver = ""
    if exe:
        ver = _ffmpeg_version(exe) if name == "ffmpeg" else _run_version(exe)
    latest = latest_version(name)
    if not exe:
        avail = "install"
    elif latest is None:
        avail = "installed"            # can't compare (ffmpeg), offer reinstall only
    elif _ver_ge(ver, latest):
        avail = "current"             # up to date
    else:
        avail = "update"
    return {
        "name": name,
        "found": bool(exe),
        "source": "downloaded" if downloaded else ("path" if on_path else None),
        "path": exe,
        "version": ver,
        "latest": latest,
        "avail": avail,
        "size": (Path(downloaded).stat().st_size if downloaded and Path(downloaded).exists() else None),
    }


def tool_present(name: str) -> bool:
    return bool(tool_path(name)) or shutil.which(name) is not None or shutil.which(name + ".exe") is not None


# name -> (url, kind). kind "exe" = save directly; "zip" = extract bin/*.exe
# gallery-dl: gdl-org 64-bit build (the project's own release exe is 32-bit and
# needs the VC++ x86 redistributable).
TOOL_SOURCES = {
    "gallery-dl": (
        "https://github.com/gdl-org/builds/releases/latest/download/gallery-dl_windows.exe", "exe"),
    "yt-dlp": (
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", "exe"),
    "ffmpeg": (
        "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", "zip"),
}
TOOL_APPROX_MB = {"gallery-dl": 23, "yt-dlp": 18, "ffmpeg": 110}

_tool_state: Dict[str, dict] = {}   # name -> {status, pct, error}


def _install_tool_blocking(name: str, loop):
    import urllib.request
    import zipfile
    import tempfile

    url, kind = TOOL_SOURCES[name]
    _tool_state[name] = {"status": "downloading", "pct": 0}

    def emit(**kw):
        _tool_state[name] = {**_tool_state.get(name, {}), **kw}
        try:
            asyncio.run_coroutine_threadsafe(
                ws_manager.broadcast({"type": "tool.progress", "name": name, **_tool_state[name]}), loop)
        except Exception:
            pass

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Grabbr"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            total = int(resp.headers.get("Content-Length") or 0)
            suffix = ".zip" if kind == "zip" else _EXE
            tmp = Path(tempfile.gettempdir()) / f"grabbr-{name}{suffix}"
            got = 0
            last = 0.0
            with open(tmp, "wb") as f:
                while True:
                    buf = resp.read(262144)
                    if not buf:
                        break
                    f.write(buf)
                    got += len(buf)
                    if total and time.monotonic() - last > 0.4:
                        last = time.monotonic()
                        emit(status="downloading", pct=round(got * 100 / total))

        emit(status="installing", pct=100)
        if kind == "exe":
            dest = TOOLS_DIR / f"{name}{_EXE}"
            shutil.move(str(tmp), str(dest))
        else:
            with zipfile.ZipFile(tmp) as z:
                members = [m for m in z.namelist() if re.search(r"/bin/(ffmpeg|ffprobe)\.exe$", m)]
                for m in members:
                    data = z.read(m)
                    out_name = m.rsplit("/", 1)[-1]
                    (TOOLS_DIR / out_name).write_bytes(data)
            tmp.unlink(missing_ok=True)

        emit(status="done", pct=100)
    except Exception as e:
        log.error("tool install %s failed: %s", name, e)
        emit(status="error", error=str(e))


# ── models ─────────────────────────────────────────────────────────────────
class JobCreate(BaseModel):
    urls: List[str]
    options: Optional[dict] = None


class SettingsIn(BaseModel):
    output_dir: Optional[str] = None
    filename_format: Optional[str] = None
    folder_structure: Optional[str] = None
    folder_custom: Optional[str] = None
    default_range: Optional[str] = None
    max_concurrent: Optional[int] = None
    rate_limit: Optional[str] = None
    proxy: Optional[str] = None
    sleep_request: Optional[float] = None
    retries: Optional[int] = None
    skip_existing: Optional[bool] = None
    write_metadata: Optional[bool] = None
    notifications_enabled: Optional[bool] = None
    cookies_mode: Optional[str] = None
    cookies_browser: Optional[str] = None
    cookies_file: Optional[str] = None
    theme: Optional[str] = None
    language: Optional[str] = None
    autostart: Optional[bool] = None


class PreviewIn(BaseModel):
    url: str
    options: Optional[dict] = None


class SiteIn(BaseModel):
    cookies_mode: Optional[str] = None
    cookies_browser: Optional[str] = None
    cookies_file: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    token_json: Optional[str] = None
    instance: Optional[str] = None


class VerifyIn(BaseModel):
    probe_url: str


class CookieImportIn(BaseModel):
    path: Optional[str] = None   # a local cookies.txt to copy in
    text: Optional[str] = None   # or raw Netscape text
    name: Optional[str] = None   # target filename stem (e.g. the site id)


# ── app ────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await manager.start()
    log.info("Grabbr backend ready on :%d - gallery-dl: %s", PORT, gdl_bin())
    yield


app = FastAPI(title="Grabbr", lifespan=lifespan)

# The backend binds to loopback only, but any web page in any browser can still
# reach 127.0.0.1. Without a guard, a hostile page could read /api/config (which
# contains saved site passwords and OAuth tokens) or queue/delete downloads.
# The Electron shell passes a per-run secret via GRABBR_TOKEN; the renderer sends
# it as X-Grabbr-Token. When the token is unset (bare `python server.py`), the
# check is skipped so local development still works.
API_TOKEN = os.environ.get("GRABBR_TOKEN", "")
_ALLOWED_ORIGINS = {
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:8766", "http://127.0.0.1:8766", "null",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(_ALLOWED_ORIGINS) if API_TOKEN else ["*"],
    allow_methods=["*"], allow_headers=["*"],
)


@app.middleware("http")
async def _local_guard(request: Request, call_next):
    # DNS-rebinding guard: only answer when addressed as loopback.
    host = (request.headers.get("host") or "").rsplit(":", 1)[0]
    if host and host not in ("127.0.0.1", "localhost"):
        return JSONResponse({"detail": "bad host"}, status_code=403)
    path = request.url.path
    # OPTIONS is CORS preflight: no body, no side effects, and it can't carry the
    # token. Let CORSMiddleware answer it (it still enforces the origin allowlist).
    if API_TOKEN and request.method != "OPTIONS" and path.startswith("/api/") and path != "/api/":
        origin = request.headers.get("origin")
        if origin is not None and origin not in _ALLOWED_ORIGINS:
            return JSONResponse({"detail": "forbidden origin"}, status_code=403)
        # Header for XHR/fetch; query param for <img>/<video> loads that can't
        # set headers.
        sent = request.headers.get("x-grabbr-token") or request.query_params.get("token")
        if sent != API_TOKEN:
            return JSONResponse({"detail": "unauthorized"}, status_code=401)
    return await call_next(request)


api = APIRouter(prefix="/api")


@api.get("/")
def health():
    return {"ok": True, "app": "grabbr", "version": APP_VERSION}


@api.get("/env")
def env_info():
    return {
        "app_version": APP_VERSION,
        "gallery_dl_bin": gdl_bin(),
        "gallery_dl_version": gdl_version(),
        "ffmpeg": tool_present("ffmpeg"),
        "yt_dlp": tool_present("yt-dlp"),
        "data_dir": str(BASE_DIR),
        "tools_dir": str(TOOLS_DIR),
        "cookies_dir": str(COOKIES_DIR),
        "config_path": str(CONFIG_PATH),
        "archive": str(ARCHIVE_PATH),
        "cache": str(CACHE_PATH),
        "db": str(DB_PATH),
        "logs_dir": str(LOG_DIR),
        "output_dir": _abs_output(get_settings().get("output_dir")),
    }


@api.get("/cookies")
def cookies_folder():
    files = scan_cookie_folder()
    domains = sorted({d for f in files for d in f["domains"]})
    return {"dir": str(COOKIES_DIR), "files": files, "domains": domains,
            "merged": bool(files)}


_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_cookie_name(stem: str) -> str:
    stem = _SAFE_NAME.sub("-", (stem or "").strip()).strip("-.") or "cookies"
    return stem[:60] + ".txt"


@api.post("/cookies/import")
def cookies_import(body: CookieImportIn):
    """Copy a cookies.txt into the drop-in folder. Routing to the right site
    is by domain inside the file, so the name is only for humans / replacing."""
    if body.text is not None:
        text = body.text
    elif body.path:
        src = Path(body.path)
        if not src.is_file():
            raise HTTPException(400, "File not found")
        try:
            text = src.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            raise HTTPException(400, f"Could not read file: {e}")
    else:
        raise HTTPException(400, "Provide 'path' or 'text'")

    rows = list(_cookie_lines(text))
    if not rows:
        raise HTTPException(400, "No cookies found. Expected Netscape cookies.txt format.")

    stem = body.name or (Path(body.path).stem if body.path else "cookies")
    dest = COOKIES_DIR / _safe_cookie_name(stem)
    dest.write_text(text, encoding="utf-8")
    merge_cookie_folder()
    write_gdl_config()
    return {"ok": True, "file": dest.name,
            "domains": sorted(_parse_netscape_domains(dest)), "cookies": len(rows)}


@api.delete("/cookies/{name}")
def cookies_delete(name: str):
    target = (COOKIES_DIR / Path(name).name)
    if target.parent != COOKIES_DIR or not target.is_file():
        raise HTTPException(404, "Not found")
    target.unlink()
    merge_cookie_folder()
    write_gdl_config()
    return {"ok": True}


@api.get("/tools")
def list_tools():
    out = {}
    for name in ("gallery-dl", "yt-dlp", "ffmpeg"):
        info = find_tool(name)
        info["approx_mb"] = TOOL_APPROX_MB.get(name)
        info["progress"] = _tool_state.get(name, {})
        out[name] = info
    return out


@api.post("/tools/{name}/install")
async def install_tool(name: str):
    if name not in TOOL_SOURCES:
        raise HTTPException(400, f"Unknown tool '{name}'")
    if _tool_state.get(name, {}).get("status") in ("downloading", "installing"):
        return {"ok": True, "already": True}
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, _install_tool_blocking, name, loop)
    return {"ok": True}


# Chromium-family browsers hold an exclusive lock on their cookie DB while
# running, so gallery-dl can't read it. Firefox-family is fine while open.
CHROMIUM_FAMILY = {"chrome", "chromium", "edge", "brave", "opera", "operagx", "vivaldi", "thorium"}

_BROWSER_PROCS = {
    "firefox": ["firefox.exe"], "librewolf": ["librewolf.exe"],
    "zen": ["zen.exe"], "floorp": ["floorp.exe"],
    "chrome": ["chrome.exe"], "chromium": ["chrome.exe"],
    "edge": ["msedge.exe"], "brave": ["brave.exe"],
    "opera": ["opera.exe"], "operagx": ["opera.exe"],
    "vivaldi": ["vivaldi.exe"], "thorium": ["thorium.exe"],
    "safari": ["Safari"],
}


def _running_procs() -> set:
    if os.name != "nt":
        return set()
    try:
        out = subprocess.run(["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True, timeout=8,
                             creationflags=CREATE_NO_WINDOW)
        return {ln.split('","')[0].lstrip('"').lower() for ln in out.stdout.splitlines() if ln}
    except Exception:
        return set()


@api.get("/browsers")
def list_browsers():
    """Cookie-source browsers: which are installed, which are running, and
    whether running blocks cookie reads (Chromium family only)."""
    appdata = os.environ.get("APPDATA") or ""
    local = os.environ.get("LOCALAPPDATA") or ""
    home = str(Path.home())
    probes = {
        "firefox": [Path(appdata) / "Mozilla" / "Firefox" / "Profiles"],
        "librewolf": [Path(appdata) / "librewolf" / "Profiles"],
        "zen": [Path(appdata) / "zen" / "Profiles"],
        "floorp": [Path(appdata) / "Floorp" / "Profiles"],
        "chrome": [Path(local) / "Google" / "Chrome" / "User Data"],
        "chromium": [Path(local) / "Chromium" / "User Data"],
        "edge": [Path(local) / "Microsoft" / "Edge" / "User Data"],
        "brave": [Path(local) / "BraveSoftware" / "Brave-Browser" / "User Data"],
        "opera": [Path(appdata) / "Opera Software" / "Opera Stable"],
        "operagx": [Path(appdata) / "Opera Software" / "Opera GX Stable"],
        "vivaldi": [Path(local) / "Vivaldi" / "User Data"],
        "thorium": [Path(local) / "Thorium" / "User Data"],
        "safari": [Path(home) / "Library" / "Cookies"],
    }
    procs = _running_procs()
    result = []
    for b in COOKIE_BROWSERS:
        running = any(p.lower() in procs for p in _BROWSER_PROCS.get(b, []))
        result.append({
            "id": b,
            "detected": any(p.exists() for p in probes.get(b, [])),
            "running": running,
            "locks_cookies": b in CHROMIUM_FAMILY,
        })
    return result


@api.get("/config")
def read_config():
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


@api.post("/cache/clear")
def clear_cache():
    """Wipe regenerable caches: video-thumbnail frames and gallery-dl's own
    token/cursor cache. Downloads and site credentials are untouched."""
    removed = 0
    for p in THUMBS_DIR.glob("*"):
        if p.is_file():
            try:
                p.unlink()
                removed += 1
            except OSError:
                pass
    try:
        if CACHE_PATH.exists():
            CACHE_PATH.unlink()
            removed += 1
    except OSError:
        pass
    return {"ok": True, "removed": removed}


@api.get("/settings")
def read_settings():
    return get_settings()


@api.put("/settings")
async def write_settings(body: SettingsIn):
    cur = get_settings()
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    for k in ("skip_existing", "write_metadata", "notifications_enabled", "autostart"):
        if k in patch:
            patch[k] = 1 if patch[k] else 0
    merged = {**cur, **patch, "updated_at": _now()}
    cols = [
        "output_dir", "filename_format", "folder_structure", "folder_custom", "default_range", "max_concurrent",
        "rate_limit", "proxy", "sleep_request", "retries", "skip_existing", "write_metadata",
        "notifications_enabled",
        "cookies_mode", "cookies_browser", "cookies_file", "theme", "language", "autostart", "updated_at",
    ]
    db_run(
        f"UPDATE settings SET {', '.join(f'{c}=?' for c in cols)} WHERE id='singleton'",
        tuple(merged.get(c) for c in cols),
    )
    if "max_concurrent" in patch:
        await manager.set_concurrency(int(patch["max_concurrent"]))
    write_gdl_config()
    return get_settings()


@api.post("/jobs")
async def create_jobs(body: JobCreate):
    urls = [u.strip() for u in body.urls if u and u.strip()]
    if not urls:
        raise HTTPException(400, "No URLs provided")
    opts = dict(body.options or {})
    total = int(opts.pop("total", 0) or 0)  # optional expected count (from Preview)
    created = []
    for url in urls:
        job_id = uuid.uuid4().hex
        db_run(
            "INSERT INTO jobs (id, url, status, options_json, total, created_at) VALUES (?, ?, 'queued', ?, ?, ?)",
            (job_id, url, json.dumps(opts), total if len(urls) == 1 else 0, _now()),
        )
        row = _job_public(_job_row(job_id))
        created.append(row)
        await ws_manager.broadcast({"type": "job.update", "job": row})
        await manager.enqueue(job_id)
    return {"created": created}


@api.get("/jobs")
def list_jobs(status: Optional[str] = None, limit: int = Query(200, le=1000)):
    if status:
        rows = db_all("SELECT * FROM jobs WHERE status=? ORDER BY created_at DESC LIMIT ?", (status, limit))
    else:
        rows = db_all("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,))
    return [_job_public(r) for r in rows]


@api.get("/jobs/{job_id}")
def get_job(job_id: str):
    row = _job_row(job_id)
    if not row:
        raise HTTPException(404, "Job not found")
    return _job_public(row)


@api.get("/jobs/{job_id}/log")
def get_job_log(job_id: str):
    row = _job_row(job_id)
    if not row:
        raise HTTPException(404, "Job not found")
    p = Path(row.get("log_path") or "")
    return {"log": p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""}


_IMG_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif", ".jxl", ".svg"}
_VID_EXT = {".mp4", ".webm", ".mkv", ".mov", ".m4v", ".gifv"}


def _output_roots() -> List[Path]:
    roots = [Path(_abs_output(get_settings().get("output_dir")))]
    return [r.resolve() for r in roots if str(r)]


def _under_output(p: Path) -> bool:
    try:
        rp = p.resolve()
    except Exception:
        return False
    for root in _output_roots():
        try:
            rp.relative_to(root)
            return True
        except ValueError:
            continue
    return False


@api.get("/jobs/{job_id}/files")
def job_files(job_id: str, limit: int = Query(60, le=300)):
    row = _job_row(job_id)
    if not row:
        raise HTTPException(404, "Job not found")
    # Read the exact files this job wrote (recorded as it ran) instead of
    # scanning dest_dir: a directory scan can't tell one job's files apart
    # from another's when they share a flat destination folder, and was
    # blanked out entirely whenever gallery-dl printed no subfolder.
    try:
        paths = json.loads(row.get("files_json") or "[]")
    except Exception:
        paths = []

    out = []
    for raw in paths:
        p = Path(raw)
        ext = p.suffix.lower()
        kind = "image" if ext in _IMG_EXT else ("video" if ext in _VID_EXT else None)
        if not kind or not _under_output(p):
            continue
        try:
            if not p.is_file():
                continue
            st = p.stat()
        except OSError:
            continue
        out.append({"name": p.name, "path": str(p), "kind": kind,
                    "size": st.st_size, "mtime": st.st_mtime})
    out.sort(key=lambda f: f["mtime"], reverse=True)
    return {"files": out[:limit], "count": len(out), "root": row.get("dest_dir") or ""}


def _ffmpeg_bin() -> Optional[str]:
    return tool_path("ffmpeg") or shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")


def _video_thumb(p: Path) -> Optional[Path]:
    """Pull a single frame from a video with ffmpeg, cached under thumbs/.
    Returns the png path, or None if ffmpeg is missing or the grab fails."""
    try:
        st = p.stat()
    except OSError:
        return None
    key = hashlib.sha1(f"{p.resolve()}|{st.st_mtime_ns}|{st.st_size}".encode()).hexdigest()
    out = THUMBS_DIR / f"{key}.png"
    if out.exists():
        return out if out.stat().st_size > 0 else None
    ff = _ffmpeg_bin()
    if not ff:
        return None
    common = ["-frames:v", "1", "-vf", "scale=320:-2", "-an", str(out)]
    # A 1s seek gives a livelier frame; fall back to frame 0 for very short clips.
    for pre in (["-ss", "1", "-i", str(p)], ["-i", str(p)]):
        try:
            subprocess.run(
                [ff, "-y", "-loglevel", "error", *pre, *common],
                capture_output=True, timeout=20,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except Exception:
            return None
        if out.exists() and out.stat().st_size > 0:
            return out
    return None


@api.get("/thumb")
def thumb(path: str):
    p = Path(path)
    ext = p.suffix.lower()
    if not p.is_file() or not _under_output(p) or ext not in (_IMG_EXT | _VID_EXT):
        raise HTTPException(404, "Not found")
    if ext in _VID_EXT:
        frame = _video_thumb(p)
        if not frame:
            raise HTTPException(404, "No thumbnail")
        return FileResponse(str(frame), media_type="image/png")
    return FileResponse(str(p))


@api.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    if not _job_row(job_id):
        raise HTTPException(404, "Job not found")
    await manager.cancel(job_id)
    return {"ok": True}


@api.post("/jobs/{job_id}/retry")
async def retry_job(job_id: str):
    if not _job_row(job_id):
        raise HTTPException(404, "Job not found")
    db_run(
        """UPDATE jobs SET status='queued', files_ok=0, files_skipped=0, files_error=0, files_json='[]',
               error_text='', hint='', current_file='', return_code=NULL,
               started_at=NULL, finished_at=NULL WHERE id=?""",
        (job_id,),
    )
    await ws_manager.broadcast({"type": "job.update", "job": _job_public(_job_row(job_id))})
    await manager.enqueue(job_id)
    return {"ok": True}


@api.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    row = _job_row(job_id)
    if not row:
        raise HTTPException(404, "Job not found")
    if row["status"] == "running":
        await manager.cancel(job_id)
    db_run("DELETE FROM jobs WHERE id=?", (job_id,))
    try:
        Path(row.get("log_path") or "").unlink(missing_ok=True)
    except Exception:
        pass
    return {"ok": True}


@api.delete("/jobs/{job_id}/files")
async def delete_job_files(job_id: str):
    """Delete the files this job downloaded (its dest folder), then drop the
    history entry and log. Irreversible; the UI confirms first."""
    row = _job_row(job_id)
    if not row:
        raise HTTPException(404, "Job not found")
    if row["status"] == "running":
        await manager.cancel(job_id)

    raw = (row.get("dest_dir") or "").strip()
    base = Path(raw) if raw else None
    base_r = None
    if base:
        try:
            base_r = base.resolve()
        except Exception:
            base_r = None
    # Must be a real per-job subfolder under a download root, never the root
    # itself and never something outside it.
    deletable = bool(base_r and base.is_dir() and base_r.is_absolute()
                      and _under_output(base) and base_r not in _output_roots())

    if base and base.is_dir() and not deletable:
        # dest_dir exists but is a shared/root folder (e.g. Folder structure
        # is "One flat folder") - refuse rather than silently drop the history
        # entry while leaving every other job's files sitting right there.
        raise HTTPException(
            409,
            "These files share the main download folder with other downloads, "
            "so they can't be deleted individually. Use Remove to clear this "
            "history entry instead, or delete files from the folder directly.",
        )

    removed = 0
    if deletable:
        removed = sum(1 for p in base.rglob("*") if p.is_file())
        shutil.rmtree(base, ignore_errors=True)

    db_run("DELETE FROM jobs WHERE id=?", (job_id,))
    try:
        Path(row.get("log_path") or "").unlink(missing_ok=True)
    except Exception:
        pass
    return {"ok": True, "removed": removed, "dir": raw}


@api.delete("/jobs")
def clear_finished():
    rows = db_all("SELECT log_path FROM jobs WHERE status IN ('done','error','canceled')")
    db_run("DELETE FROM jobs WHERE status IN ('done','error','canceled')")
    for r in rows:
        try:
            Path(r.get("log_path") or "").unlink(missing_ok=True)
        except Exception:
            pass
    return {"ok": True}


@api.post("/preview")
async def preview(body: PreviewIn):
    if not body.url.strip():
        raise HTTPException(400, "URL required")
    return await run_preview(body.url.strip(), body.options)


# ── sites / per-site auth ───────────────────────────────────────────────────
@api.get("/sites")
def list_sites():
    return {s["site"]: s for s in get_sites()}


@api.get("/sites/{site}")
def get_site(site: str):
    return db_one("SELECT * FROM site_auth WHERE site=?", (site,)) or {"site": site, "cookies_mode": "auto"}


@api.put("/sites/{site}")
def put_site(site: str, body: SiteIn):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    _upsert_site(site, patch)
    write_gdl_config()
    return db_one("SELECT * FROM site_auth WHERE site=?", (site,))


@api.delete("/sites/{site}")
def delete_site(site: str):
    db_run("DELETE FROM site_auth WHERE site=?", (site,))
    write_gdl_config()
    return {"ok": True}


@api.post("/sites/{site}/verify")
async def verify_site(site: str, body: VerifyIn):
    write_gdl_config()
    argv = build_argv(body.probe_url.strip(), get_settings(), simulate=True)
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            env=sub_env(), creationflags=CREATE_NO_WINDOW, cwd=str(BASE_DIR),
        )
        out_b, _ = await asyncio.wait_for(proc.communicate(), timeout=45)
    except asyncio.TimeoutError:
        proc.kill()
        return {"ok": False, "message": "Timed out"}
    except FileNotFoundError:
        raise HTTPException(500, "gallery-dl not found")
    out = out_b.decode("utf-8", errors="replace")
    ok = proc.returncode == 0 and not _AUTH_ERR.search(out)
    last = [l for l in out.splitlines() if l.strip()][-1:] or [""]
    return {"ok": ok, "return_code": proc.returncode, "message": last[0][:300], "needs_auth": bool(_AUTH_ERR.search(out))}


@api.post("/sites/{site}/oauth")
async def start_oauth(site: str):
    if site not in OAUTH_SITES:
        raise HTTPException(400, f"'{site}' has no gallery-dl OAuth helper")
    target = f"oauth:{site}"
    if site == "mastodon":
        row = db_one("SELECT instance FROM site_auth WHERE site='mastodon'")
        inst = (row or {}).get("instance") or ""
        if not inst:
            raise HTTPException(400, "Set the Mastodon instance first")
        target = f"oauth:mastodon:{inst}"
    run = OAuthRun()
    _oauth_runs[site] = run
    asyncio.create_task(_oauth_worker(site, run, target))
    for _ in range(60):  # wait up to ~6s for the URL to appear
        if run.url or run.done:
            break
        await asyncio.sleep(0.1)
    return {"url": run.url, "done": run.done, "ok": run.ok, "error": run.error}


@api.get("/sites/{site}/oauth")
def oauth_status(site: str):
    run = _oauth_runs.get(site)
    if not run:
        return {"running": False}
    return {"running": not run.done, "url": run.url, "done": run.done,
            "ok": run.ok, "keys": list(run.keys), "error": run.error}


@api.delete("/sites/{site}/oauth")
async def cancel_oauth(site: str):
    run = _oauth_runs.get(site)
    if run and run.proc and run.proc.returncode is None:
        try:
            if os.name == "nt":
                await asyncio.to_thread(
                    subprocess.run, ["taskkill", "/F", "/T", "/PID", str(run.proc.pid)],
                    capture_output=True, timeout=5, creationflags=CREATE_NO_WINDOW)
            else:
                run.proc.kill()
        except Exception:
            pass
        run.done, run.error = True, "Canceled."
    return {"ok": True}


@app.websocket("/api/ws")
async def ws_endpoint(ws: WebSocket):
    if API_TOKEN and ws.query_params.get("token") != API_TOKEN:
        await ws.close(code=1008)
        return
    await ws_manager.connect(ws)
    try:
        snap = [_job_public(r) for r in db_all(
            "SELECT * FROM jobs WHERE status IN ('queued','running') ORDER BY created_at")]
        await ws.send_text(json.dumps({"type": "snapshot", "jobs": snap}, default=str))
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        ws_manager.disconnect(ws)


app.include_router(api)


def _watch_parent_and_exit():
    """GRABBR_PARENT_PID is the Electron process that spawned us. Task Manager
    doesn't group this windowless process under the app's entry (that grouping
    is by window ownership, not the actual process tree), so "End Task" on
    Grabbr never reaches us - we'd otherwise be orphaned, left holding the
    port with a token no later launch can ever match. Exit the instant that
    process is gone, by any means: normal quit, crash, or a kill."""
    pid = os.environ.get("GRABBR_PARENT_PID")
    if not pid or os.name != "nt":
        return
    PROCESS_SYNCHRONIZE = 0x00100000
    INFINITE = 0xFFFFFFFF
    handle = ctypes.windll.kernel32.OpenProcess(PROCESS_SYNCHRONIZE, False, int(pid))
    if not handle:
        return
    ctypes.windll.kernel32.WaitForSingleObject(handle, INFINITE)
    log.warning("Parent process %s exited; shutting down.", pid)
    os._exit(0)


if __name__ == "__main__":
    threading.Thread(target=_watch_parent_and_exit, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
