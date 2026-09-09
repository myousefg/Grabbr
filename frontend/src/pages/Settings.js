import { useEffect, useState } from 'react';
import { Loader2, FolderOpen, CheckCircle2, XCircle, Download, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Section, Row } from '@/components/settingsUi';
import LegalSection, { COPYRIGHT_YEAR, COPYRIGHT_HOLDER } from '@/components/LegalSection';
import { useI18n } from '@/context/I18nProvider';
import { useTheme } from '@/context/ThemeProvider';
import { useJobs } from '@/context/JobsProvider';
import { useSettings } from '@/context/SettingsProvider';
import { toolsApi, envApi } from '@/lib/api';
import { isElectron } from '@/lib/electron';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { tools: liveTools } = useJobs();
  const { settings: s, env, saveState, update } = useSettings();
  const [tools, setTools] = useState({});
  const [showCfg, setShowCfg] = useState(false);
  const [cfg, setCfg] = useState(null);

  const loadTools = () => toolsApi.list().then(setTools).catch(() => {});
  useEffect(() => { loadTools(); }, []);
  useEffect(() => {
    if (Object.values(liveTools).some(x => x?.status === 'done' || x?.status === 'error')) loadTools();
  }, [liveTools]);

  const installTool = (name) => toolsApi.install(name).catch(() => {});

  const num = (k, v, fallback) => update({ [k]: v === '' ? fallback : Number(v) });

  const setAutostart = async (v) => {
    update({ autostart: v });
    if (isElectron) { try { await window.electronAPI.setAutoStart(v); } catch {} }
  };

  if (!s) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</div>;
  }

  const saveTag = {
    saving: <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> {t('settings.saving')}</span>,
    saved:  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="w-3 h-3" /> {t('settings.saved')}</span>,
    error:  <span className="text-destructive">{t('settings.saveFailed')}</span>,
    idle:   null,
  }[saveState];

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight leading-none">{t('settings.title')}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t('settings.subtitle')}</p>
        </div>
        <div className="text-xs mt-2 h-4">{saveTag}</div>
      </header>

      <Section label={t('settings.engine')}>
        <Row title={t('settings.maxConcurrent')} desc={t('settings.maxConcurrentDesc')}>
          <Input type="number" min={0} max={16} value={s.max_concurrent ?? 2}
            onChange={e => num('max_concurrent', e.target.value, 0)} className="w-20" data-testid="max-concurrent" />
        </Row>
        <Row title={t('settings.rateLimit')} desc={t('settings.rateLimitDesc')}>
          <Input value={s.rate_limit || ''} onChange={e => update({ rate_limit: e.target.value })}
            placeholder="1M" className="w-24 font-mono text-xs" />
        </Row>
        <Row title={t('settings.proxy')} desc={t('settings.proxyDesc')}>
          <Input value={s.proxy || ''} onChange={e => update({ proxy: e.target.value })}
            placeholder="socks5://127.0.0.1:1080" className="w-64 font-mono text-xs" data-testid="proxy" />
        </Row>
        <Row title={t('settings.sleepRequest')} desc={t('settings.sleepRequestDesc')}>
          <Input type="number" min={0} step={0.5} value={s.sleep_request ?? 0}
            onChange={e => num('sleep_request', e.target.value, 0)} className="w-20" />
        </Row>
        <Row title={t('settings.retries')} desc={t('settings.retriesDesc')}>
          <Input type="number" min={0} max={99} value={s.retries ?? 4}
            onChange={e => num('retries', e.target.value, 0)} className="w-20" />
        </Row>
        <Row title={t('settings.skipExisting')} desc={t('settings.skipExistingDesc')}>
          <Switch checked={!!s.skip_existing} onCheckedChange={v => update({ skip_existing: v })} data-testid="skip-existing" />
        </Row>
        <Row title={t('settings.writeMetadata')} desc={t('settings.writeMetadataDesc')}>
          <Switch checked={!!s.write_metadata} onCheckedChange={v => update({ write_metadata: v })} />
        </Row>
      </Section>

      <Section label={t('settings.appearance')}>
        <Row title={t('settings.theme')}>
          <Select value={theme} onValueChange={v => { setTheme(v); update({ theme: v }); }}>
            <SelectTrigger className="w-36" data-testid="theme-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t('settings.light')}</SelectItem>
              <SelectItem value="dark">{t('settings.dark')}</SelectItem>
              <SelectItem value="system">{t('settings.system')}</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row title={t('settings.language')}>
          <Select value={lang} onValueChange={v => { setLang(v); update({ language: v }); }}>
            <SelectTrigger className="w-36" data-testid="lang-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="id">Bahasa Indonesia</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row title={t('settings.startWithWindows')} desc={t('settings.startWithWindowsDesc')}>
          <Switch checked={!!s.autostart} onCheckedChange={setAutostart} disabled={!isElectron} />
        </Row>
        {!isElectron && <p className="px-4 pb-3 -mt-2 text-[11px] text-muted-foreground">{t('settings.autoStartElectronOnly')}</p>}
      </Section>

      <Section label={t('settings.tools')}>
        <div className="p-4 text-xs text-muted-foreground leading-relaxed">{t('settings.toolsDesc')}</div>
        <ToolRow name="gallery-dl" tool={tools['gallery-dl']} live={liveTools['gallery-dl']} onInstall={installTool} t={t} />
        <ToolRow name="ffmpeg" tool={tools['ffmpeg']} live={liveTools['ffmpeg']} onInstall={installTool} t={t} />
        <ToolRow name="yt-dlp" tool={tools['yt-dlp']} live={liveTools['yt-dlp']} onInstall={installTool} t={t} />
      </Section>

      {env && (
        <Section label={t('settings.files')}>
          <div className="p-4 text-xs text-muted-foreground leading-relaxed">{t('settings.filesDesc')}</div>
          <Row title={t('settings.dataFolder')} desc={t('settings.dataFolderDesc')}>
            <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[280px] block">{env.data_dir}</code>
            {isElectron && (
              <Button variant="outline" size="icon" onClick={() => window.electronAPI.openPath(env.data_dir)} title={t('settings.openFolder')}>
                <FolderOpen className="w-4 h-4" />
              </Button>
            )}
          </Row>
          <Row title={t('settings.downloadsFolder')}>
            <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[280px] block">{env.output_dir}</code>
            {isElectron && (
              <Button variant="outline" size="icon" onClick={() => window.electronAPI.openPath(env.output_dir)} title={t('settings.openFolder')}>
                <FolderOpen className="w-4 h-4" />
              </Button>
            )}
          </Row>
          {env.cookies_dir && (
            <Row title={t('settings.cookiesFolder')} desc={t('settings.cookiesFolderInfo')}>
              <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[280px] block">{env.cookies_dir}</code>
              {isElectron && (
                <Button variant="outline" size="icon" onClick={() => window.electronAPI.openPath(env.cookies_dir)} title={t('settings.openFolder')}>
                  <FolderOpen className="w-4 h-4" />
                </Button>
              )}
            </Row>
          )}
          <div className="p-4">
            <button onClick={() => { setShowCfg(v => !v); if (!cfg) envApi.config().then(setCfg).catch(() => setCfg({})); }}
              className="text-xs underline text-muted-foreground hover:text-foreground">
              {showCfg ? t('settings.hideConfig') : t('settings.viewConfig')}
            </button>
            {showCfg && (
              <pre className="mt-2 max-h-64 overflow-auto rounded border border-border bg-muted/30 p-2 text-[11px] font-mono">
                {cfg ? JSON.stringify(cfg, null, 2) : '…'}
              </pre>
            )}
          </div>
        </Section>
      )}

      <Section label={t('settings.about')}>
        <Row title="Grabbr" desc={t('settings.aboutTagline')}>
          <span className="text-xs font-mono text-muted-foreground">{env?.app_version || '…'}</span>
        </Row>
        <Row title={t('settings.components')} desc={t('settings.componentsDesc')}>
          <div className="text-right text-xs font-mono text-muted-foreground space-y-0.5">
            <div>gallery-dl {env?.gallery_dl_version || '…'}</div>
            <div>
              ffmpeg {env?.ffmpeg ? t('settings.installed') : t('settings.notInstalled')}
              {'  ·  '}
              yt-dlp {env?.yt_dlp ? t('settings.installed') : t('settings.notInstalled')}
            </div>
          </div>
        </Row>
        <Row title={t('settings.copyright')} desc={t('settings.licenseDesc')}>
          <span className="text-xs text-muted-foreground text-right leading-relaxed">
            Copyright (c) {COPYRIGHT_YEAR} {COPYRIGHT_HOLDER}
            <br />MIT License
          </span>
        </Row>
      </Section>

      <LegalSection />

      <div className="flex items-center justify-between gap-3 pt-1 text-[11px] text-muted-foreground/60">
        <button
          onClick={() => window.dispatchEvent(new Event('grabbr:tour'))}
          className="underline hover:text-foreground"
        >
          {t('settings.replayTour')}
        </button>
        <span className="font-mono">
          backend 127.0.0.1:8766  ·  {typeof navigator !== 'undefined' ? (navigator.userAgent.match(/Electron\/[\d.]+/)?.[0] || 'browser') : ''}
        </span>
      </div>
    </div>
  );
}

function ToolRow({ name, tool, live, onInstall, t }) {
  const status = live?.status || tool?.progress?.status;
  const busy = status === 'downloading' || status === 'installing';
  const avail = tool?.avail || (tool?.found ? 'installed' : 'install');
  const ver = tool?.version ? tool.version.slice(0, 40) : '';

  const btn = {
    install:   { show: true,  label: t('settings.toolInstall'),   variant: 'outline' },
    update:    { show: true,  label: t('settings.toolUpdate'),    variant: 'default' },
    current:   { show: false },
    installed: { show: true,  label: t('settings.toolReinstall'), variant: 'ghost' },
  }[avail] || { show: false };

  let statusLine;
  if (avail === 'install') {
    statusLine = <span className="inline-flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {t('settings.toolMissing')} · ~{tool?.approx_mb || '?'} MB</span>;
  } else if (avail === 'update') {
    statusLine = <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
      <Download className="w-3.5 h-3.5" /> {t('settings.toolUpdateAvail', { latest: tool.latest })}
      {ver ? <span className="font-mono text-muted-foreground"> · have {ver}</span> : null}
    </span>;
  } else if (avail === 'current') {
    statusLine = <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="w-3.5 h-3.5" /> {t('settings.toolUpToDate')}{ver ? <span className="font-mono"> · {ver}</span> : null}
    </span>;
  } else {
    statusLine = <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="w-3.5 h-3.5" /> {t('settings.toolDownloaded')}{ver ? <span className="font-mono"> · {ver}</span> : null}
    </span>;
  }

  return (
    <div className="p-4 flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {name}
          {tool?.source === 'path' && avail !== 'install' && (
            <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">on PATH</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{statusLine}</p>
        {busy && (
          <div className="mt-2 w-56">
            <Progress value={live?.pct ?? tool?.progress?.pct ?? 0} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground mt-1">
              {t(`settings.tool_${status}`)} {live?.pct != null ? `${live.pct}%` : ''}
            </p>
          </div>
        )}
        {status === 'error' && (
          <p className="text-[11px] text-destructive mt-1 font-mono">{live?.error || tool?.progress?.error}</p>
        )}
      </div>
      <div className="shrink-0">
        {btn.show && (
          <Button size="sm" variant={btn.variant} onClick={() => onInstall(name)} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
            {btn.label}
          </Button>
        )}
      </div>
    </div>
  );
}
