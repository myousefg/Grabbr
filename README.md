<div align="center">

# Grabbr

### Paste a URL. Grabbr does the rest.

Grabbr is a native desktop GUI for [`gallery-dl`](https://codeberg.org/mikf/gallery-dl). Paste
gallery, profile, or tag-search URLs and watch them download with a live queue, per-job progress,
a streaming log, a searchable history, per-site logins, and a one-click tool installer. No command
line, no hand-editing a JSON config.

[![Version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)](https://github.com/myousefg/Grabbr/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=flat-square)](#)
[![Stack](https://img.shields.io/badge/stack-Electron%20%2B%20React%20%2B%20Python-informational?style=flat-square)](#)

</div>

---

## Contents

- [Install](#install)
- [What it does](#what-it-does)
- [Download modes: Auto, Whole page, Scan](#download-modes)
- [Does Auto get full albums or just thumbnails?](#does-auto-get-full-albums)
- [Cookies and per-site logins](#cookies-and-per-site-logins)
- [The Chromium cookie lock (why Firefox is recommended)](#the-chromium-cookie-lock)
- [Instagram notes](#instagram-notes)
- [Tools: gallery-dl, FFmpeg, yt-dlp](#tools)
- [Where Grabbr keeps its files](#where-grabbr-keeps-its-files)
- [Does anything need to stay open?](#does-anything-need-to-stay-open)
- [Settings reference](#settings-reference)
- [Tech stack](#tech-stack)
- [Getting started (dev)](#getting-started-dev)
- [Building the installer](#building-the-installer)
- [Project structure](#project-structure)
- [Gotchas](#gotchas)

---

## What it does

- **Paste-and-go queue**: one URL or many, one per line. Each becomes its own job.
- **Parallel downloads**: configurable concurrency. Set it to 0 to pause the queue.
- **Live progress over WebSocket**: files done / skipped / errored, current filename, and a
  streaming log console per job.
- **Preview**: a `gallery-dl --simulate` dry run listing the files that *would* download, before
  you commit.
- **History**: every finished job, searchable, with re-download, open-folder, and view-log.
- **Sites page**: per-site logins for ~30 sites: browser cookies, `cookies.txt`, username and
  password, or OAuth.
- **Tools installer**: download gallery-dl, FFmpeg, and yt-dlp into Grabbr with one click, with
  install / update / up-to-date states.
- **Skip already-downloaded**: a shared download archive, so re-running a URL only grabs new files.
- **Folder structure control**: per-site subfolders (default), site-only, one flat folder, or a
  custom template.
- **Bilingual UI**: English and Bahasa Indonesia.
- **Light / Dark / System theme.**
- **Tray, single-instance, start-with-Windows.**

Grabbr is its own application. Everything it stores lives in one data folder. It runs gallery-dl
with `--config-ignore`, so it never reads or writes a gallery-dl config or cache you use from the
command line.

---

## Install

**Windows 10 or 11, 64-bit.**

1. Download **`Grabbr-Setup-1.0.0.exe`** from the
   [latest release](https://github.com/myousefg/Grabbr/releases/latest).
2. Run it. Because the build is not code-signed, Windows SmartScreen may show a blue warning:
   click **More info**, then **Run anyway**.
3. It installs into your user profile (no administrator prompt) and launches.

That is the whole setup. gallery-dl is bundled. FFmpeg and yt-dlp are optional and download from
inside the app (Settings, Tools) only if you grab video.

- **Update:** download the newer installer and run it over the top.
- **Uninstall:** *Add or remove programs*. To also clear the database, logs, and downloaded tools,
  delete `%APPDATA%\Grabbr` afterwards. Your downloaded media is never in there, it stays in the
  download folder you chose.
- **Verify the download (optional):** each release also ships `checksum.txt`; compare it with
  `Get-FileHash Grabbr-Setup-1.0.0.exe` in PowerShell.

Want to build it yourself instead? See [Building the installer](#building-the-installer).

---

## Download modes

The dropdown next to the Download button. Grabbr passes your URL straight to gallery-dl, so a mode
is just a prefix on the URL.

| Mode | gallery-dl | What it does |
| --- | --- | --- |
| **Auto** | *(none)* | Uses the site's dedicated extractor, matched by domain. Talks to the site's real data or API, paginates through everything, opens each post, downloads originals. This is what you want for Instagram, Twitter/X, Reddit, Pixiv, DeviantArt, boorus, and every other supported site. |
| **Whole page** | `generic:` | No extractor. Downloads the page's HTML and scrapes image URLs found in the source. No login, no JavaScript, no pagination, does not follow into posts. Good for a plain static image page (a photographer's gallery page, a wiki page, a forum thread with inline images). On a JavaScript app like Instagram it only finds page chrome (logos, icons). |
| **Scan page for galleries** | `r:` | Fetches the page, extracts every link, and runs each link back through Auto. Links to sites gallery-dl supports get downloaded; the rest are skipped. Use it for a blog post or a pastebin that links to several imgur / pixiv / twitter galleries. It does **not** scrape images off the page itself. |

Mental model:

- **Auto**: "this is a site I know, get everything from it properly"
- **Whole page**: "this is just a webpage, grab the images in its HTML"
- **Scan**: "this is a page full of links, download each link that points to a site I know"

If you pick Whole page or Scan for a URL that *does* have a dedicated extractor (Instagram, Twitter,
etc.), Grabbr shows a warning telling you to use Auto.

---

## Does Auto get full albums?

Yes. That is the whole point of the dedicated extractors. For `https://www.instagram.com/USER/` in
Auto mode gallery-dl will:

1. Enumerate the **entire profile**, every post, paginating through the site's API.
2. For each post, open its data and download **every image and video in it at original
   resolution**.
3. A four-image carousel gives you four files, named so they stay grouped
   (`instagram/USER/<sidecar_id>_<media_id>.jpg`).

It never touches the grid thumbnails you see on the profile page. Those are the site's frontend;
gallery-dl goes through the API and pulls the originals.

Instagram-specific: a plain profile URL gets the **feed posts**. Stories, highlights, reels, and
tagged posts are separate URLs (`instagram.com/stories/USER/`, `instagram.com/USER/reels/`, and so
on), each handled on its own.

---

## Cookies and per-site logins

Most sites need no login (boorus, public Reddit, direct links). Some need it:

| Tier | Sites | What to provide |
| --- | --- | --- |
| **Cookies required** | Instagram, Twitter/X (protected / NSFW / rate-limited), Patreon, Pixiv FANBOX, Fantia | browser cookies or a `cookies.txt` file |
| **Username + password** *(optional, raises limits)* | Danbooru, e621, MangaDex, Inkbunny, Sankaku, Zerochan, Tapas, Aryion, Idol Complex, Pillowfort, ImgBB, and more; **nijie requires it** | set on the Sites page |
| **OAuth token** | Reddit, DeviantArt, Flickr, Tumblr, SmugMug, Mastodon *(all optional)*; **Pixiv needs a refresh-token** | Authorize button on the Sites page runs `gallery-dl oauth:<site>` and stores the token |

Cookie handling is one model, set at the top of the **Sites** page:

- **Browser**: pick a browser and Grabbr reads its cookies with gallery-dl's
  `--cookies-from-browser`, no export step. It detects which browsers are installed and running.
  This is the base for every site.
- **Cookie folder**: drop any number of `cookies.txt` exports into `%APPDATA%\Grabbr\cookies\`.
  Grabbr merges them and applies each to the matching site by domain. A folder file overrides the
  browser for the sites it covers.

Each cookie site also has an **Upload cookies.txt** button that drops a file straight into that
folder for you. Username/password and OAuth sit on the same per-site rows.

---

## The Chromium cookie lock

**Chromium-family browsers (Chrome, Edge, Brave, Opera, Opera GX, Vivaldi) hold an exclusive lock
on their cookie database while running.** gallery-dl reads that file directly, so it cannot get in.
The error looks like:

```
[instagram][warning] cookies: [Errno 13] Permission denied: '...\Network\Cookies'
```

Verified: there is no workaround. A copy, a shared-mode open, nothing succeeds while the browser
runs. Your options:

1. **Use Firefox** *(recommended)*. Firefox does not lock its cookie file. Log into the site in
   Firefox once, set the browser to Firefox, and it just works, open or closed.
2. **Fully quit the Chromium browser** (including its tray icon), then download.
3. **Export a `cookies.txt`** with a "Get cookies.txt" browser extension and point the site at the
   file on the Sites page. This works with the browser open, because the extension reads cookies
   through the browser API, not the file.

Grabbr shows an amber warning under the browser picker when the selected Chromium browser is
running, and a failed job gets a "can't read your browser's cookies while it's open" hint linking
to the Sites page.

Opera GX is listed separately from Opera. It maps to `opera` plus the Opera GX profile path.

---

## Instagram notes

- Instagram serves nothing to an anonymous request, so Auto mode needs cookies (see above).
- gallery-dl's Instagram extractor is historically fragile. Instagram changes their API often and
  actively fights scrapers, so it breaks and gets fixed in cycles.
- **Rate limiting.** If you retry the same profile many times in a short window, Instagram
  soft-blocks your IP and every request comes back as `HTTP 429` or "HTTP redirect to home page",
  even with valid cookies. Wait 30-60 minutes and set **Sleep between requests** to 2-5 seconds in
  Settings. Do not spam Retry.
- If cookies are being read (`[cookies][info] Extracted N cookies from Firefox` in the log) but you
  still get redirected home, that is Instagram rejecting the request, not a Grabbr or cookie
  problem.

---

## Tools

**Settings → Tools.** Grabbr keeps its own copies of these in the data folder so it does not depend
on anything being on your `PATH`.

| Tool | Purpose | Update check |
| --- | --- | --- |
| **gallery-dl** | the download engine | pinned to the version Grabbr ships with |
| **FFmpeg** | converts Pixiv ugoira to video | none (no clean version feed) |
| **yt-dlp** | HLS/DASH video downloads | checked against yt-dlp's latest GitHub release |

Each row is one of: **Not installed** (Install button) · **Update available** (Update button, shows
the newer version) · **Up to date** (no button) · **Installed** (FFmpeg, Reinstall only). Downloads
show a live progress bar. Once installed, gallery-dl subprocesses run with the tools folder on
`PATH`, so a downloaded FFmpeg or yt-dlp is found automatically.

If gallery-dl is already on your `PATH` (e.g. `pip install gallery-dl`), Grabbr uses that until you
install its own copy, which then takes precedence.

---

## Where Grabbr keeps its files

Everything is under one folder: **`%APPDATA%\Grabbr\`**
(`C:\Users\<you>\AppData\Roaming\Grabbr\`).

| Path | What |
| --- | --- |
| `grabbr.db` | jobs, settings, per-site logins (SQLite) |
| `gallery-dl.json` | the config Grabbr generates and hands to gallery-dl |
| `gallery-dl-cache.sqlite3` | gallery-dl's own token / cursor cache (redirected here) |
| `archive.sqlite` | the "skip already-downloaded" list |
| `logs\grabbr.log` | backend log |
| `logs\jobs\<id>.log` | one raw gallery-dl log per job |
| `tools\` | gallery-dl.exe, ffmpeg.exe, ffprobe.exe, yt-dlp.exe (when installed) |

**Downloads are separate**, your Downloads-folder setting, so you can keep the files on another
drive. Settings has a **Files** section with all of this and an "Open in Explorer" button.

To relocate the whole data folder, set the `GRABBR_DATA` environment variable before launch;
everything above moves together.

Uninstalling = remove the app and delete `%APPDATA%\Grabbr\`. Grabbr never writes to
`%APPDATA%\gallery-dl\`.

---

## Does anything need to stay open?

- **The browser: no.** Firefox can be open or closed. You only need to have logged into the site
  in it once so the cookie exists. (Chromium browsers must be *closed*, see the lock section.)
- **Grabbr: yes, while downloads are running.** The download engine is Grabbr's backend, started
  by the app. Closing the window sends Grabbr to the tray and downloads keep going. Choosing
  **Exit** from the tray menu stops the backend and cancels running and queued jobs.

---

## Settings reference

| Group | Setting |
| --- | --- |
| Output | Download folder · filename format · folder structure (site/uploader, site-only, flat, custom) |
| Engine | Parallel downloads · rate limit · sleep between requests · retries · skip already-downloaded · write metadata JSON |
| Cookies and Auth | lives on the Sites page: a browser picker plus the drop-in cookie folder |
| Appearance | theme · language · start with Windows |
| Tools | gallery-dl / FFmpeg / yt-dlp install and update |
| Files | data folder and downloads folder, with Open buttons |

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Desktop shell | Electron 33, tray, single-instance lock, folder/file pickers, backend process, gallery-dl path resolution |
| UI | React 19 + craco + shadcn/ui (JavaScript, not TSX) + Tailwind CSS, HashRouter |
| Backend | Python 3.10+ · FastAPI · SQLite · asyncio job engine |
| Download engine | bundled `gallery-dl.exe`, one subprocess per job, stdout parsed line by line |
| Live updates | WebSocket at `/api/ws` |
| Packaging | PyInstaller + electron-builder (NSIS) |

Backend runs on `127.0.0.1:8766` (Foldr uses 8765, so both can run side by side).

---

## Getting started (dev)

### Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | 18+ |
| Python | 3.10+ |
| Yarn | any (`npm install -g yarn`) |

### First run

```bash
py scripts\make-icon.py  :: regenerate electron\assets\icon.* (only if you change the design)
scripts\fetch-gdl.bat    :: downloads bin\gallery-dl.exe (optional, the Tools button also does this at runtime)
scripts\dev.bat          :: installs all deps, then opens the Electron window
```

`dev.bat` still starts if `bin\gallery-dl.exe` is missing, the backend falls back to a `gallery-dl`
on your `PATH`, and you can install one from Settings → Tools.

| Changed | Restart? |
| --- | --- |
| Any React file | No, hot reload |
| `backend\server.py` | Yes, re-run `scripts\dev.bat` |
| `electron\main.js` or `preload.js` | Yes |
| `frontend\package.json` (new package) | `cd frontend && yarn install`, then restart |

---

## Building the installer

```bash
scripts\build-exe.bat
```

Runs, in order:

```
0. fetch-gdl        ->  bin\gallery-dl.exe (if missing)
1. PyInstaller      ->  backend\dist\grabbr-backend.exe
2. yarn build       ->  frontend\build\
3. electron-builder ->  dist\Grabbr-Setup-1.0.0.exe + checksum.txt
```

Both `grabbr-backend.exe` and `bin\gallery-dl.exe` ship as `extraResources`. Keep the version in
sync across `package.json`, `backend\version_info.txt`, and `scripts\build-exe.bat`.

---

## Project structure

```
grabbr/
├── electron/
│   ├── main.js          Window, tray, single-instance, backend spawn, gallery-dl path, open-external
│   └── preload.js        Folder/file pickers, open-path, notifications, auto-start
├── frontend/src/
│   ├── pages/            Dashboard.js · History.js · Sites.js · Settings.js
│   ├── components/       JobCard.js · PreviewDialog.js · Sidebar.js · Layout.js · ErrorBoundary.js
│   ├── context/          JobsProvider.js (WS + job/oauth/tool state) · ThemeProvider · I18nProvider
│   ├── lib/              api.js (REST + WS) · sites.js (site catalog) · electron.js
│   └── locales/          en.json · id.json
├── backend/
│   ├── server.py         FastAPI + SQLite + JobManager + WS + config generation + OAuth + tools
│   ├── requirements.txt
│   └── grabbr_backend.spec
├── bin/gallery-dl.exe    bundled engine, git-ignored, fetched
└── scripts/              dev.bat · fetch-gdl.bat · build-exe.bat · clean.bat
```

---

## Gotchas

- **stdout parsing is version-coupled.** The bundled gallery-dl version is pinned. Update it
  deliberately from Settings → Tools, not automatically.
- **Windows path length.** gallery-dl filename templates can exceed 260 characters. Keep the
  download folder shallow (default `%USERPROFILE%\Grabbr`) or enable Win32 long paths.
- **Cancel** relies on `CREATE_NEW_PROCESS_GROUP` + `CTRL_BREAK` then kill, Windows only.
- **gallery-dl engine build.** `fetch-gdl.bat` pulls the gdl-org 64-bit Windows build, which is
  self-contained. The gallery-dl project's own release exe is 32-bit and needs the Microsoft
  Visual C++ Redistributable (x86); Grabbr does not use it. To build from a source tree instead:
  `set GDL_SRC=...` then `scripts\fetch-gdl.bat build`.
- **API errors** (a 404 on a job that is already gone, a network blip) are caught and shown as a
  small toast, not a crash. A render error shows a recoverable "Something broke on this screen"
  card via the error boundary.

---

## License

MIT. See [LICENSE](LICENSE). Bundled tools (gallery-dl, yt-dlp, FFmpeg) keep their own licenses.

<div align="center"><sub>Built at Telkom University · 2026</sub></div>
