# Changelog

All notable changes to Grabbr are recorded here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.1.0] - 2026-09-13

### Added
- Preview: pick exactly which files to download from the resolved list, not just all-or-nothing
- Settings: "Default limit" (moves the per-download range/limit out of the Dashboard into a
  persistent default), "Clear cache" (wipes generated thumbnails and gallery-dl's cache),
  "Update all" (installs/updates every outdated tool in one click), a Notifications on/off toggle
- Dashboard: rejects non-URL input before queueing instead of silently failing
- Queue & Active keeps a just-finished job visible for a few seconds (longer while its log is open)
  so a fast single-file download doesn't disappear before you can check it

### Changed
- Mode selector moved onto the Download/Preview row; output-folder settings and cookie config rows
  lost their permanently-visible explainer text in favor of a hover tooltip, and Settings' Engine
  section groups the rarely-used network options behind an "Advanced" disclosure
- "Skip already-downloaded" and the old separate "Ignore archive" default merged into one setting;
  they controlled the same underlying behavior
- Sidebar tagline is "Media Downloader" (Grabbr also handles video, not just images)
- Onboarding tour order now matches the sidebar's page order
- Preview dialog redesigned: per-file-type icons, a cleaner site header, whole-row click to
  select, and a retry button on failure

### Fixed
- Desktop notifications no longer fire a bogus extra "Queue finished" summary alongside almost
  every single completed download
- Windows notifications are labeled "Grabbr" instead of the fallback "electron.app.Grabbr"
- History thumbnails could come back empty for downloads that land directly in the download root
  (e.g. "One flat folder" structure) instead of a per-job subfolder
- "Delete files" in History could silently drop a history entry without deleting anything when its
  files shared the main download folder with other jobs; it's now disabled with an explanation in
  that case instead

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
