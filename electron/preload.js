const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (opts) => ipcRenderer.invoke('select-folder', opts),
  selectFile:   (opts) => ipcRenderer.invoke('select-file', opts),
  openPath:     (p)    => ipcRenderer.invoke('open-path', p),
  openExternal: (url)  => ipcRenderer.invoke('open-external', url),
  getPaths:     ()     => ipcRenderer.invoke('get-paths'),
  notify:       (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  setTrayBadge: (count) => ipcRenderer.invoke('set-tray-badge', count),
  setAutoStart: (enable) => ipcRenderer.invoke('set-auto-start', enable),
  getAutoStart: ()     => ipcRenderer.invoke('get-auto-start'),
  apiToken: process.env.GRABBR_TOKEN || '',
  isElectron: true,
});
