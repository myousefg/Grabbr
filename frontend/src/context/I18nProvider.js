import { createContext, useContext, useState, useCallback } from 'react';
import en from '@/locales/en.json';
import id from '@/locales/id.json';

const translations = { en, id };

const STORAGE_KEY = 'grabbr_language';

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), obj);
}

function interpolate(str, params = {}) {
  if (!str || !params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => (params[key] !== undefined ? params[key] : `{{${key}}}`));
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'en'; } catch { return 'en'; }
  });

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  const t = useCallback((key, params) => {
    const val = getNestedValue(translations[lang], key)
             ?? getNestedValue(translations['en'], key)
             ?? key;
    return typeof val === 'string' ? interpolate(val, params) : val;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
