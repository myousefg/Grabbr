# Changelog

All notable changes to Grabbr are recorded here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.2.0] - 2026-09-15

### Added
- Animation and visual-depth pass: route transitions, expandable panels (cookie/login rows,
  Advanced settings, job logs), and button/switch presses now animate with spring-based motion;
  cards and dialogs get a subtle elevation shadow instead of a flat 1px border
- Browser extension (Chrome/Edge, same machine only): send the current tab or a right-clicked
  link straight to Grabbr from the browser's toolbar button or context menu, paired to the app
  with a one-time code generated from Settings
- Custom gallery-dl config editor (Settings, Files): edit raw JSON overrides for anything
  Grabbr's own UI doesn't expose (per-site filters, postprocessors, custom headers); the
  overrides are layered on top of the generated config, so they survive normal settings changes
  instead of being overwritten

### Changed
- Settings section order: Files now comes right after Engine, ahead of Appearance
- Accessibility pass: keyboard focus now reaches every settings row (an info-tooltip button was
  previously unreachable by Tab), disclosure panels expose `aria-expanded`/`aria-controls`,
  icon-only buttons and bare inputs get proper labels, status changes are announced through ARIA
  live regions, and right-to-left locales (Arabic, Hebrew, Persian, Urdu) no longer mis-mirror
  icon spacing and floated elements

## [1.1.3] - 2026-09-15

### Added
- YouTube downloads: paste a YouTube link and it routes through yt-dlp instead of gallery-dl
  (which has no YouTube extractor), with a quality (1080p down to 360p, or best) and format
  (MP4 / MP3) picker next to the URL box
- GIF conversion: a Twitter/X "GIF" is really a looping MP4; Grabbr now detects that (via
  gallery-dl's own metadata, not a guess) and converts it to a real `.gif` with FFmpeg
  automatically, no setting required
- Full language support: 45 languages with a searchable picker (Settings, Appearance), automatic
  system-locale detection on first launch (falls back to English), lazy-loaded locale bundles so
  unused languages never hit the bundle, and right-to-left layout for Arabic, Hebrew, Persian, and
  Urdu

### Fixed
- Cancel could leave a yt-dlp process orphaned and still running: the watchdog killed the
  tracked process before running the tree-kill, so by the time it ran there was nothing left
  for it to find the child process through

## [1.1.2] - 2026-09-14

### Fixed
- The crash watchdog added in 1.1.1 could restart a backend that hadn't actually crashed (the
  packaged backend can briefly double-launch on a fresh build), eventually giving up and showing
  "couldn't be restarted" even though a working backend was still running; it now checks whether
  something is already answering on the port before acting
- A backend left over from a prior session (e.g. Grabbr closed via Task Manager instead of a
  normal quit) could keep holding its port with a stale security token no new session could ever
  match, leaving the sidebar stuck on "Offline" with no way to recover; every launch now clears
  anything already on the port first, and the backend now exits itself the instant Grabbr's own
  process is gone, by any means

### Changed
- Settings section order is Engine, Files, Appearance, Tools, About, Legal

## [1.1.1] - 2026-09-14

### Fixed
- Electron now watches the backend process and restarts it automatically (with a circuit breaker
  against crash-loops) if it dies mid-session, instead of leaving the sidebar stuck on "Offline"
  until you relaunch Grabbr
- A second, page-wide scrollbar could appear alongside the normal one (and scrolling it moved the
  whole app off-screen); caused by the row tooltips' hidden accessibility text escaping its
  scroll container

## [1.1.0] - 2026-09-13

### Added
- In-app auto-update: Settings, About checks GitHub for a newer Grabbr release (silent check on
  startup, manual "Check for updates" otherwise) and can download and install it without leaving
  the app, the same way the gallery-dl/FFmpeg/yt-dlp tools update
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
