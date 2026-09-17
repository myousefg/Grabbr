import { useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeftRight, Check, FolderOpen, Image as ImageIcon, Loader2, Trash2, Upload, Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/context/I18nProvider';
import { useConversions } from '@/lib/convert';
import { isElectron } from '@/lib/electron';

const PHOTO_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'heic', 'heif', 'avif', 'tif', 'tiff']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'flv', 'wmv', 'mpg', 'mpeg', '3gp', 'ogv']);
const PHOTO_TARGETS = ['jpg', 'png', 'webp'];
const VIDEO_TARGETS = ['mp4', 'webm'];
const QUALITIES = ['high', 'medium', 'low'];

function extOf(path) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(path || '');
  return m ? m[1].toLowerCase() : '';
}
function kindOf(path) {
  const e = extOf(path);
  if (PHOTO_EXT.has(e)) return 'photo';
  if (VIDEO_EXT.has(e)) return 'video';
  return null;
}
function baseName(path) {
  return (path || '').split(/[\\/]/).pop();
}
function humanSize(n) {
  if (!n) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)}${units[i]}`;
}

const STATUS_STYLE = {
  queued:   'bg-muted text-muted-foreground',
  running:  'bg-primary/15 text-primary',
  done:     'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  error:    'bg-destructive/15 text-destructive',
};

function StagedRow({ item, onChangeTarget, onChangeQuality, onRemove }) {
  const { t } = useI18n();
  const Icon = item.kind === 'video' ? Video : ImageIcon;
  const targets = item.kind === 'video' ? VIDEO_TARGETS : PHOTO_TARGETS;
  return (
    <div className="flex items-center gap-3 border border-border rounded-md px-3 py-2.5 surface-elevated">
      <span className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <span className="font-mono text-xs truncate flex-1 min-w-0">{baseName(item.path)}</span>
      <Select value={item.target} onValueChange={v => onChangeTarget(item.id, v)}>
        <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {targets.map(f => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={item.quality} onValueChange={v => onChangeQuality(item.id, v)}>
        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {QUALITIES.map(q => <SelectItem key={q} value={q}>{t(`convert.quality.${q}`)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onRemove(item.id)}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function ConversionRow({ c, onRemove }) {
  const { t } = useI18n();
  const Icon = c.kind === 'video' ? Video : ImageIcon;
  return (
    <div className="flex items-center gap-3 border border-border rounded-md px-3 py-2.5 surface-elevated" data-testid={`convert-${c.id}`}>
      <span className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs truncate">{c.src_name}</p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
          <span className="uppercase">{extOf(c.src_name)}</span>
          <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
          <span className="uppercase text-primary">{c.target}</span>
          {c.status === 'done' && c.dest_size > 0 && (
            <span>&nbsp;·&nbsp;{humanSize(c.src_size)} &rarr; <b className="text-foreground">{humanSize(c.dest_size)}</b></span>
          )}
        </p>
      </div>
      {c.status === 'error' && (
        <p className="text-[11px] text-destructive max-w-[220px] truncate" title={c.error_text}>{c.error_text}</p>
      )}
      <span className={`text-[10px] font-medium tracking-[0.1em] uppercase px-2 py-1 rounded shrink-0 flex items-center gap-1 ${STATUS_STYLE[c.status] || ''}`}>
        {c.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
        {c.status === 'done' && <Check className="w-3 h-3" aria-hidden="true" />}
        {t(`convert.status.${c.status}`)}
      </span>
      {c.status === 'done' && isElectron && (
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title={t('convert.reveal')}
          onClick={() => window.electronAPI.showInFolder(c.dest_path)}>
          <FolderOpen className="w-3.5 h-3.5" />
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
        title={t('convert.remove')} onClick={() => onRemove(c.id)}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default function Convert() {
  const { t } = useI18n();
  const { conversions, add, remove, clearFinished } = useConversions();
  const [staged, setStaged] = useState([]);
  const [photoTarget, setPhotoTarget] = useState('jpg');
  const [photoQuality, setPhotoQuality] = useState('high');
  const [videoTarget, setVideoTarget] = useState('mp4');
  const [videoQuality, setVideoQuality] = useState('high');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const stageFiles = (paths) => {
    let skipped = 0;
    const items = [];
    for (const p of paths) {
      const kind = kindOf(p);
      if (!kind) { skipped += 1; continue; }
      items.push({
        id: `${Date.now()}_${items.length}_${Math.random().toString(36).slice(2, 7)}`,
        path: p,
        kind,
        target: kind === 'photo' ? photoTarget : videoTarget,
        quality: kind === 'photo' ? photoQuality : videoQuality,
      });
    }
    if (items.length) setStaged(prev => [...prev, ...items]);
    if (skipped > 0) toast.error(t('convert.unsupported', { name: `${skipped} file${skipped === 1 ? '' : 's'}` }));
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    if (!isElectron) return;
    const files = [...(e.dataTransfer?.files || [])];
    const paths = [];
    for (const f of files) {
      try {
        const p = await window.electronAPI.getPathForFile(f);
        if (p) paths.push(p);
      } catch { /* ignore */ }
    }
    stageFiles(paths);
  };

  const browse = async () => {
    if (!isElectron) return;
    const paths = await window.electronAPI.selectFiles({ title: t('convert.browse') });
    stageFiles(paths || []);
  };

  const changeTarget = (id, target) => setStaged(prev => prev.map(i => (i.id === id ? { ...i, target } : i)));
  const changeQuality = (id, quality) => setStaged(prev => prev.map(i => (i.id === id ? { ...i, quality } : i)));
  const removeStaged = (id) => setStaged(prev => prev.filter(i => i.id !== id));

  const convertAll = async () => {
    if (!staged.length) return;
    setBusy(true);
    try {
      await add(staged.map(i => ({ path: i.path, target: i.target, quality: i.quality })));
      setStaged([]);
    } catch {
      toast.error(t('convert.addFailed'));
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (id) => {
    try { await remove(id); } catch { /* already gone */ }
  };

  const finishedCount = conversions.filter(c => c.status === 'done' || c.status === 'error').length;

  return (
    <div className="space-y-6 pb-12">
      <header />

      <div
        className={`border-[1.5px] border-dashed rounded-xl p-8 text-center transition-colors ${dragging ? 'border-ring bg-accent/40' : 'border-border'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <ArrowLeftRight className="w-8 h-8 text-primary mx-auto mb-2.5" aria-hidden="true" />
        <h3 className="text-sm font-semibold mb-1">{t('convert.dropTitle')}</h3>
        <p className="text-xs text-muted-foreground mb-4">{t('convert.dropHint')}</p>
        <Button variant="outline" onClick={browse} disabled={!isElectron} data-testid="convert-browse-btn">
          <Upload className="w-4 h-4 me-2" aria-hidden="true" /> {t('convert.browse')}
        </Button>
      </div>

      {staged.length > 0 && (
        <>
          <div className="flex items-center gap-2 flex-wrap border border-border rounded-md px-3 py-2.5 bg-muted/20">
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">{t('convert.photosTo')}</span>
            <Select value={photoTarget} onValueChange={setPhotoTarget}>
              <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{PHOTO_TARGETS.map(f => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={photoQuality} onValueChange={setPhotoQuality}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{QUALITIES.map(q => <SelectItem key={q} value={q}>{t(`convert.quality.${q}`)}</SelectItem>)}</SelectContent>
            </Select>
            <Video className="w-3.5 h-3.5 text-muted-foreground ms-2" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">{t('convert.videosTo')}</span>
            <Select value={videoTarget} onValueChange={setVideoTarget}>
              <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{VIDEO_TARGETS.map(f => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={videoQuality} onValueChange={setVideoQuality}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{QUALITIES.map(q => <SelectItem key={q} value={q}>{t(`convert.quality.${q}`)}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={convertAll} disabled={busy} className="ms-auto" data-testid="convert-all-btn">
              {busy ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <ArrowLeftRight className="w-4 h-4 me-2" />}
              {t('convert.convertAll', { count: staged.length })}
            </Button>
          </div>

          <div className="space-y-2">
            {staged.map(item => (
              <StagedRow key={item.id} item={item} onChangeTarget={changeTarget} onChangeQuality={changeQuality} onRemove={removeStaged} />
            ))}
          </div>
        </>
      )}

      {conversions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={clearFinished} disabled={!finishedCount}>
              <Trash2 className="w-3.5 h-3.5 me-1.5" aria-hidden="true" /> {t('convert.clearFinished')}
            </Button>
          </div>
          <div className="space-y-2">
            {conversions.map(c => <ConversionRow key={c.id} c={c} onRemove={doRemove} />)}
          </div>
        </div>
      )}
    </div>
  );
}
