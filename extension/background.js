// Grabbr browser extension - background service worker.
//
// Talks straight to the loopback backend that a running copy of Grabbr opens
// on this same machine (http://127.0.0.1:8766) - nothing here ever leaves
// localhost. Pairing works by asking Grabbr's own Settings page to mint a
// persistent secret (separate from the per-run token the Electron app uses
// internally, since this extension has no way to receive that one) and
// pasting it into options.html once; see options.js for that flow.

const API_HOST = 'http://127.0.0.1:8766';

async function getSecret() {
  const { secret } = await chrome.storage.local.get('secret');
  return secret || '';
}

async function sendUrls(urls, options) {
  const secret = await getSecret();
  if (!secret) {
    chrome.runtime.openOptionsPage();
    return { ok: false, reason: 'not-paired' };
  }
  try {
    const res = await fetch(`${API_HOST}/api/extension/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Grabbr-Extension-Token': secret,
      },
      body: JSON.stringify(options ? { urls, options } : { urls }),
    });
    if (res.status === 401) return { ok: false, reason: 'unauthorized' };
    if (!res.ok) return { ok: false, reason: 'error' };
    return { ok: true };
  } catch {
    // Grabbr isn't running, or nothing is listening on the port yet.
    return { ok: false, reason: 'offline' };
  }
}

// The popup runs in its own context (MV3 has no shared module scope between
// it and this service worker), so it reaches sendUrls through a message
// instead of a direct call - this also keeps the pairing secret out of the
// popup's own code entirely.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'send') return false;
  sendUrls(msg.urls, msg.options).then(sendResponse);
  return true; // keep the message channel open for the async sendResponse
});

const BADGE = {
  ok: { text: '✓', color: '#10b981' },
  offline: { text: '!', color: '#ef4444' },
  unauthorized: { text: '?', color: '#f59e0b' },
  error: { text: '!', color: '#ef4444' },
  'not-paired': { text: '?', color: '#f59e0b' },
};

async function flashBadge(result) {
  const badge = BADGE[result.ok ? 'ok' : result.reason] || BADGE.error;
  await chrome.action.setBadgeBackgroundColor({ color: badge.color });
  await chrome.action.setBadgeText({ text: badge.text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
}

// The toolbar button opens popup.html instead of firing this (a
// default_popup in the manifest means Chrome never dispatches onClicked at
// all); only the two context-menu entries below still go straight through
// with a badge flash, since they're already a single deliberate target.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'grabbr-send-link',
    title: 'Send link to Grabbr',
    contexts: ['link'],
  });
  chrome.contextMenus.create({
    id: 'grabbr-send-page',
    title: 'Send this page to Grabbr',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.menuItemId === 'grabbr-send-link' ? info.linkUrl : (info.pageUrl || tab?.url);
  if (!url) return;
  await flashBadge(await sendUrls([url]));
});
