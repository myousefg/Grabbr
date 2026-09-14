import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import en from '@/locales/en.json';
import { LANGUAGE_CODES, isRtl, matchLanguage } from '@/locales/languages';

const STORAGE_KEY = 'grabbr_language';

// English ships in the main bundle (it's the universal fallback, needed
// synchronously); every other language is fetched on demand via a dynamic
// import so adding 40+ locale files doesn't bloat the initial load for
// users who only ever use one or two of them.
async function loadTranslations(code) {
  if (code === 'en') return en;
  try {
    const mod = await import(`@/locales/${code}.json`);
    return mod.default || mod;
  } catch {
    return null;
  }
}

function detectDefaultLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGE_CODES.includes(stored)) return stored;
  } catch { /* ignore */ }
  // No explicit choice yet: follow the OS/browser locale (Electron's
  // renderer reports the system locale via navigator.language) rather than
  // always defaulting to English.
  const candidates = (typeof navigator !== 'undefined' && navigator.languages) || [];
  for (const tag of candidates) {
    const match = matchLanguage(tag);
    if (match) return match;
  }
  return 'en';
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), obj);
}

function interpolate(str, params = {}) {
  if (!str || !params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => (params[key] !== undefined ? params[key] : `{{${key}}}`));
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectDefaultLanguage);
  const [dict, setDict] = useState(() => (lang === 'en' ? en : null));
  const cache = useRef({ en });

  useEffect(() => {
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    if (cache.current[lang]) {
      setDict(cache.current[lang]);
      return;
    }
    loadTranslations(lang).then(loaded => {
      if (cancelled) return;
      cache.current[lang] = loaded || en;
      setDict(cache.current[lang]);
    });
    return () => { cancelled = true; };
  }, [lang]);

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  // While the picked language's JSON is still loading (first switch to it
  // this session), fall through to English rather than flashing raw keys.
  const t = useCallback((key, params) => {
    const val = getNestedValue(dict, key)
             ?? getNestedValue(en, key)
             ?? key;
    return typeof val === 'string' ? interpolate(val, params) : val;
  }, [dict]);

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
