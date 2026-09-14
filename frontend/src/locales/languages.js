// Registry of every supported UI language: drives the searchable language
// picker (Settings) and the lazy-loader in I18nProvider. `code` doubles as
// the locale JSON filename (./<code>.json) and the value stored in
// settings.language / localStorage.
export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', rtl: false },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', rtl: false },

  // Europe
  { code: 'es-ES', name: 'Spanish (Spain)', native: 'Español (España)', rtl: false },
  { code: 'de', name: 'German', native: 'Deutsch', rtl: false },
  { code: 'fr', name: 'French', native: 'Français', rtl: false },
  { code: 'it', name: 'Italian', native: 'Italiano', rtl: false },
  { code: 'pt-PT', name: 'Portuguese (Portugal)', native: 'Português (Portugal)', rtl: false },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', rtl: false },
  { code: 'pl', name: 'Polish', native: 'Polski', rtl: false },
  { code: 'sv', name: 'Swedish', native: 'Svenska', rtl: false },
  { code: 'no', name: 'Norwegian', native: 'Norsk', rtl: false },
  { code: 'da', name: 'Danish', native: 'Dansk', rtl: false },
  { code: 'fi', name: 'Finnish', native: 'Suomi', rtl: false },
  { code: 'el', name: 'Greek', native: 'Ελληνικά', rtl: false },
  { code: 'cs', name: 'Czech', native: 'Čeština', rtl: false },
  { code: 'hu', name: 'Hungarian', native: 'Magyar', rtl: false },
  { code: 'ro', name: 'Romanian', native: 'Română', rtl: false },

  // Latin America
  { code: 'es-419', name: 'Spanish (Latin America)', native: 'Español (Latinoamérica)', rtl: false },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', native: 'Português (Brasil)', rtl: false },

  // East Asia
  { code: 'zh-Hans', name: 'Chinese (Simplified)', native: '简体中文', rtl: false },
  { code: 'zh-Hant', name: 'Chinese (Traditional)', native: '繁體中文', rtl: false },
  { code: 'ja', name: 'Japanese', native: '日本語', rtl: false },
  { code: 'ko', name: 'Korean', native: '한국어', rtl: false },

  // Middle East & North Africa
  { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', rtl: false },
  { code: 'he', name: 'Hebrew', native: 'עברית', rtl: true },
  { code: 'fa', name: 'Persian', native: 'فارسی', rtl: true },

  // South Asia
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', rtl: false },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', rtl: false },
  { code: 'ur', name: 'Urdu', native: 'اردو', rtl: true },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', rtl: false },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', rtl: false },
  { code: 'mr', name: 'Marathi', native: 'मराठी', rtl: false },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', rtl: false },

  // Southeast Asia
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', rtl: false },
  { code: 'th', name: 'Thai', native: 'ไทย', rtl: false },
  { code: 'ms', name: 'Malay', native: 'Bahasa Melayu', rtl: false },
  { code: 'tl', name: 'Filipino', native: 'Filipino', rtl: false },

  // Eastern Europe & Central Asia
  { code: 'ru', name: 'Russian', native: 'Русский', rtl: false },
  { code: 'uk', name: 'Ukrainian', native: 'Українська', rtl: false },
  { code: 'kk', name: 'Kazakh', native: 'Қазақша', rtl: false },

  // Sub-Saharan Africa
  { code: 'sw', name: 'Swahili', native: 'Kiswahili', rtl: false },
  { code: 'am', name: 'Amharic', native: 'አማርኛ', rtl: false },
  { code: 'zu', name: 'Zulu', native: 'isiZulu', rtl: false },
  { code: 'af', name: 'Afrikaans', native: 'Afrikaans', rtl: false },
];

export const LANGUAGE_CODES = LANGUAGES.map(l => l.code);
export const RTL_CODES = new Set(LANGUAGES.filter(l => l.rtl).map(l => l.code));

export function isRtl(code) {
  return RTL_CODES.has(code);
}

// Best match for a BCP-47-ish tag (from navigator.language, or a stored
// setting) against our supported codes: exact match first, then a same-
// base-language fallback (e.g. "de-AT" -> "de", "pt-XX" -> prefers pt-BR
// since it's listed first among pt-* entries), then null (caller falls
// back to 'en').
export function matchLanguage(tag) {
  if (!tag) return null;
  const norm = tag.replace('_', '-');
  const exact = LANGUAGES.find(l => l.code.toLowerCase() === norm.toLowerCase());
  if (exact) return exact.code;
  const base = norm.split('-')[0].toLowerCase();
  const baseMatch = LANGUAGES.find(l => l.code.split('-')[0].toLowerCase() === base);
  return baseMatch ? baseMatch.code : null;
}
