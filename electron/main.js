const {
  app, BrowserWindow, Tray, Menu,
  ipcMain, dialog, shell, nativeImage, Notification,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs   = require('fs');
const http = require('http');

// Per-run secret shared with the backend so pages in the user's other browsers
// can't reach the loopback API (which exposes saved passwords / tokens).
const API_TOKEN = crypto.randomBytes(24).toString('hex');
process.env.GRABBR_TOKEN = API_TOKEN; // inherited by the renderer + backend

// Without this, Windows toasts show as "electron.app.Grabbr" (Electron's
// synthesized fallback ID) instead of the app name.
app.setAppUserModelId('Grabbr');

// ── Single instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on('ready', () => Menu.setApplicationMenu(null));

// ── Dev / prod detection ────────────────────────────────────────────────────
const BUILD_INDEX = path.join(__dirname, '..', 'frontend', 'build', 'index.html');
const DEV = !fs.existsSync(BUILD_INDEX);

const BACKEND_PORT = 8766;
const BACKEND_URL  = `http://127.0.0.1:${BACKEND_PORT}`;

// ── gallery-dl binary resolution ────────────────────────────────────────────
function resolveGdlBin() {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const candidates = DEV
    ? [path.join(__dirname, '..', 'bin', `gallery-dl${ext}`)]
    : [
        path.join(process.resourcesPath, 'bin', `gallery-dl${ext}`),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', `gallery-dl${ext}`),
      ];
  return candidates.find(p => fs.existsSync(p)) || '';
}

console.log(`[grabbr] mode=${DEV ? 'DEV' : 'PROD'}`);

// ── App auto-update (GitHub releases) ───────────────────────────────────────
// Checking is automatic on startup; downloading and installing stay a
// deliberate user action, same as the gallery-dl/ffmpeg/yt-dlp tools in
// Settings, rather than silently restarting the app on them.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function sendUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app-update-status', payload);
}

autoUpdater.on('checking-for-update', () => sendUpdateStatus({ status: 'checking' }));
autoUpdater.on('update-available', (info) => sendUpdateStatus({ status: 'available', version: info.version }));
autoUpdater.on('update-not-available', () => sendUpdateStatus({ status: 'current' }));
autoUpdater.on('error', (err) => sendUpdateStatus({ status: 'error', error: err?.message || String(err) }));
autoUpdater.on('download-progress', (p) => sendUpdateStatus({ status: 'downloading', pct: Math.round(p.percent) }));
autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ status: 'downloaded', version: info.version }));

let mainWindow  = null;
let tray        = null;
let backendProc = null;
let isQuitting  = false;
let queuePaused = false;
let savedConcurrency = 2;

const TRAY_ICON_PATH   = path.join(__dirname, 'assets', 'icon.ico');
const WINDOW_ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

// ── Backend process ─────────────────────────────────────────────────────────
function startBackend() {
  return new Promise((resolve, reject) => {
    const gdl = resolveGdlBin();
    const env = {
      ...process.env,
      GRABBR_PORT: String(BACKEND_PORT),
      // Default download folder for a first run, before the user picks one.
      GRABBR_DEFAULT_OUTPUT: path.join(app.getPath('downloads'), 'Grabbr'),
    };
    if (gdl) env.GRABBR_GDL_BIN = gdl;
    console.log('[grabbr] gallery-dl:', gdl || '(falling back to PATH)');

    if (DEV) {
      const script = path.join(__dirname, '..', 'backend', 'server.py');
      const py = process.platform === 'win32' ? 'py' : 'python3';
      backendProc = spawn(py, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    } else {
      const ext = process.platform === 'win32' ? '.exe' : '';
      const exe = path.join(process.resourcesPath, 'backend', `grabbr-backend${ext}`);
      backendProc = spawn(exe, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    }

    backendProc.stdout?.on('data', d => console.log('[py]', d.toString().trim()));
    backendProc.stderr?.on('data', d => console.warn('[py]', d.toString().trim()));
    backendProc.on('error', reject);

    const deadline = Date.now() + 25_000;
    const poll = setInterval(() => {
      if (Date.now() > deadline) {
        clearInterval(poll);
        return reject(new Error('Backend startup timeout'));
      }
      http.get(`${BACKEND_URL}/api/`, res => {
        if (res.statusCode === 200) { clearInterval(poll); console.log('[grabbr] Backend ready'); resolve(); }
      }).on('error', () => {});
    }, 500);
  });
}

function stopBackend() {
  if (!backendProc) return;
  const pid = backendProc.pid;
  // The frozen backend is a PyInstaller one-file exe: killing the bootloader
  // leaves the real Python child (and any gallery-dl it spawned) holding port
  // 8766, which breaks the next launch. Reap the whole tree.
  if (process.platform === 'win32' && pid) {
    try { spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { windowsHide: true }); }
    catch { /* fall through to kill() */ }
  }
  try { backendProc.kill(); } catch { /* already gone */ }
  backendProc = null;
}

function patchConcurrency(value) {
  const body = JSON.stringify({ max_concurrent: value });
  const req = http.request(
    { hostname: '127.0.0.1', port: BACKEND_PORT, path: '/api/settings', method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Grabbr-Token': API_TOKEN,
      } },
    () => {},
  );
  req.on('error', () => {});
  req.write(body);
  req.end();
}

// ── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1160, height: 760,
    minWidth: 960, minHeight: 640,
    title: 'Grabbr',
    icon: WINDOW_ICON_PATH,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // process.env set in main does NOT reach the renderer's process, so hand
      // the API token to the preload through argv instead.
      additionalArguments: [`--grabbr-token=${API_TOKEN}`],
    },
  });

  mainWindow.loadURL(DEV ? 'http://localhost:3000' : `file://${BUILD_INDEX}`);
  if (DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('close', e => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
}

// ── Tray ────────────────────────────────────────────────────────────────────
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Open Grabbr', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    {
      label: queuePaused ? 'Resume Queue' : 'Pause Queue',
      click: () => {
        queuePaused = !queuePaused;
        patchConcurrency(queuePaused ? 0 : savedConcurrency);
        tray.setContextMenu(buildTrayMenu());
        tray.setToolTip(queuePaused ? 'Grabbr (queue paused)' : 'Grabbr');
      },
    },
    { type: 'separator' },
    { label: 'Exit', click: () => { isQuitting = true; app.quit(); } },
  ]);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON_PATH));
  tray.setToolTip('Grabbr');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── IPC ─────────────────────────────────────────────────────────────────────
ipcMain.handle('select-folder', async (_, opts = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: opts.title || 'Select Folder',
    defaultPath: opts.defaultPath || app.getPath('home'),
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('select-file', async (_, opts = {}) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: opts.title || 'Select File',
    filters: opts.filters || [{ name: 'All Files', extensions: ['*'] }],
    defaultPath: opts.defaultPath || app.getPath('home'),
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('open-path', async (_, p) => {
  if (p && fs.existsSync(p)) { await shell.openPath(p); return true; }
  return false;
});

ipcMain.handle('open-external', async (_, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) { await shell.openExternal(url); return true; }
  return false;
});

ipcMain.handle('get-paths', async () => ({
  home:      app.getPath('home'),
  downloads: app.getPath('downloads'),
  documents: app.getPath('documents'),
  desktop:   app.getPath('desktop'),
  grabbr:    path.join(app.getPath('downloads'), 'Grabbr'),
}));

ipcMain.handle('show-notification', (_, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: false });
    n.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
    n.show();
  }
});

ipcMain.handle('set-tray-badge', (_, count) => {
  if (!tray) return;
  tray.setToolTip(
    count > 0 ? `Grabbr (${count} download${count !== 1 ? 's' : ''} active)`
              : queuePaused ? 'Grabbr (queue paused)' : 'Grabbr',
  );
});

ipcMain.handle('set-auto-start', (_, enable) => {
  app.setLoginItemSettings({ openAtLogin: enable, openAsHidden: true });
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('get-auto-start', () => app.getLoginItemSettings().openAtLogin);

ipcMain.handle('check-for-app-update', async () => {
  if (DEV) { sendUpdateStatus({ status: 'current' }); return; }
  try { await autoUpdater.checkForUpdates(); }
  catch (err) { sendUpdateStatus({ status: 'error', error: err?.message || String(err) }); }
});
ipcMain.handle('download-app-update', async () => {
  try { await autoUpdater.downloadUpdate(); }
  catch (err) { sendUpdateStatus({ status: 'error', error: err?.message || String(err) }); }
});
ipcMain.handle('install-app-update', () => {
  isQuitting = true;
  stopBackend();
  autoUpdater.quitAndInstall();
});

// ── Lifecycle ───────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();
  createTray();
  try {
    await startBackend();
    // Learn current concurrency so tray pause/resume can restore it.
    http.get(`${BACKEND_URL}/api/settings`, { headers: { 'X-Grabbr-Token': API_TOKEN } }, res => {
      let buf = '';
      res.on('data', d => (buf += d));
      res.on('end', () => { try { savedConcurrency = JSON.parse(buf).max_concurrent || 2; } catch {} });
    }).on('error', () => {});
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(DEV ? 'http://localhost:3000' : `file://${BUILD_INDEX}`);
    }
  } catch (err) {
    console.error('[grabbr] Backend failed:', err.message);
  }

  // Silent startup check; downloading and installing stay opt-in from Settings.
  if (!DEV) setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => { /* stay in tray */ });
app.on('before-quit', () => { isQuitting = true; stopBackend(); });
