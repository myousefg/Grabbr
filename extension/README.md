# Grabbr browser extension

Sends the current tab (or a right-clicked link) straight to Grabbr running on
this computer, instead of copy-pasting the URL into the app. Same-machine
only - it talks to `http://127.0.0.1:8766`, Grabbr's own loopback API, and
never leaves localhost.

## Install (not yet published to a store)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. In Grabbr, go to **Settings → Browser extension → Enable** and copy the
   pairing code.
5. Click the Grabbr toolbar icon, paste the code into the popup, and click
   **Connect**.

## Use

- Click the toolbar icon to open a small popup with the current tab's URL and
  a **Send to Grabbr** button. On a YouTube page it also shows the quality
  and format picker, same as the Dashboard's.
- Right-click a link (or the page) → **Send to Grabbr** sends it immediately,
  no popup - a green check flashes on success; a red `!` means Grabbr isn't
  running; an amber `?` means the pairing code was revoked or rotated -
  reconnect from the popup.
- On an unsupported website whose player points straight at a file Grabbr
  can't otherwise reach, the popup shows a **Use detected video link
  instead** checkbox when it spots one. Checked by default - sends the real
  file together with the page it came from, which most such sites need to
  allow the download at all.

## Security notes

- The pairing code is a separate, persistent secret from the one the desktop
  app uses internally - it's scoped to a single endpoint (`/api/extension/jobs`)
  that can only queue downloads. It can't read cookies, settings, or saved
  site credentials.
- Regenerating or disabling the extension from Grabbr's Settings immediately
  invalidates the old code.
- The unsupported-website fallback needs to watch network requests on any
  page (`webRequest` + `<all_urls>`) to spot a direct video link the moment
  the page itself requests it. It only ever looks at plain `<video>`/`<audio>`
  element requests, ignores everything else, and nothing leaves the browser
  until you actually click Send.
