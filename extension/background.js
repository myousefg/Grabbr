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

// Lets the popup show connection state as soon as it opens, instead of only
// finding out whether pairing works when the user hits Send. Reuses the same
// /api/extension/ping the options page already checks a pasted code with.
async function checkConnection() {
  const secret = await getSecret();
  if (!secret) return { ok: false, reason: 'not-paired' };
  try {
    const res = await fetch(`${API_HOST}/api/extension/ping`, {
      headers: { 'X-Grabbr-Extension-Token': secret },
    });
    if (res.status === 401) return { ok: false, reason: 'unauthorized' };
    if (!res.ok) return { ok: false, reason: 'error' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

// Some sites (usually ones gallery-dl/yt-dlp have no extractor for) point a
// plain <video src="..."> straight at a CDN URL instead of exposing any
// download link - the same URL you'd otherwise have to dig out of
// chrome://.../media-internals by hand. Chrome's webRequest API sees that
// request the moment the page itself makes it, since it's watching real
// network traffic rather than reading page source the way gallery-dl/yt-dlp
// do - the same reason media-internals can see it and a page-source scraper
// can't. `type: 'media'` is what a real <video>/<audio> element's own
// request shows up as; it deliberately does NOT catch the fetch/XHR calls a
// MediaSource-based player (blob: URLs - YouTube, X/Twitter, most modern
// sites) uses to pull in segments, since those sites already have proper
// extractors and don't need this at all. First request per page load wins
// (a preroll ad or a second unrelated <video> firing later shouldn't
// override the one the user actually wants), cleared the moment that tab's
// main page navigates again.
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const key = `media_${details.tabId}`;
    if (details.type === 'main_frame') {
      chrome.storage.session.remove(key);
      return;
    }
    chrome.storage.session.get(key).then((got) => {
      if (got[key]) return; // first-seen-wins for this page load
      chrome.storage.session.set({ [key]: { url: details.url, ts: Date.now() } });
    });
  },
  { urls: ['<all_urls>'], types: ['media', 'main_frame'] },
);

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`media_${tabId}`);
});

async function getCapturedMedia(tabId) {
  const key = `media_${tabId}`;
  const got = await chrome.storage.session.get(key);
  return got[key] || null;
}

// The popup runs in its own context (MV3 has no shared module scope between
// it and this service worker), so it reaches sendUrls/checkConnection
// through a message instead of a direct call - this also keeps the pairing
// secret out of the popup's own code entirely.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'send') {
    sendUrls(msg.urls, msg.options).then(sendResponse);
    return true; // keep the message channel open for the async sendResponse
  }
  if (msg?.type === 'status') {
    checkConnection().then(sendResponse);
    return true;
  }
  if (msg?.type === 'captured-media') {
    getCapturedMedia(msg.tabId).then(sendResponse);
    return true;
  }
  return false;
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
