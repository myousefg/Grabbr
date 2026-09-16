import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  Loader2, FolderOpen, CheckCircle2, XCircle, Download, Check, RefreshCw, Trash2, ChevronDown,
  Puzzle, Copy, ShieldOff, Plus, Github,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Section, Row } from '@/components/settingsUi';
import LanguageCombobox from '@/components/LanguageCombobox';
import LegalSection, { COPYRIGHT_YEAR, COPYRIGHT_HOLDER } from '@/components/LegalSection';
import { useI18n } from '@/context/I18nProvider';
import { useTheme } from '@/context/ThemeProvider';
import { useJobs } from '@/context/JobsProvider';
import { useSettings } from '@/context/SettingsProvider';
import { toolsApi, envApi, extensionApi, configOverridesApi, presetsApi } from '@/lib/api';
import { isElectron, openExternal } from '@/lib/electron';
import { snappy } from '@/lib/motion';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { tools: liveTools } = useJobs();
  const { settings: s, env, saveState, update } = useSettings();
  const [tools, setTools] = useState({});
  const [showCfg, setShowCfg] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const advancedPanelId = useId();
  const cfgPanelId = useId();
  const overridesPanelId = useId();

  const [showOverrides, setShowOverrides] = useState(false);
  const [overridesText, setOverridesText] = useState(null); // null = not loaded yet
  const [overridesSaved, setOverridesSaved] = useState(null);
  const [overridesError, setOverridesError] = useState('');
  const [overridesSaving, setOverridesSaving] = useState(false);
  const overridesDirty = overridesText !== null && overridesText !== overridesSaved;
  const openOverrides = () => {
    setShowOverrides(v => !v);
    if (overridesText === null) {
      configOverridesApi.get().then(({ overrides }) => {
        let pretty = overrides;
        try { pretty = JSON.stringify(JSON.parse(overrides), null, 2); } catch { /* show raw as-is */ }
        setOverridesText(pretty);
        setOverridesSaved(pretty);
      }).catch(() => { setOverridesText('{}'); setOverridesSaved('{}'); });
    }
  };
  const saveOverrides = async () => {
    setOverridesSaving(true);
    setOverridesError('');
    try {
      await configOverridesApi.update(overridesText);
      setOverridesSaved(overridesText);
      toast.success(t('settings.saved'));
      if (cfg) envApi.config().then(setCfg).catch(() => {});
    } catch (e) {
      setOverridesError(e?.response?.data?.detail || t('settings.configEditorInvalid'));
    } finally {
      setOverridesSaving(false);
    }
  };
  const resetOverrides = () => { setOverridesText(overridesSaved); setOverridesError(''); };

  const loadTools = () => toolsApi.list().then(setTools).catch(() => {});
  useEffect(() => { loadTools(); }, []);
  useEffect(() => {
    if (Object.values(liveTools).some(x => x?.status === 'done' || x?.status === 'error')) loadTools();
  }, [liveTools]);

  const installTool = (name) => toolsApi.install(name).catch(() => {});

  const toolAvail = (name) => tools[name]?.avail || (tools[name]?.found ? 'installed' : 'install');
  const outdatedTools = ['gallery-dl', 'ffmpeg', 'yt-dlp', 'aria2c'].filter(n => ['install', 'update'].includes(toolAvail(n)));
  const toolsBusy = Object.values(liveTools).some(x => x?.status === 'downloading' || x?.status === 'installing');
  const updateAllTools = () => outdatedTools.forEach(installTool);

  const [cacheClearing, setCacheClearing] = useState(false);
  const clearCache = async () => {
    setCacheClearing(true);
    try { await envApi.clearCache(); toast.success(t('settings.cacheCleared')); }
    catch { toast.error(t('settings.clearCacheFailed')); }
    finally { setCacheClearing(false); }
  };

  const [extSecret, setExtSecret] = useState(null); // null = not loaded yet
  const [extBusy, setExtBusy] = useState(false);
  const [extCopied, setExtCopied] = useState(false);
  useEffect(() => {
    if (s && extSecret === null) setExtSecret(s.extension_secret || '');
  }, [s, extSecret]);
  const enableExtension = async () => {
    setExtBusy(true);
    try { setExtSecret((await extensionApi.enable()).extension_secret); }
    catch { toast.error(t('settings.saveFailed')); }
    finally { setExtBusy(false); }
  };
  const disableExtension = async () => {
    setExtBusy(true);
    try { setExtSecret((await extensionApi.disable()).extension_secret); }
    catch { toast.error(t('settings.saveFailed')); }
    finally { setExtBusy(false); }
  };
  const copyExtensionSecret = async () => {
    try {
      await navigator.clipboard.writeText(extSecret);
      setExtCopied(true);
      setTimeout(() => setExtCopied(false), 1500);
    } catch { toast.error(t('settings.saveFailed')); }
  };

  const [appUpdate, setAppUpdate] = useState({ status: 'idle' });
  useEffect(() => {
    if (!isElectron || !window.electronAPI.onAppUpdateStatus) return;
    return window.electronAPI.onAppUpdateStatus(setAppUpdate);
  }, []);
  const checkForAppUpdate = () => { setAppUpdate({ status: 'checking' }); window.electronAPI.checkForAppUpdate(); };

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
    <div className="space-y-8 pb-12">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight leading-none">{t('settings.title')}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t('settings.subtitle')}</p>
        </div>
        <div className="text-xs mt-2 h-4">{saveTag}</div>
      </header>

      <Section label={t('settings.engine')}>
        <Row title={t('settings.defaultLimit')} desc={t('settings.defaultLimitDesc')}>
          <Input
            value={s.default_range || ''} onChange={e => update({ default_range: e.target.value })}
            placeholder={t('settings.defaultLimitPlaceholder')} className="w-28 font-mono text-xs"
          />
        </Row>
        <Row title={t('settings.maxConcurrent')} desc={t('settings.maxConcurrentDesc')}>
          <Input type="number" min={0} max={16} value={s.max_concurrent ?? 2}
            onChange={e => num('max_concurrent', e.target.value, 0)} className="w-20" data-testid="max-concurrent" />
        </Row>
        <Row title={t('settings.skipExisting')} desc={t('settings.skipExistingDesc')}>
          <Switch checked={!!s.skip_existing} onCheckedChange={v => update({ skip_existing: v })} data-testid="skip-existing" />
        </Row>
        <Row title={t('settings.writeMetadata')} desc={t('settings.writeMetadataDesc')}>
          <Switch checked={!!s.write_metadata} onCheckedChange={v => update({ write_metadata: v })} />
        </Row>

        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          aria-expanded={showAdvanced}
          aria-controls={advancedPanelId}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors"
        >
          <span className="text-sm font-medium">{t('settings.advanced')}</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showAdvanced ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        <AnimatePresence initial={false}>
          {showAdvanced && (
            <motion.div
              id={advancedPanelId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={snappy}
              style={{ overflow: 'hidden' }}
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </Section>

      {env && (
        <Section label={t('settings.files')}>
          <Row title={t('settings.dataFolder')} desc={t('settings.dataFolderDesc')}>
            <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[280px] block">{env.data_dir}</code>
            {isElectron && (
              <Button variant="outline" size="icon" onClick={() => window.electronAPI.openPath(env.data_dir)} title={t('settings.openFolder')} aria-label={t('settings.openFolder')}>
                <FolderOpen className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </Row>
          <Row title={t('settings.downloadsFolder')}>
            <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[280px] block">{env.output_dir}</code>
            {isElectron && (
              <Button variant="outline" size="icon" onClick={() => window.electronAPI.openPath(env.output_dir)} title={t('settings.openFolder')} aria-label={t('settings.openFolder')}>
                <FolderOpen className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </Row>
          {env.cookies_dir && (
            <Row title={t('settings.cookiesFolder')} desc={t('settings.cookiesFolderInfo')}>
              <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[280px] block">{env.cookies_dir}</code>
              {isElectron && (
                <Button variant="outline" size="icon" onClick={() => window.electronAPI.openPath(env.cookies_dir)} title={t('settings.openFolder')} aria-label={t('settings.openFolder')}>
                  <FolderOpen className="w-4 h-4" aria-hidden="true" />
                </Button>
              )}
            </Row>
          )}
          <Row title={t('settings.clearCache')} desc={t('settings.clearCacheDesc')}>
            <Button variant="outline" size="sm" onClick={clearCache} disabled={cacheClearing}>
              {cacheClearing ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 me-1.5" />}
              {t('settings.clearCache')}
            </Button>
          </Row>
          <div className="p-4">
            <button onClick={() => { setShowCfg(v => !v); if (!cfg) envApi.config().then(setCfg).catch(() => setCfg({})); }}
              aria-expanded={showCfg} aria-controls={cfgPanelId}
              className="text-xs underline text-muted-foreground hover:text-foreground">
              {showCfg ? t('settings.hideConfig') : t('settings.viewConfig')}
            </button>
            <AnimatePresence initial={false}>
              {showCfg && (
                <motion.div
                  id={cfgPanelId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={snappy}
                  style={{ overflow: 'hidden' }}
                >
                  <pre className="mt-2 max-h-64 overflow-auto rounded border border-border bg-muted/30 p-2 text-[11px] font-mono">
                    {cfg ? JSON.stringify(cfg, null, 2) : '…'}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="p-4 border-t border-border">
            <button onClick={openOverrides}
              aria-expanded={showOverrides} aria-controls={overridesPanelId}
              className="text-xs underline text-muted-foreground hover:text-foreground">
              {showOverrides ? t('settings.hideConfigEditor') : t('settings.editConfig')}
            </button>
            <AnimatePresence initial={false}>
              {showOverrides && (
                <motion.div
                  id={overridesPanelId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={snappy}
                  style={{ overflow: 'hidden' }}
                >
                  <p id={`${overridesPanelId}-desc`} className="text-xs text-muted-foreground leading-relaxed mt-2 mb-2 max-w-xl">
                    {t('settings.configEditorDesc')}
                  </p>
                  <textarea
                    value={overridesText ?? ''}
                    onChange={e => { setOverridesText(e.target.value); setOverridesError(''); }}
                    spellCheck={false}
                    placeholder={t('settings.configEditorPlaceholder')}
                    aria-label={t('settings.editConfig')}
                    aria-describedby={`${overridesPanelId}-desc`}
                    className="w-full h-48 rounded border border-border bg-muted/30 p-2 text-[11px] font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  {overridesError && (
                    <p className="text-xs text-destructive mt-1.5 font-mono whitespace-pre-wrap">{overridesError}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Button size="sm" onClick={saveOverrides} disabled={overridesSaving || !overridesDirty}>
                      {overridesSaving && <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" />}
                      {t('settings.configEditorSave')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={resetOverrides} disabled={!overridesDirty || overridesSaving}>
                      {t('settings.configEditorReset')}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Section>
      )}

      <PresetsSection />

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
          <LanguageCombobox value={lang} onValueChange={v => { setLang(v); update({ language: v }); }} t={t} />
        </Row>
        <Row title={t('settings.startWithWindows')} desc={t('settings.startWithWindowsDesc')}>
          <Switch checked={!!s.autostart} onCheckedChange={setAutostart} disabled={!isElectron} />
        </Row>
        {!isElectron && <p className="px-4 pb-3 -mt-2 text-[11px] text-muted-foreground">{t('settings.autoStartElectronOnly')}</p>}
        <Row title={t('settings.notifications')} desc={t('settings.notificationsDesc')}>
          <Switch
            checked={s.notifications_enabled ?? true}
            onCheckedChange={v => update({ notifications_enabled: v })}
          />
        </Row>
      </Section>

      <Section
        label={t('settings.extension')}
        aside={extSecret ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> {t('settings.extensionConnected')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true" /> {t('settings.extensionDisabled')}
          </span>
        )}
      >
        <Row title={t('settings.extensionDownload')} desc={t('settings.extensionDownloadDesc')}>
          <Button
            variant="outline" size="sm"
            onClick={() => openExternal('https://github.com/myousefg/Grabbr/releases/latest/download/Grabbr-Extension.zip')}
          >
            <Download className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('settings.extensionDownload')}
          </Button>
        </Row>
        {!extSecret ? (
          <Row title={t('settings.extensionEnable')} desc={t('settings.extensionEnableDesc')}>
            <Button size="sm" onClick={enableExtension} disabled={extBusy || extSecret === null}>
              {extBusy ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" aria-hidden="true" /> : <Puzzle className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />}
              {t('settings.extensionEnable')}
            </Button>
          </Row>
        ) : (
          <>
            <Row title={t('settings.extensionCode')} desc={t('settings.extensionCodeDesc')}>
              <code className="font-mono text-[11px] text-muted-foreground break-all max-w-[220px] block">{extSecret}</code>
              <Button
                variant="outline" size="icon" onClick={copyExtensionSecret}
                title={t('settings.extensionCopy')}
                aria-label={extCopied ? t('settings.extensionCopied') : t('settings.extensionCopy')}
              >
                {extCopied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
              </Button>
            </Row>
            <Row title={t('settings.extensionRegenerate')} desc={t('settings.extensionRegenerateDesc')}>
              <Button variant="outline" size="sm" onClick={enableExtension} disabled={extBusy}>
                <RefreshCw className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('settings.extensionRegenerate')}
              </Button>
            </Row>
            <Row title={t('settings.extensionDisable')}>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={extBusy}>
                    <ShieldOff className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('settings.extensionDisable')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('settings.extensionDisableConfirm')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('settings.extensionDisableConfirmDesc')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={disableExtension}>{t('common.confirm')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Row>
          </>
        )}
      </Section>

      <Section
        label={t('settings.tools')}
        aside={outdatedTools.length > 0 && (
          <Button size="sm" variant="outline" onClick={updateAllTools} disabled={toolsBusy}>
            <RefreshCw className="w-3.5 h-3.5 me-1.5" /> {t('settings.updateAll')}
          </Button>
        )}
      >
        <ToolRow name="gallery-dl" tool={tools['gallery-dl']} live={liveTools['gallery-dl']} onInstall={installTool} t={t} />
        <ToolRow name="ffmpeg" tool={tools['ffmpeg']} live={liveTools['ffmpeg']} onInstall={installTool} t={t} />
        <ToolRow name="yt-dlp" tool={tools['yt-dlp']} live={liveTools['yt-dlp']} onInstall={installTool} t={t} />
        <ToolRow name="aria2c" tool={tools['aria2c']} live={liveTools['aria2c']} onInstall={installTool} t={t} />
      </Section>

      <Section label={t('settings.about')}>
        <Row
          title={
            <span className="inline-flex items-center gap-1.5">
              Grabbr
              <button
                type="button" onClick={() => openExternal('https://github.com/myousefg/Grabbr')}
                title={t('settings.aboutRepo')} aria-label={t('settings.aboutRepo')}
                className="text-muted-foreground/50 hover:text-muted-foreground"
              >
                <Github className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          }
          desc={t('settings.aboutTagline')}
        >
          <span className="text-xs font-mono text-muted-foreground">{env?.app_version || '…'}</span>
          {isElectron && (
            <div aria-live="polite">
              <AppUpdateControl appUpdate={appUpdate} onCheck={checkForAppUpdate} t={t} />
            </div>
          )}
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

function AppUpdateControl({ appUpdate, onCheck, t }) {
  const { status, pct, version } = appUpdate;

  if (status === 'checking') {
    return <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> {t('settings.updateChecking')}</span>;
  }
  if (status === 'downloading') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> {t('settings.updateDownloading')} {pct != null ? `${pct}%` : ''}
      </span>
    );
  }
  if (status === 'downloaded') {
    return (
      <Button size="sm" variant="default" onClick={() => window.electronAPI.installAppUpdate()}>
        <Download className="w-3.5 h-3.5 me-1.5" /> {t('settings.updateRestart')}
      </Button>
    );
  }
  if (status === 'available') {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-[11px] text-amber-600 dark:text-amber-400">{t('settings.updateAvail', { version })}</span>
        <Button size="sm" variant="outline" onClick={() => window.electronAPI.downloadAppUpdate()}>
          <Download className="w-3.5 h-3.5 me-1.5" /> {t('settings.updateDownload')}
        </Button>
      </span>
    );
  }
  if (status === 'current') {
    return (
      <button type="button" onClick={onCheck} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
        <CheckCircle2 className="w-3.5 h-3.5" /> {t('settings.updateCurrent')}
      </button>
    );
  }
  if (status === 'error') {
    return (
      <button
        type="button" onClick={onCheck}
        title={appUpdate.error || t('settings.updateFailed')}
        className="inline-flex items-center gap-1 text-[11px] text-destructive hover:underline"
      >
        <RefreshCw className="w-3 h-3" aria-hidden="true" /> {t('settings.updateFailed')}
        {appUpdate.error && <span className="text-muted-foreground font-mono">&nbsp;&middot; {appUpdate.error.slice(0, 60)}</span>}
      </button>
    );
  }
  return (
    <button type="button" onClick={onCheck} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
      <RefreshCw className="w-3 h-3" /> {t('settings.updateCheck')}
    </button>
  );
}

const TOOL_REPO_URL = {
  'gallery-dl': 'https://github.com/mikf/gallery-dl',
  'ffmpeg': 'https://github.com/FFmpeg/FFmpeg',
  'yt-dlp': 'https://github.com/yt-dlp/yt-dlp',
  'aria2c': 'https://github.com/aria2/aria2',
};

function ToolRow({ name, tool, live, onInstall, t, desc }) {
  const status = live?.status || tool?.progress?.status;
  const busy = status === 'downloading' || status === 'installing';
  const avail = tool?.avail || (tool?.found ? 'installed' : 'install');
  const ver = tool?.version ? tool.version.slice(0, 40) : '';

  const btn = {
    install:   { show: true,  label: t('settings.toolInstall'),   variant: 'outline' },
    update:    { show: true,  label: t('settings.toolUpdate'),    variant: 'default' },
    current:   { show: false },
    installed: { show: true,  label: t('settings.toolReinstall'), variant: 'ghost' },
    unsupported: { show: false },
  }[avail] || { show: false };

  let statusLine;
  if (avail === 'unsupported') {
    statusLine = <span className="inline-flex items-center gap-1 text-muted-foreground"><XCircle className="w-3.5 h-3.5" /> {t('settings.toolUnsupported')}</span>;
  } else if (avail === 'install') {
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
          <span className="inline-flex items-center gap-1.5">
            {name}
            {TOOL_REPO_URL[name] && (
              <button
                type="button" onClick={() => openExternal(TOOL_REPO_URL[name])}
                title={t('settings.toolRepo', { name })} aria-label={t('settings.toolRepo', { name })}
                className="text-muted-foreground/50 hover:text-muted-foreground"
              >
                <Github className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
            {tool?.source === 'path' && avail !== 'install' && (
              <span className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">on PATH</span>
            )}
          </span>
          {desc && <span className="block text-xs font-normal text-muted-foreground mt-0.5">{desc}</span>}
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
            {busy ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : <Download className="w-3.5 h-3.5 me-1" />}
            {btn.label}
          </Button>
        )}
      </div>
    </div>
  );
}

// Named, per-job option bundles picked from the Dashboard - a saved JSON
// override (same shape/validation as the "Edit custom config" block above)
// applied only to the download that asks for it, instead of the global one
// that always applies. Same load/edit/save/error state machine as that
// block, just per-row and with a name.
function PresetsSection() {
  const { t } = useI18n();
  const [presets, setPresets] = useState(null); // null = loading
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftOverrides, setDraftOverrides] = useState('{}');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => presetsApi.list().then(setPresets).catch(() => setPresets([]));
  useEffect(() => { load(); }, []);

  const closeAll = () => { setOpenId(null); setAdding(false); setError(''); };

  const openPreset = (p) => {
    if (openId === p.id) { closeAll(); return; }
    setAdding(false);
    setOpenId(p.id);
    setDraftName(p.name);
    let pretty = p.overrides;
    try { pretty = JSON.stringify(JSON.parse(p.overrides), null, 2); } catch { /* show raw as-is */ }
    setDraftOverrides(pretty);
    setError('');
  };

  const startAdd = () => {
    if (adding) { closeAll(); return; }
    setOpenId(null);
    setAdding(true);
    setDraftName('');
    setDraftOverrides('{\n  \n}');
    setError('');
  };

  const saveEdit = async (id) => {
    setSaving(true);
    setError('');
    try {
      await presetsApi.update(id, { name: draftName, overrides: draftOverrides });
      closeAll();
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || t('settings.presetInvalid'));
    } finally {
      setSaving(false);
    }
  };

  const saveNew = async () => {
    if (!draftName.trim()) { setError(t('settings.presetNameRequired')); return; }
    setSaving(true);
    setError('');
    try {
      await presetsApi.create(draftName, draftOverrides);
      closeAll();
      load();
    } catch (e) {
      setError(e?.response?.data?.detail || t('settings.presetInvalid'));
    } finally {
      setSaving(false);
    }
  };

  const removePreset = async (id) => {
    try {
      await presetsApi.remove(id);
      if (openId === id) closeAll();
      load();
    } catch {
      toast.error(t('settings.saveFailed'));
    }
  };

  if (presets === null) return null;

  const editorFields = (
    <div className="px-4 pb-4 space-y-2">
      <Input
        value={draftName} onChange={e => setDraftName(e.target.value)}
        placeholder={t('settings.presetNamePlaceholder')} aria-label={t('settings.presetName')}
        className="max-w-xs"
      />
      <textarea
        value={draftOverrides}
        onChange={e => { setDraftOverrides(e.target.value); setError(''); }}
        spellCheck={false}
        aria-label={t('settings.presetOverrides')}
        className="w-full h-32 rounded border border-border bg-muted/30 p-2 text-[11px] font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {error && <p className="text-xs text-destructive font-mono whitespace-pre-wrap">{error}</p>}
    </div>
  );

  return (
    <Section
      label={t('settings.presets')}
      aside={
        <Button size="sm" variant="outline" onClick={startAdd}>
          <Plus className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('settings.presetAdd')}
        </Button>
      }
    >
      {presets.length === 0 && !adding && (
        <p className="p-4 text-xs text-muted-foreground leading-relaxed max-w-lg">{t('settings.presetsEmpty')}</p>
      )}
      {presets.map(p => (
        <div key={p.id}>
          <button
            type="button" onClick={() => openPreset(p)}
            aria-expanded={openId === p.id}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/50 transition-colors"
          >
            <span className="text-sm font-medium truncate">{p.name}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${openId === p.id ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          <AnimatePresence initial={false}>
            {openId === p.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={snappy} style={{ overflow: 'hidden' }}
              >
                {editorFields}
                <div className="px-4 pb-4 flex items-center gap-2">
                  <Button size="sm" onClick={() => saveEdit(p.id)} disabled={saving}>
                    {saving && <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" aria-hidden="true" />}
                    {t('settings.presetSave')}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removePreset(p.id)}>
                    <Trash2 className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('settings.presetDelete')}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
      <AnimatePresence initial={false}>
        {adding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={snappy} style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-border pt-1">
              {editorFields}
              <div className="px-4 pb-4 flex items-center gap-2">
                <Button size="sm" onClick={saveNew} disabled={saving}>
                  {saving && <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" aria-hidden="true" />}
                  {t('settings.presetAdd')}
                </Button>
                <Button size="sm" variant="ghost" onClick={closeAll}>{t('common.cancel')}</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Section>
  );
}
