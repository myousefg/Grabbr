import { useEffect, useRef, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/context/ThemeProvider';
import { I18nProvider, useI18n } from '@/context/I18nProvider';
import { JobsProvider } from '@/context/JobsProvider';
import { SettingsProvider, useSettings } from '@/context/SettingsProvider';
import { LANGUAGE_CODES } from '@/locales/languages';
import ErrorBoundary from '@/components/ErrorBoundary';
import Layout from '@/components/Layout';
import Onboarding, { introDismissed } from '@/components/Onboarding';
import Dashboard from '@/pages/Dashboard';
import Convert from '@/pages/Convert';
import History from '@/pages/History';
import Watch from '@/pages/Watch';
import Sites from '@/pages/Sites';
import Settings from '@/pages/Settings';
import Advanced from '@/pages/Advanced';
import './App.css';

function RoutedShell() {
  const [tour, setTour] = useState(() => !introDismissed());
  const { settings } = useSettings();
  const { lang, setLang } = useI18n();

  useEffect(() => {
    const open = () => setTour(true);
    window.addEventListener('grabbr:tour', open);
    return () => window.removeEventListener('grabbr:tour', open);
  }, []);

  // If localStorage was cleared but the backend still has a saved
  // preference (or this is a different device sharing the same profile),
  // adopt it once settings finish loading rather than staying on whatever
  // I18nProvider guessed from the OS locale.
  const syncedFromSettings = useRef(false);
  useEffect(() => {
    if (syncedFromSettings.current) return;
    if (!settings?.language) return;
    syncedFromSettings.current = true;
    if (settings.language !== lang && LANGUAGE_CODES.includes(settings.language)) {
      setLang(settings.language);
    }
  }, [settings, lang, setLang]);

  return (
    <>
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route path="/"        element={<Dashboard />} />
            <Route path="/convert" element={<Convert />} />
            <Route path="/history" element={<History />} />
            <Route path="/watch"   element={<Watch />} />
            <Route path="/sites"   element={<Sites />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/advanced" element={<Advanced />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
      <Onboarding open={tour} onClose={() => setTour(false)} />
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider defaultTheme="system" storageKey="grabbr-theme">
          <TooltipProvider delayDuration={200}>
            <SettingsProvider>
             <JobsProvider>
              <HashRouter>
                <RoutedShell />
              </HashRouter>
             </JobsProvider>
            </SettingsProvider>
          </TooltipProvider>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
