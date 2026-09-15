import { AlertTriangle, FolderOpen, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Section, Row } from '@/components/settingsUi';
import { useI18n } from '@/context/I18nProvider';
import { useSettings } from '@/context/SettingsProvider';
import { isElectron, openExternal } from '@/lib/electron';
import { BROWSERS, BROWSER_LABELS } from '@/lib/sites';

export const COOKIES_TXT_EXT = 'https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc';

export default function CookieDefaults({ browsers = [], ck, onReload }) {
  const { t } = useI18n();
  const { settings: s, update } = useSettings();
  if (!s) return null;

  const ordered = browsers.length
    ? [...browsers].sort((a, b) => (b.detected - a.detected))
    : BROWSERS.map(id => ({ id, detected: false }));

  const browser = s.cookies_browser || 'firefox';
  const running = browsers.find(x => x.id === browser);
  const locked = !!(running && running.locks_cookies && running.running);

  return (
    <Section label={t('settings.cookies')}>
      <Row title={t('settings.cookiesBrowserPick')}>
        <Select value={browser} onValueChange={v => update({ cookies_browser: v })}>
          <SelectTrigger className="w-56" data-testid="cookies-browser"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('settings.cookiesNone')}</SelectItem>
            {ordered.map(({ id, detected }) => (
              <SelectItem key={id} value={id}>
                {BROWSER_LABELS[id] || id}{detected ? ' · installed' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      {locked && (
        <div className="px-4 pb-3 -mt-1 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{t('settings.browserRunning', { name: BROWSER_LABELS[browser] || browser })}</span>
        </div>
      )}

      <Row title={t('settings.cookiesFolder')}>
        <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[240px] block">
          {ck?.dir || '…'}
        </code>
        {isElectron && ck?.dir && (
          <Button variant="outline" size="icon" onClick={() => window.electronAPI.openPath(ck.dir)} title={t('settings.openFolder')} aria-label={t('settings.openFolder')}>
            <FolderOpen className="w-4 h-4" aria-hidden="true" />
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={onReload} title={t('settings.cookiesFolderRescan')} aria-label={t('settings.cookiesFolderRescan')}>
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </Button>
      </Row>
      <div className="p-4 -mt-2 text-xs text-muted-foreground space-y-1">
        {!ck ? (
          <p>{t('common.loading')}</p>
        ) : ck.files.length === 0 ? (
          <p>
            {t('settings.cookiesFolderEmpty')}{' '}
            <button onClick={() => openExternal(COOKIES_TXT_EXT)} className="underline hover:text-foreground">
              {t('settings.cookiesFileHelpLink')}
            </button>
          </p>
        ) : (
          <>
            <p className="text-emerald-600 dark:text-emerald-400">
              {t('settings.cookiesFolderDetected', { count: ck.files.length })}
            </p>
            <p className="font-mono text-[11px]">{ck.domains.join('  ·  ') || t('settings.cookiesFolderNoDomains')}</p>
          </>
        )}
      </div>
    </Section>
  );
}
