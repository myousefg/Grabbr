import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/context/ThemeProvider';
import { I18nProvider } from '@/context/I18nProvider';
import { JobsProvider } from '@/context/JobsProvider';
import { SettingsProvider } from '@/context/SettingsProvider';
import ErrorBoundary from '@/components/ErrorBoundary';
import Layout from '@/components/Layout';
import Onboarding, { introDismissed } from '@/components/Onboarding';
import Dashboard from '@/pages/Dashboard';
import History from '@/pages/History';
import Sites from '@/pages/Sites';
import Settings from '@/pages/Settings';
import './App.css';

function RoutedShell() {
  const [tour, setTour] = useState(() => !introDismissed());
  useEffect(() => {
    const open = () => setTour(true);
    window.addEventListener('grabbr:tour', open);
    return () => window.removeEventListener('grabbr:tour', open);
  }, []);
  return (
    <>
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route path="/"        element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/sites"   element={<Sites />} />
            <Route path="/settings" element={<Settings />} />
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
