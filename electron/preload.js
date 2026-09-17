const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Passed by main via webPreferences.additionalArguments (process.env does not
// cross into the renderer process); fall back to env for the dev stack.
const tokenArg = (process.argv.find(a => a.startsWith('--grabbr-token=')) || '');
const API_TOKEN = tokenArg.slice('--grabbr-token='.length) || process.env.GRABBR_TOKEN || '';

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (opts) => ipcRenderer.invoke('select-folder', opts),
  selectFile:   (opts) => ipcRenderer.invoke('select-file', opts),
  selectFiles:  (opts) => ipcRenderer.invoke('select-files', opts),
  // Electron 32+ removed File.path from the renderer for security; this is
  // the replacement - a dropped file's real filesystem path, resolved here
  // in preload (which still has Node/Electron access despite contextIsolation)
  // from the File object the drop handler already has.
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openPath:     (p)    => ipcRenderer.invoke('open-path', p),
  showInFolder: (p)    => ipcRenderer.invoke('show-in-folder', p),
  openExternal: (url)  => ipcRenderer.invoke('open-external', url),
  getPaths:     ()     => ipcRenderer.invoke('get-paths'),
  notify:       (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  setTrayBadge: (count) => ipcRenderer.invoke('set-tray-badge', count),
  setAutoStart: (enable) => ipcRenderer.invoke('set-auto-start', enable),
  getAutoStart: ()     => ipcRenderer.invoke('get-auto-start'),
  checkForAppUpdate:   () => ipcRenderer.invoke('check-for-app-update'),
  downloadAppUpdate:   () => ipcRenderer.invoke('download-app-update'),
  installAppUpdate:    () => ipcRenderer.invoke('install-app-update'),
  onAppUpdateStatus: (cb) => {
    const listener = (_, payload) => cb(payload);
    ipcRenderer.on('app-update-status', listener);
    return () => ipcRenderer.removeListener('app-update-status', listener);
  },
  apiToken: API_TOKEN,
  isElectron: true,
});
