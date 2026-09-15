const API_HOST = 'http://127.0.0.1:8766';

const codeInput = document.getElementById('code');
const statusEl = document.getElementById('status');

function setStatus(text, ok) {
  statusEl.textContent = text;
  statusEl.className = ok === true ? 'ok' : (ok === false ? 'bad' : '');
}

async function load() {
  const { secret } = await chrome.storage.local.get('secret');
  if (secret) {
    codeInput.value = secret;
    setStatus('Connected.', true);
  } else {
    setStatus('Not connected.', null);
  }
}

async function testSecret(secret) {
  try {
    const res = await fetch(`${API_HOST}/api/extension/ping`, {
      headers: { 'X-Grabbr-Extension-Token': secret },
    });
    return res.ok;
  } catch {
    return false;
  }
}

document.getElementById('connect').addEventListener('click', async () => {
  const secret = codeInput.value.trim();
  if (!secret) return;
  setStatus('Checking…', null);
  const ok = await testSecret(secret);
  if (!ok) {
    setStatus("Couldn't connect. Make sure Grabbr is running and the code is current.", false);
    return;
  }
  await chrome.storage.local.set({ secret });
  setStatus('Connected.', true);
});

document.getElementById('disconnect').addEventListener('click', async () => {
  await chrome.storage.local.remove('secret');
  codeInput.value = '';
  setStatus('Not connected.', null);
});

load();
