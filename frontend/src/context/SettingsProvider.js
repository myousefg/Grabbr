import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { settingsApi, envApi } from '@/lib/api';

const SettingsContext = createContext(null);

/**
 * Single source of truth for app settings + /api/env. Edits are optimistic and
 * pushed to the backend on a short debounce. No Save button anywhere.
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [env, setEnv] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const pending = useRef({});
  const timer = useRef(null);
  const savedTimer = useRef(null);

  const loadEnv = useCallback(() => envApi.get().then(setEnv).catch(() => {}), []);
  const loadSettings = useCallback(() => settingsApi.get().then(setSettings).catch(() => {}), []);

  useEffect(() => {
    settingsApi.get().then(setSettings).catch(() => setSettings({}));
    loadEnv();
  }, [loadEnv]);

  const flush = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    setSaveState('saving');
    try {
      const updated = await settingsApi.update(patch);
      setSettings(updated);
      setSaveState('saved');
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1500);
    } catch {
      setSaveState('error');
    }
  }, []);

  const update = useCallback((patch) => {
    setSettings(prev => ({ ...prev, ...patch }));
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  }, [flush]);

  useEffect(() => () => { clearTimeout(timer.current); clearTimeout(savedTimer.current); }, []);

  return (
    <SettingsContext.Provider value={{ settings, env, saveState, update, reloadEnv: loadEnv, reloadSettings: loadSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
