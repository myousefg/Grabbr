// Popup for the toolbar button. Runs in its own context (separate from
// background.js's service worker), so it reaches the pairing secret and
// Grabbr's API only through a message to the background script - see the
// onMessage listener in background.js.

function isYoutube(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com';
  } catch {
    return false;
  }
}

const urlEl = document.getElementById('url');
const ytRow = document.getElementById('yt-row');
const qualityEl = document.getElementById('quality');
const formatEl = document.getElementById('format');
const sendBtn = document.getElementById('send');
const statusEl = document.getElementById('status');
const connEl = document.getElementById('conn');
const connTextEl = document.getElementById('conn-text');

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || '';
}

const CONN_MESSAGES = {
  'not-paired': ['Not connected', 'warn'],
  offline: ["Grabbr isn't running", 'bad'],
  unauthorized: ['Pairing revoked, reconnect below', 'bad'],
  error: ['Something went wrong', 'bad'],
};

async function refreshConnection() {
  const result = await chrome.runtime.sendMessage({ type: 'status' });
  if (result?.ok) {
    connEl.className = 'ok';
    connTextEl.textContent = 'Connected';
    return;
  }
  const [text, kind] = CONN_MESSAGES[result?.reason] || CONN_MESSAGES.error;
  connEl.className = kind;
  connTextEl.textContent = text;
}

let currentUrl = '';

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentUrl = tab?.url || '';
  const sendable = /^https?:\/\//.test(currentUrl);
  urlEl.textContent = sendable ? currentUrl : "This page can't be sent to Grabbr.";
  sendBtn.disabled = !sendable;
  ytRow.hidden = !isYoutube(currentUrl);
  refreshConnection();
}

sendBtn.addEventListener('click', async () => {
  sendBtn.disabled = true;
  setStatus('Sending…');
  const options = {};
  if (!ytRow.hidden) {
    if (qualityEl.value !== 'best') options.quality = qualityEl.value;
    if (formatEl.value !== 'mp4') options.format = formatEl.value;
  }
  let result;
  try {
    result = await chrome.runtime.sendMessage({
      type: 'send',
      urls: [currentUrl],
      options: Object.keys(options).length ? options : undefined,
    });
  } catch {
    result = { ok: false, reason: 'error' };
  }
  if (result?.ok) {
    setStatus('Sent to Grabbr.', 'ok');
    setTimeout(() => window.close(), 900);
    return;
  }
  const messages = {
    'not-paired': 'Not connected yet - opening setup…',
    offline: "Couldn't reach Grabbr. Is it running?",
    unauthorized: 'Pairing code is no longer valid. Reconnect below.',
  };
  setStatus(messages[result?.reason] || 'Something went wrong.', 'bad');
  sendBtn.disabled = false;
});

document.getElementById('options-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();
