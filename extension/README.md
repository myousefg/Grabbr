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
5. Right-click the Grabbr extension icon → **Options**, paste the code, and
   click **Connect**.

## Use

- Click the toolbar icon to send the current tab.
- Right-click a link (or the page) → **Send to Grabbr**.
- A green check flashes on success; a red `!` means Grabbr isn't running;
  an amber `?` means the pairing code was revoked or rotated - reconnect
  from the options page.

## Security notes

- The pairing code is a separate, persistent secret from the one the desktop
  app uses internally - it's scoped to a single endpoint (`/api/extension/jobs`)
  that can only queue downloads. It can't read cookies, settings, or saved
  site credentials.
- Regenerating or disabling the extension from Grabbr's Settings immediately
  invalidates the old code.
