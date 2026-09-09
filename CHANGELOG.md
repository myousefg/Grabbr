# Changelog

All notable changes to Grabbr are recorded here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Paste-and-go download queue with live progress over WebSocket
- Preview (gallery-dl `--simulate` dry run) before committing
- Download modes: Auto, Whole page (`generic:`), Scan page for galleries (`r:`)
- Range field (grab the newest N, or a slice like `8-20`)
- "Ignore archive" per-run toggle (re-download files removed from disk)
- Proxy setting (Engine)
- History: compact rows, thumbnail grid on expand, search + status filter
- Sites page: per-site cookies / username+password / OAuth, with a `--simulate` verify
- Cookie drop-in folder: put any number of `cookies.txt` exports in one place,
  Grabbr merges them and routes each to the right site by domain
- Tools installer for gallery-dl, FFmpeg, yt-dlp with install / update / up-to-date states
- Folder-structure control (site/uploader, site only, flat, custom)
- Auto-detect installed browsers; warn when a Chromium browser is running (locked cookies)
- Rate-limit detection with an advisory cooldown
- Desktop notifications on job finish / failure / queue drained
- Drag-and-drop URLs or a `.txt` file onto the URL box
- Autosave settings (no Save button)
- Bilingual UI (English, Bahasa Indonesia); light / dark / system theme
- Tray, single-instance lock, start-with-Windows

### Notes
- gallery-dl's Instagram / TikTok profile scraping is inherently fragile and rate-limited;
  single post/video URLs are more reliable
- OAuth token write after a real browser sign-in is coded but not yet verified end to end

## [1.0.0] - unreleased

Initial build.
