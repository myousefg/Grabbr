import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, ImageIcon, Film, Music, File, AlertTriangle, KeyRound, RefreshCw, ImageOff, CheckSquare, Square,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { previewApi } from '@/lib/api';
import { useI18n } from '@/context/I18nProvider';

// gallery-dl's --range indexes the full, unfiltered enumeration. If a range was
// already applied for this preview, shown files start at that range's first
// index rather than 1, so selecting a file has to account for the offset.
function rangeStart(range) {
  const v = (range || '').trim();
  if (!v || /^\d+$/.test(v)) return 1; // blank or "N" (= "1-N")
  const m = v.match(/^(\d+)-/);
  return m ? parseInt(m[1], 10) : 1;
}

function hostnameOf(url) {
  try {
    const stripped = (url || '').replace(/^[a-z-]+:(?=https?:)/i, '');
    return new URL(stripped).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
}

const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'jxl', 'svg']);
const VID_EXT = new Set(['mp4', 'webm', 'mkv', 'mov', 'm4v', 'gifv']);
const AUD_EXT = new Set(['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus']);
const KIND_ICON = { image: ImageIcon, video: Film, audio: Music, other: File };

function fileKind(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (IMG_EXT.has(ext)) return 'image';
  if (VID_EXT.has(ext)) return 'video';
  if (AUD_EXT.has(ext)) return 'audio';
  return 'other';
}

function Skeleton() {
  return (
    <div className="rounded-md border border-border p-2 space-y-1.5">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-6 bg-muted/60 rounded animate-pulse" style={{ animationDelay: `${i * 70}ms` }} />
      ))}
    </div>
  );
}

export default function PreviewDialog({ url, options, open, onOpenChange, onConfirm }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [excluded, setExcluded] = useState(() => new Set());

  const runPreview = useCallback(() => {
    if (!url) return;
    setLoading(true); setData(null); setError(null); setExcluded(new Set());
    previewApi.run(url, options)
      .then(setData)
      .catch(e => setError(e?.response?.data?.detail || String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!open) return;
    runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url]);

  const count = data?.count ?? 0;
  const files = data?.files || [];
  const selectedCount = files.length - excluded.size;
  const allSelected = excluded.size === 0;

  const toggleFile = (i) => setExcluded(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });
  const toggleAll = () => setExcluded(allSelected ? new Set(files.map((_, i) => i)) : new Set());

  const confirm = () => {
    let rangeOverride;
    let total = count;
    if (!allSelected && files.length) {
      const base = rangeStart(options?.range);
      const idxs = files.map((_, i) => i).filter(i => !excluded.has(i)).map(i => base + i);
      rangeOverride = idxs.join(',');
      total = idxs.length;
    }
    onConfirm(url, total, rangeOverride);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="tracking-tight">{t('preview.title')}</DialogTitle>
          <DialogDescription className="font-mono text-xs truncate" title={url}>
            {hostnameOf(url)}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[220px] min-w-0">
          {loading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('preview.resolving')}
              </div>
              <Skeleton />
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 text-center py-8">
              <AlertTriangle className="w-8 h-8 text-destructive/70" />
              <p className="font-mono text-xs text-muted-foreground max-w-sm break-all">{error}</p>
              <Button size="sm" variant="outline" onClick={runPreview}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> {t('preview.retry')}
              </Button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-semibold">
                  {t('preview.found', { count, s: count === 1 ? '' : 's' })}
                  {data.truncated && (
                    <span className="font-normal text-muted-foreground ml-1.5">
                      ({t('preview.truncated', { count: data.files.length })})
                    </span>
                  )}
                </span>
              </div>

              {count === 0 && (
                <div className="flex flex-col items-center gap-2 text-center py-8 text-muted-foreground">
                  <ImageOff className="w-8 h-8 opacity-40" />
                  <p className="text-xs max-w-xs">{t('preview.noFiles')}</p>
                </div>
              )}

              {data.needs_auth && (
                <Link
                  to="/sites"
                  onClick={() => onOpenChange(false)}
                  className="inline-flex items-center gap-1.5 text-xs px-2 py-1 my-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" /> {t('preview.needsAuth')}
                </Link>
              )}
              {data.rate_limited && !data.needs_auth && (
                <p className="text-xs px-2 py-1 my-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  {t('dashboard.rateLimited')}
                </p>
              )}

              {files.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {t('preview.selected', { n: selectedCount, count: files.length })}
                    </span>
                    <Button variant="ghost" size="sm" onClick={toggleAll} className="h-6 px-2 text-[11px]">
                      {allSelected
                        ? <Square className="w-3 h-3 mr-1" />
                        : <CheckSquare className="w-3 h-3 mr-1" />}
                      {allSelected ? t('preview.selectNone') : t('preview.selectAll')}
                    </Button>
                  </div>
                  <div className="h-56 overflow-y-auto overflow-x-hidden rounded-md border border-border">
                    <ul className="divide-y divide-border/60">
                      {files.map((f, i) => {
                        const Icon = KIND_ICON[fileKind(f)];
                        const on = !excluded.has(i);
                        return (
                          <li key={i}>
                            <label
                              className={`flex items-center gap-2.5 min-w-0 px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${on ? 'hover:bg-accent/50' : 'opacity-50 hover:bg-accent/30'}`}
                            >
                              <span className="w-6 shrink-0 text-right font-mono text-[10px] text-muted-foreground/70 tabular-nums">
                                {i + 1}
                              </span>
                              <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate flex-1 min-w-0 font-mono">{f}</span>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggleFile(i)}
                                className="h-3.5 w-3.5 rounded border-border accent-primary shrink-0"
                              />
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>
              )}

              {data.errors?.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">
                    {t('preview.errors')}
                  </p>
                  <div className="text-xs font-mono text-destructive space-y-0.5">
                    {data.errors.slice(0, 5).map((e, i) => <div key={i} className="truncate">{e}</div>)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('preview.close')}</Button>
          <Button onClick={confirm} disabled={loading || !!error || (files.length > 0 && selectedCount === 0)}>
            {!loading && files.length > 0 && !allSelected
              ? t('preview.downloadSelected', { n: selectedCount })
              : t('preview.downloadThis')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
