import { useEffect, useId, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown, Loader2, CheckCircle2, AlertTriangle, ExternalLink, Upload, Trash2, X, Bookmark,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import CookieDefaults, { COOKIES_TXT_EXT } from '@/components/CookieDefaults';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';
import { sitesApi, envApi } from '@/lib/api';
import { isElectron, openExternal } from '@/lib/electron';
import { SITE_GROUPS } from '@/lib/sites';
import { snappy } from '@/lib/motion';

function TierBadge({ auth, required }) {
  const label = {
    cookies: 'COOKIES', userpass: 'USER / PASS', oauth: 'OAUTH',
    'oauth-instance': 'OAUTH', token: 'TOKEN',
  }[auth] || auth.toUpperCase();
  return (
    <span className="text-[9px] font-medium tracking-[0.15em] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
      {label}{required ? ' · REQUIRED' : ''}
    </span>
  );
}

function StateDot({ configured }) {
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${configured ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} aria-hidden="true" />;
}

function coversDomain(domains, domain) {
  return (domains || []).some(d => d === domain || d.endsWith('.' + domain) || domain.endsWith('.' + d));
}

function isConfigured(site, row, covered) {
  if (site.auth === 'cookies') return !!covered;
  if (!row) return false;
  if (site.auth === 'userpass') return !!row.username;
  if (site.auth === 'oauth' || site.auth === 'oauth-instance') {
    try { return Object.keys(JSON.parse(row.token_json || '{}')).length > 0; } catch { return false; }
  }
  if (site.auth === 'token') {
    try { return !!JSON.parse(row.token_json || '{}')['refresh-token']; } catch { return false; }
  }
  return false;
}

function SiteRow({ site, row, ck, open, onToggle, onCollapse, onSaved, onCookies }) {
  const { t } = useI18n();
  const { oauth, clearOauth, createJobs } = useJobs();
  const [d, setD] = useState({});
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState(null);
  const panelId = useId();

  useEffect(() => {
    setD({
      username: row?.username || '',
      password: row?.password || '',
      instance: row?.instance || '',
      refresh_token: (() => { try { return JSON.parse(row?.token_json || '{}')['refresh-token'] || ''; } catch { return ''; } })(),
    });
  }, [row]);

  const ev = oauth[site.id];
  const uploadedFile = (ck?.files || []).find(f => f.name === `${site.id}.txt`);
  const covered = coversDomain(ck?.domains, site.domain);
  const configured = isConfigured(site, row, covered);

  const save = async (patch) => {
    setBusy(true);
    try {
      await sitesApi.update(site.id, patch);
      toast.success(t('sites.saved', { name: site.name }));
      onSaved();
    } catch { toast.error(t('sites.saveFailed')); }
    finally { setBusy(false); }
  };
  const saveUserpass = () => save({ username: d.username, password: d.password });
  const savePixiv = () => save({ token_json: JSON.stringify({ 'refresh-token': d.refresh_token.trim() }) });

  const uploadCookies = async () => {
    if (!isElectron) return;
    const p = await window.electronAPI.selectFile({
      title: 'cookies.txt',
      filters: [{ name: 'cookies.txt', extensions: ['txt'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (!p) return;
    setBusy(true);
    try {
      const r = await envApi.importCookies({ path: p, name: site.id });
      await sitesApi.update(site.id, { cookies_mode: 'folder' }).catch(() => {});
      toast.success(t('sites.cookieUploaded', { domains: (r.domains || []).join(', ') || site.domain }));
      onCookies?.();
      onCollapse?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('sites.cookieUploadFailed'));
    } finally { setBusy(false); }
  };

  const removeUploaded = async () => {
    if (!uploadedFile) return;
    setBusy(true);
    try {
      await envApi.deleteCookieFile(uploadedFile.name);
      await sitesApi.update(site.id, { cookies_mode: 'auto' }).catch(() => {});
      toast.success(t('sites.cookieRemoved'));
      onCookies?.();
    } catch { toast.error(t('sites.saveFailed')); }
    finally { setBusy(false); }
  };

  const importSaved = async () => {
    if (!site.savedUrl) return;
    setBusy(true);
    try {
      await createJobs([site.savedUrl]);
      toast.success(t('sites.importQueued'));
    } catch { toast.error(t('sites.saveFailed')); }
    finally { setBusy(false); }
  };

  const runVerify = async () => {
    if (!site.probe) return;
    setVerify({ loading: true });
    try {
      const r = await sitesApi.verify(site.id, site.probe);
      setVerify(r);
    } catch (e) { setVerify({ ok: false, message: String(e) }); }
  };

  const authorize = async () => {
    if (site.auth === 'oauth-instance' && !d.instance.trim()) {
      toast.error(t('sites.needInstance'));
      return;
    }
    setBusy(true);
    try {
      if (site.auth === 'oauth-instance') await sitesApi.update(site.id, { instance: d.instance.trim() });
      const r = await sitesApi.startOauth(site.id);
      if (r.url) openExternal(r.url);
      else if (r.error) toast.error(r.error);
      const poll = setInterval(async () => {
        try {
          const s = await sitesApi.oauthStatus(site.id);
          if (s.done) { clearInterval(poll); onSaved(); }
        } catch { clearInterval(poll); }
      }, 2500);
      setTimeout(() => clearInterval(poll), 180000);
    } catch { toast.error(t('sites.oauthFailed')); }
    finally { setBusy(false); }
  };

  const clearSite = async () => {
    try { await sitesApi.remove(site.id); }
    catch { toast.error(t('sites.saveFailed')); return; }
    clearOauth(site.id);
    setVerify(null);
    toast.success(t('sites.cleared', { name: site.name }));
    onSaved();
  };

  return (
    <div className="border border-border rounded-lg" data-testid={`site-${site.id}`}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-accent/50 transition-colors rounded-lg"
      >
        <StateDot configured={configured} />
        <span className="sr-only">{configured ? t('sites.configured') : t('sites.notConfigured')}</span>
        <span className="text-sm font-medium">{site.name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{site.domain}</span>
        <div className="ms-auto flex items-center gap-2">
          <TierBadge auth={site.auth} required={site.required} />
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={snappy}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-3.5 pb-4 pt-1 space-y-3 border-t border-border">
          {site.note && <p className="text-xs text-muted-foreground leading-relaxed pt-2">{site.note}</p>}

          {/* Cookie sites */}
          {site.auth === 'cookies' && (
            <>
              <p className={`text-xs ${covered ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                {covered
                  ? t('sites.cookieActive', { domain: site.domain })
                  : t('sites.cookieFallback')}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {isElectron && (
                  <Button variant="outline" size="sm" onClick={uploadCookies} disabled={busy}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 me-1.5" />}
                    {uploadedFile ? t('sites.replaceCookies') : t('sites.uploadCookies')}
                  </Button>
                )}
                {uploadedFile && (
                  <Button variant="ghost" size="sm" onClick={removeUploaded} disabled={busy}>
                    <Trash2 className="w-3.5 h-3.5 me-1.5" /> {t('sites.removeCookies')}
                  </Button>
                )}
                {site.probe && (
                  <Button size="sm" variant="outline" onClick={runVerify} disabled={verify?.loading}>
                    {verify?.loading && <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />}{t('sites.verify')}
                  </Button>
                )}
                {site.savedUrl && covered && (
                  <Button size="sm" variant="outline" onClick={importSaved} disabled={busy}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 me-1.5 animate-spin" aria-hidden="true" /> : <Bookmark className="w-3.5 h-3.5 me-1.5" aria-hidden="true" />}
                    {t(site.savedLabelKey)}
                  </Button>
                )}
                {verify && !verify.loading && (
                  <span className={`text-xs flex items-center gap-1.5 ${verify.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                    {verify.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {verify.ok ? t('sites.verifyOk') : (verify.message || t('sites.verifyFail'))}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('sites.uploadHint')}{' '}
                <button onClick={() => openExternal(COOKIES_TXT_EXT)} className="underline hover:text-foreground">
                  {t('sites.uploadHintLink')}
                </button>
              </p>
            </>
          )}

          {/* Username / password */}
          {site.auth === 'userpass' && (
            <>
              <div className="grid grid-cols-2 gap-2 pt-1 max-w-md">
                <Input value={d.username} onChange={e => setD(s => ({ ...s, username: e.target.value }))}
                  placeholder={t('sites.username')} aria-label={t('sites.username')} autoComplete="off" />
                <Input type="password" value={d.password} onChange={e => setD(s => ({ ...s, password: e.target.value }))}
                  placeholder={t('sites.password')} aria-label={t('sites.password')} autoComplete="off" />
              </div>
              <RowActions {...{ busy, save: saveUserpass, verify, runVerify, probe: site.probe, configured, clearSite, t }} />
            </>
          )}

          {/* OAuth (+ instance) */}
          {(site.auth === 'oauth' || site.auth === 'oauth-instance') && (
            <div className="space-y-2 pt-1">
              {site.auth === 'oauth-instance' && (
                <Input value={d.instance} onChange={e => setD(s => ({ ...s, instance: e.target.value }))}
                  placeholder="mastodon.social" aria-label={t('sites.instanceLabel')} className="w-64 font-mono text-xs" />
              )}
              {configured && !ev && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /> {t('sites.authorized')}
                </p>
              )}
              {ev && !ev.done && (
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('sites.waitingBrowser')}</p>
                  {ev.url && (
                    <button onClick={() => openExternal(ev.url)} className="font-mono break-all text-left underline hover:text-foreground">
                      {ev.url}
                    </button>
                  )}
                </div>
              )}
              {ev && ev.done && ev.ok && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /> {t('sites.tokenSaved', { keys: (ev.keys || []).join(', ') })}
                </p>
              )}
              {ev && ev.done && !ev.ok && (
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {ev.error || t('sites.oauthFailed')}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={authorize} disabled={busy || (ev && !ev.done)}>
                  {busy || (ev && !ev.done) ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 me-1" />}
                  {configured ? t('sites.reauthorize') : t('sites.authorize')}
                </Button>
                {ev && !ev.done && (
                  <Button size="sm" variant="ghost" onClick={() => sitesApi.cancelOauth(site.id).then(() => clearOauth(site.id))}>
                    <X className="w-3.5 h-3.5 me-1" /> {t('common.cancel')}
                  </Button>
                )}
                {configured && !(ev && !ev.done) && (
                  <Button size="sm" variant="ghost" onClick={clearSite}>
                    <Trash2 className="w-3.5 h-3.5 me-1" /> {t('sites.clear')}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Pixiv token */}
          {site.auth === 'token' && (
            <div className="space-y-2 pt-1">
              {site.help && (
                <button onClick={() => openExternal(site.help)} className="text-xs underline text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  {t('sites.howToGetToken')} <ExternalLink className="w-3 h-3" />
                </button>
              )}
              <Input value={d.refresh_token} onChange={e => setD(s => ({ ...s, refresh_token: e.target.value }))}
                placeholder="refresh-token" aria-label={t('sites.refreshTokenLabel')} className="w-full max-w-lg font-mono text-xs" />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={savePixiv} disabled={busy || !d.refresh_token.trim()}>{t('sites.save')}</Button>
                {configured && <Button size="sm" variant="ghost" onClick={clearSite}><Trash2 className="w-3.5 h-3.5 me-1" />{t('sites.clear')}</Button>}
              </div>
            </div>
          )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RowActions({ busy, save, verify, runVerify, probe, configured, clearSite, t }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size="sm" onClick={save} disabled={busy}>
        {busy && <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />}{t('sites.save')}
      </Button>
      {probe && (
        <Button size="sm" variant="outline" onClick={runVerify} disabled={verify?.loading}>
          {verify?.loading ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : null}{t('sites.verify')}
        </Button>
      )}
      {configured && (
        <Button size="sm" variant="ghost" onClick={clearSite}>
          <Trash2 className="w-3.5 h-3.5 me-1" /> {t('sites.clear')}
        </Button>
      )}
      {verify && !verify.loading && (
        <span className={`text-xs flex items-center gap-1.5 ${verify.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
          {verify.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {verify.ok ? t('sites.verifyOk') : (verify.message || t('sites.verifyFail'))}
        </span>
      )}
    </div>
  );
}

export default function Sites() {
  const { t } = useI18n();
  const [rows, setRows] = useState({});
  const [browsers, setBrowsers] = useState([]);
  const [ck, setCk] = useState(null);
  const [openSite, setOpenSite] = useState(null);

  const load = useCallback(() => { sitesApi.list().then(setRows).catch(() => {}); }, []);
  const loadCookies = useCallback(() => {
    envApi.cookies().then(setCk).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    loadCookies();
    envApi.browsers().then(setBrowsers).catch(() => {});
  }, [load, loadCookies]);

  return (
    <div className="space-y-8 pb-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight leading-none">{t('sites.title')}</h1>
      </header>

      <CookieDefaults browsers={browsers} ck={ck} onReload={loadCookies} />

      {SITE_GROUPS.map(group => (
        <section key={group.key} className="space-y-3">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{group.title}</h2>
          <div className="space-y-2">
            {group.sites.map(site => (
              <SiteRow
                key={site.id} site={site} row={rows[site.id]} ck={ck}
                open={openSite === site.id}
                onToggle={() => setOpenSite(o => (o === site.id ? null : site.id))}
                onCollapse={() => setOpenSite(null)}
                onSaved={load} onCookies={loadCookies}
              />
            ))}
          </div>
        </section>
      ))}

      <button onClick={() => openExternal('https://gdl-org.github.io/docs/supportedsites.html')}
        className="text-xs text-muted-foreground underline hover:text-foreground">
        {t('sites.supportedLink')}
      </button>
    </div>
  );
}
