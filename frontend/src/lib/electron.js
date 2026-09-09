/**
 * Shared Electron bridge utilities.
 *
 * Import these instead of redeclaring `const isElectron` and duplicating
 * `openFolder` in every page component.
 */

/** True when running inside the Electron desktop shell. */
export const isElectron = !!window.electronAPI;

/**
 * Open the system file-manager at the directory containing `filePath`.
 * Does nothing when running in a browser (non-Electron) context.
 *
 * @param {string|null|undefined} filePath - Full path to a file (not a dir).
 */
export async function openFolder(filePath) {
  if (!isElectron || !filePath) return;
  const sep = filePath.includes('\\') ? '\\' : '/';
  const dir = filePath.substring(0, filePath.lastIndexOf(sep));
  if (dir) await window.electronAPI.openPath(dir);
}

/** Open a URL in the user's real browser (Electron) or a new tab (browser dev). */
export function openExternal(url) {
  if (!url) return;
  if (isElectron && window.electronAPI.openExternal) window.electronAPI.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}