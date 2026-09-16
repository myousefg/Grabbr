import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { Download, Eye, Loader2, AlertTriangle, ClipboardPaste } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import JobCard from '@/components/JobCard';
import PreviewDialog from '@/components/PreviewDialog';
import OutputSettings from '@/components/OutputSettings';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';
import { useSettings } from '@/context/SettingsProvider';
import { isElectron } from '@/lib/electron';
import { presetsApi } from '@/lib/api';
import { snappy, listItem } from '@/lib/motion';

const MODES = ['auto', 'page', 'scan'];
// Grabbr passes URLs straight to gallery-dl, so a mode is just a prefix.
const MODE_PREFIX = { auto: '', page: 'generic:', scan: 'r:' };

// Sites with a real gallery-dl extractor. "Whole page" / "Scan" only grab page
// chrome here (Instagram etc. render posts via JS), so warn if a mode is picked.
const DEDICATED = /(?:^|\.)(?:instagram|twitter|x|nitter|reddit|redd|pixiv|fanbox|fantia|patreon|deviantart|tumblr|artstation|newgrounds|flickr|weibo|pinterest|kemono|coomer|danbooru|gelbooru|e621|e926|rule34|konachan|yande|sankakucomplex|zerochan|bsky|mastodon\.social|threads\.net|facebook|tiktok|youtube|bilibili)\.\w/i;

function splitUrls(text) {
  return text.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
}

function hasDedicatedExtractor(url) {
  try { return DEDICATED.test(new URL(url.replace(/^[a-z-]+:(?=https?:)/i, '')).hostname); }
  catch { return false; }
}

const YOUTUBE_RE = /(?:^|\.)(?:youtube\.com|youtu\.be|music\.youtube\.com)$/i;
function isYoutubeUrl(url) {
  try { return YOUTUBE_RE.test(new URL(url.replace(/^[a-z-]+:(?=https?:)/i, '')).hostname); }
  catch { return false; }
}

function isValidUrl(url) {
  try {
    const stripped = url.replace(/^[a-z-]+:(?=https?:)/i, '');
    const parsed = new URL(stripped);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function applyMode(url, mode) {
  const p = MODE_PREFIX[mode];
  if (!p) return url;
  if (/^(generic:|g:|r:|ytdl:|[a-z-]+:https?:)/i.test(url)) return url; // already prefixed
  return p + url;
}

export default function Dashboard() {
  const { t } = useI18n();
  const { active, queueView, createJobs } = useJobs();
  const { settings: s } = useSettings();
  const [text, setText] = useState('');
  const [mode, setMode] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { url, options }
  const [quality, setQuality] = useState('best'); // YouTube only
  const [format, setFormat] = useState('mp4');  // YouTube only: mp4 | mp3
  const [presets, setPresets] = useState([]);
  const [preset, setPreset] = useState('none');
  const urlInputId = useId();

  useEffect(() => { presetsApi.list().then(setPresets).catch(() => {}); }, []);

  const urls = useMemo(() => splitUrls(text), [text]);
  const modeMismatch = mode !== 'auto' && urls.some(hasDedicatedExtractor);
  const hasInvalidUrl = urls.length > 0 && !urls.every(isValidUrl);
  const allYoutube = urls.length > 0 && urls.every(isYoutubeUrl);
  const jobOptions = () => {
    const o = {};
    if (s?.default_range?.trim()) o.range = s.default_range.trim();
    if (allYoutube) {
      // quality is a video-resolution filter; it does nothing once yt-dlp is
      // extracting audio only, so it's dropped along with hiding the select.
      if (format !== 'mp3' && quality !== 'best') o.quality = quality;
      if (format && format !== 'mp4') o.format = format;
    }
    // allYoutube guard here too, not just on hiding the select: the picked
    // value otherwise lingers in state and would still get attached (to no
    // effect) if the user pastes a YouTube URL after choosing a preset.
    if (preset !== 'none' && !allYoutube) o.preset_id = preset;
    return Object.keys(o).length ? o : undefined;
  };

  useEffect(() => {
    if (isElectron) window.electronAPI.setTrayBadge(active.length);
  }, [active.length]);

  const appendText = (chunk) => {
    const c = (chunk || '').trim();
    if (!c) return;
    setText(prev => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n${c}` : c));
  };

  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip?.trim()) return;
      appendText(clip);
    } catch {
      toast.error(t('dashboard.pasteFailed'));
    }
  };

  const [dragging, setDragging] = useState(false);
  const onDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const dt = e.dataTransfer;
    const txtFiles = [...(dt.files || [])].filter(f => /\.(txt|csv|md)$/i.test(f.name));
    if (txtFiles.length) {
      for (const f of txtFiles) {
        try { appendText(await f.text()); } catch { /* ignore */ }
      }
      return;
    }
    const t2 = dt.getData('text/uri-list') || dt.getData('text/plain');
    if (t2) appendText(t2);
  };

  const submit = async (list, submitMode = mode, opts = jobOptions()) => {
    if (!list.length) return;
    if (!list.every(isValidUrl)) {
      toast.error(t('dashboard.invalidUrl'));
      return;
    }
    setBusy(true);
    try {
      const created = await createJobs(list.map(u => applyMode(u, submitMode)), opts);
      toast.success(t('dashboard.added', { count: created.length, s: created.length === 1 ? '' : 's' }));
      setText('');
    } catch {
      toast.error(t('dashboard.addFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <header />

      {/* URL input */}
      <div className="space-y-3">
        <label htmlFor={urlInputId} className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground block">
          {t('dashboard.inputLabel')}
        </label>
        <div
          className="relative"
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Textarea
            id={urlInputId}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('dashboard.urlPlaceholder')}
            rows={3}
            className={`font-mono text-xs resize-none pe-24 transition-colors ${dragging ? 'ring-2 ring-ring border-ring' : ''}`}
            data-testid="url-input"
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(urls); }}
          />
          <Button
            variant="outline" size="sm" onClick={paste} data-testid="paste-btn"
            className="absolute top-2 end-2 h-7"
          >
            <ClipboardPaste className="w-3.5 h-3.5 me-1" /> {t('dashboard.paste')}
          </Button>
        </div>

        {/* Primary actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => submit(urls)} disabled={busy || !urls.length} data-testid="download-btn">
            {busy ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Download className="w-4 h-4 me-2" />}
            {t('dashboard.add')}{urls.length > 1 ? ` (${urls.length})` : ''}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (!isValidUrl(urls[0])) { toast.error(t('dashboard.invalidUrl')); return; }
              setPreview({ url: applyMode(urls[0], mode), options: jobOptions() });
            }}
            disabled={busy || urls.length !== 1 || isYoutubeUrl(urls[0])}
            data-testid="preview-btn"
          >
            <Eye className="w-4 h-4 me-2" /> {t('dashboard.preview')}
          </Button>
          {allYoutube && (
            <>
              {format !== 'mp3' && (
                <Select value={quality} onValueChange={setQuality}>
                  <SelectTrigger className="w-28" data-testid="yt-quality"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['best', '1080', '720', '480', '360'].map(q => (
                      <SelectItem key={q} value={q}>{t(`dashboard.quality.${q}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="w-24" data-testid="yt-format"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">{t('dashboard.format.mp4')}</SelectItem>
                  <SelectItem value="mp3">{t('dashboard.format.mp3')}</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          {/* Presets are gallery-dl config overrides - they have no effect on
              the separate yt-dlp path a YouTube URL takes, so offering one
              here would apply silently to nothing. */}
          {presets.length > 0 && !allYoutube && (
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-40 ms-auto" data-testid="preset-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('dashboard.noPreset')}</SelectItem>
                {presets.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className={`w-[190px] ${presets.length > 0 && !allYoutube ? '' : 'ms-auto'}`} data-testid="mode-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODES.map(m => <SelectItem key={m} value={m}>{t(`dashboard.mode.${m}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {hasInvalidUrl && (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            {t('dashboard.invalidUrl')}
          </p>
        )}
        {mode !== 'auto' && !modeMismatch && (
          <p className="text-xs text-muted-foreground">{t(`dashboard.modeHint.${mode}`)}</p>
        )}
        {modeMismatch && (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            {t('dashboard.modeMismatch')}
          </p>
        )}
      </div>

      {/* Active / queued */}
      <section className="space-y-3">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{t('dashboard.queue')}</h2>
        {queueView.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-6 text-center">
            {t('dashboard.noActive')}
          </p>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {queueView.map(job => (
                <motion.div
                  key={job.id}
                  layout
                  initial={listItem.initial}
                  animate={listItem.animate}
                  exit={listItem.exit}
                  transition={snappy}
                >
                  <JobCard job={job} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <OutputSettings />

      <PreviewDialog
        url={preview?.url}
        options={preview?.options}
        open={!!preview}
        onOpenChange={o => !o && setPreview(null)}
        onConfirm={(u, count, rangeOverride) => submit([u], mode, {
          ...preview?.options,
          total: count,
          ...(rangeOverride ? { range: rangeOverride } : {}),
        })}
      />
    </div>
  );
}
