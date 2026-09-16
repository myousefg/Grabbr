import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  Loader2, Download, Check, RefreshCw, Trash2, ChevronDown, Puzzle, Copy, ShieldOff, Plus,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Section, Row } from '@/components/settingsUi';
import { TokenMenu, NAME_TOKENS, NAME_TOKEN_TEXT } from '@/components/OutputSettings';
import { useI18n } from '@/context/I18nProvider';
import { useSettings } from '@/context/SettingsProvider';
import { extensionApi, presetsApi } from '@/lib/api';
import { openExternal } from '@/lib/electron';
import { snappy } from '@/lib/motion';

export default function Advanced() {
  const { t } = useI18n();
  const { settings: s, update, reloadSettings } = useSettings();

  const num = (k, v, fallback) => update({ [k]: v === '' ? fallback : Number(v) });

  const [extSecret, setExtSecret] = useState(null); // null = not loaded yet
  const [extBusy, setExtBusy] = useState(false);
  const [extCopied, setExtCopied] = useState(false);
  useEffect(() => {
    if (s && extSecret === null) setExtSecret(s.extension_secret || '');
  }, [s, extSecret]);
  // A pairing code existing just means it's enabled, not that a browser
  // extension has actually used it - only extension_last_used (set by the
  // backend the first time a request authenticates with it) means that.
  const extConnected = !!(extSecret && s?.extension_last_used);
  const enableExtension = async () => {
    setExtBusy(true);
    try {
      setExtSecret((await extensionApi.enable()).extension_secret);
      reloadSettings(); // clears the stale extension_last_used from any old code
    }
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

  if (!s) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</div>;
  }

  return (
    <div className="space-y-8 pb-12">
      <header />

      <Section
        label={t('settings.extension')}
        aside={extConnected ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> {t('settings.extensionConnected')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true" /> {t('settings.extensionDisabled')}
          </span>
        )}
      >
        {!extConnected && (
          <Row title={t('settings.extensionDownload')} desc={t('settings.extensionDownloadDesc')}>
            <Button
              variant="outline" size="sm"
              onClick={() => openExternal('https://github.com/myousefg/Grabbr/releases/latest/download/Grabbr-Extension.zip')}
            >
              <Download className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('settings.extensionDownload')}
            </Button>
          </Row>
        )}
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

      <Section label={t('settings.engine')}>
        <Row title={t('settings.maxConcurrent')} desc={t('settings.maxConcurrentDesc')}>
          <Input type="number" min={0} max={16} value={s.max_concurrent ?? 2}
            onChange={e => num('max_concurrent', e.target.value, 0)} className="w-20" data-testid="max-concurrent" />
        </Row>
        <Row title={t('settings.defaultLimit')} desc={t('settings.defaultLimitDesc')}>
          <Input
            value={s.default_range || ''} onChange={e => update({ default_range: e.target.value })}
            placeholder={t('settings.defaultLimitPlaceholder')} className="w-28 font-mono text-xs"
          />
        </Row>
        <Row title={t('settings.skipExisting')} desc={t('settings.skipExistingDesc')}>
          <Switch checked={!!s.skip_existing} onCheckedChange={v => update({ skip_existing: v })} data-testid="skip-existing" />
        </Row>
        <Row title={t('settings.writeMetadata')} desc={t('settings.writeMetadataDesc')}>
          <Switch checked={!!s.write_metadata} onCheckedChange={v => update({ write_metadata: v })} />
        </Row>
        <Row title={t('settings.rateLimit')} desc={t('settings.rateLimitDesc')}>
          <Input value={s.rate_limit || ''} onChange={e => update({ rate_limit: e.target.value })}
            placeholder="1M" className="w-24 font-mono text-xs" />
        </Row>
        <Row title={t('settings.sleepRequest')} desc={t('settings.sleepRequestDesc')}>
          <Input type="number" min={0} step={0.5} value={s.sleep_request ?? 0}
            onChange={e => num('sleep_request', e.target.value, 0)} className="w-20" />
        </Row>
        <Row title={t('settings.retries')} desc={t('settings.retriesDesc')}>
          <Input type="number" min={0} max={99} value={s.retries ?? 4}
            onChange={e => num('retries', e.target.value, 0)} className="w-20" />
        </Row>
        <Row title={t('settings.proxy')} desc={t('settings.proxyDesc')}>
          <Input value={s.proxy || ''} onChange={e => update({ proxy: e.target.value })}
            placeholder="socks5://127.0.0.1:1080" className="w-64 font-mono text-xs" data-testid="proxy" />
        </Row>
      </Section>

      <PresetsSection />
    </div>
  );
}

// Two real, working starting points for the "Add preset" form - an empty
// JSON textarea gives no hint of what actually belongs there (gallery-dl's
// own extractor/postprocessor config, not something most users have ever
// seen), so picking one fills in both the name and a preset that already
// does something useful, to edit from rather than write from scratch.
const PRESET_EXAMPLES = [
  {
    name: 'Images only',
    overrides: '{\n  "extractor": {\n    "filter": "extension not in (\'mp4\', \'webm\', \'mov\', \'gif\')"\n  }\n}',
  },
  {
    name: 'Custom filename',
    overrides: '{\n  "extractor": {\n    "filename": "{category}_{id}.{extension}"\n  }\n}',
  },
];

// Named, per-job option bundles picked from the Dashboard - a saved JSON
// override (same shape/validation as Settings > Files' "Edit custom config"
// block) applied only to the download that asks for it, instead of the
// global one that always applies. Same load/edit/save/error state machine
// as that block, just per-row and with a name.
function PresetsSection() {
  const { t } = useI18n();
  const [presets, setPresets] = useState(null); // null = loading
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftOverrides, setDraftOverrides] = useState('{}');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);

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

  // Presets are raw gallery-dl JSON, so a plain append-to-end (like the
  // filename/directory fields on Settings > Files do) would land outside
  // whatever object or string the user is actually editing. Splicing at the
  // textarea's own cursor lands it exactly where they clicked instead -
  // inside a "filename" value they're typing, say - and the cursor is left
  // right after the inserted text so multiple tokens can be dropped in a row.
  const insertToken = (token) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? draftOverrides.length;
    const end = el.selectionEnd ?? draftOverrides.length;
    const next = draftOverrides.slice(0, start) + token + draftOverrides.slice(end);
    setDraftOverrides(next);
    setError('');
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  if (presets === null) return null;

  const useExample = (ex) => {
    setDraftName(ex.name);
    setDraftOverrides(ex.overrides);
    setError('');
  };

  const renderEditor = (isNew) => (
    <div className="px-4 pb-4 space-y-2">
      {isNew && (
        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          <span className="text-[11px] text-muted-foreground">{t('settings.presetStartFrom')}</span>
          {PRESET_EXAMPLES.map(ex => (
            <Button key={ex.name} type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => useExample(ex)}>
              {ex.name}
            </Button>
          ))}
        </div>
      )}
      <Input
        value={draftName} onChange={e => setDraftName(e.target.value)}
        placeholder={t('settings.presetNamePlaceholder')} aria-label={t('settings.presetName')}
        className="max-w-xs"
      />
      <div className="flex items-start gap-2">
        <textarea
          ref={textareaRef}
          value={draftOverrides}
          onChange={e => { setDraftOverrides(e.target.value); setError(''); }}
          spellCheck={false}
          aria-label={t('settings.presetOverrides')}
          className="w-full h-32 rounded border border-border bg-muted/30 p-2 text-[11px] font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <TokenMenu tokens={NAME_TOKENS} text={NAME_TOKEN_TEXT} onPick={insertToken} />
      </div>
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
      <p className="p-4 text-xs text-muted-foreground leading-relaxed max-w-lg">
        {t('settings.presetsIntro')}{' '}
        <button
          type="button" onClick={() => openExternal('https://gdl-org.github.io/docs/configuration.html')}
          className="underline hover:text-foreground"
        >
          {t('settings.presetsIntroLink')}
        </button>
      </p>
      {presets.length === 0 && !adding && (
        <p className="px-4 pb-4 -mt-2 text-xs text-muted-foreground leading-relaxed max-w-lg">{t('settings.presetsEmpty')}</p>
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
                {renderEditor(false)}
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
              {renderEditor(true)}
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
