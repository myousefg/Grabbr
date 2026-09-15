import axios from 'axios';

// Shared secret from the Electron shell. Gates the loopback API so pages in the
// user's other browsers can't read it. Empty in a plain browser dev session
// (the backend then runs with the check disabled).
const API_TOKEN = (typeof window !== 'undefined' && window.electronAPI?.apiToken) || '';

export const API_HOST = 'http://127.0.0.1:8766';
export const WS_URL   = `ws://127.0.0.1:8766/api/ws${API_TOKEN ? `?token=${encodeURIComponent(API_TOKEN)}` : ''}`;

const api = axios.create({
  baseURL: `${API_HOST}/api`,
  headers: {
    'Content-Type': 'application/json',
    ...(API_TOKEN ? { 'X-Grabbr-Token': API_TOKEN } : {}),
  },
});

const tokenParam = API_TOKEN ? `&token=${encodeURIComponent(API_TOKEN)}` : '';
export const thumbUrl = (path) => `${API_HOST}/api/thumb?path=${encodeURIComponent(path)}${tokenParam}`;

export const jobsApi = {
  list:   (status)        => api.get('/jobs', { params: status ? { status } : {} }).then(r => r.data),
  get:    (id)            => api.get(`/jobs/${id}`).then(r => r.data),
  log:    (id)            => api.get(`/jobs/${id}/log`).then(r => r.data),
  files:  (id)            => api.get(`/jobs/${id}/files`).then(r => r.data),
  create: (urls, options) => api.post('/jobs', { urls, options }).then(r => r.data),
  cancel: (id)            => api.post(`/jobs/${id}/cancel`).then(r => r.data),
  pause:  (id)            => api.post(`/jobs/${id}/pause`).then(r => r.data),
  retry:  (id)            => api.post(`/jobs/${id}/retry`).then(r => r.data),
  remove: (id)            => api.delete(`/jobs/${id}`).then(r => r.data),
  deleteFiles: (id)       => api.delete(`/jobs/${id}/files`).then(r => r.data),
  clearFinished: ()       => api.delete('/jobs').then(r => r.data),
};

export const previewApi = {
  run: (url, options) => api.post('/preview', { url, options }).then(r => r.data),
};

export const settingsApi = {
  get:    (signal) => api.get('/settings', { signal }).then(r => r.data),
  update: (data)   => api.put('/settings', data).then(r => r.data),
};

export const envApi = {
  get:      () => api.get('/env').then(r => r.data),
  config:   () => api.get('/config').then(r => r.data),
  browsers: () => api.get('/browsers').then(r => r.data),
  cookies:  () => api.get('/cookies').then(r => r.data),
  importCookies: (body) => api.post('/cookies/import', body).then(r => r.data),
  deleteCookieFile: (name) => api.delete(`/cookies/${encodeURIComponent(name)}`).then(r => r.data),
  clearCache: () => api.post('/cache/clear').then(r => r.data),
};

export const configOverridesApi = {
  get:    ()           => api.get('/config/overrides').then(r => r.data),
  update: (overrides)  => api.put('/config/overrides', { overrides }).then(r => r.data),
};

export const presetsApi = {
  list:   ()                    => api.get('/presets').then(r => r.data.presets),
  create: (name, overrides)     => api.post('/presets', { name, overrides }).then(r => r.data),
  update: (id, patch)           => api.put(`/presets/${id}`, patch).then(r => r.data),
  remove: (id)                  => api.delete(`/presets/${id}`).then(r => r.data),
};

export const toolsApi = {
  list:    ()     => api.get('/tools').then(r => r.data),
  install: (name) => api.post(`/tools/${name}/install`).then(r => r.data),
};

export const extensionApi = {
  enable:  () => api.post('/extension-pairing').then(r => r.data),
  disable: () => api.delete('/extension-pairing').then(r => r.data),
};

export const sitesApi = {
  list:   ()             => api.get('/sites').then(r => r.data),
  get:    (site)         => api.get(`/sites/${site}`).then(r => r.data),
  update: (site, data)   => api.put(`/sites/${site}`, data).then(r => r.data),
  remove: (site)         => api.delete(`/sites/${site}`).then(r => r.data),
  verify: (site, probe_url) => api.post(`/sites/${site}/verify`, { probe_url }).then(r => r.data),
  startOauth:  (site)    => api.post(`/sites/${site}/oauth`).then(r => r.data),
  oauthStatus: (site)    => api.get(`/sites/${site}/oauth`).then(r => r.data),
  cancelOauth: (site)    => api.delete(`/sites/${site}/oauth`).then(r => r.data),
};
