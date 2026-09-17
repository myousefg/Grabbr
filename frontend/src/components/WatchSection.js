import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Film, ImageOff, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';
import { jobsApi, thumbUrl } from '@/lib/api';
import { snappy } from '@/lib/motion';

const INTERVALS = [15, 30, 60, 180, 360, 720, 1440];

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Same fallback-to-icon behavior as History's thumbnail grid.
function Thumb({ f }) {
  const [failed, setFailed] = useState(false);
  const Icon = f.kind === 'video' ? Film : ImageOff;
  return failed ? (
    <span className="w-full h-full flex items-center justify-center">
      <Icon className="w-5 h-5 text-muted-foreground" />
    </span>
  ) : (
    <img
      src={thumbUrl(f.path)} alt={f.name} loading="lazy"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  );
}

function WatchRow({ w, active, onUpdate, onRemove, onCheckNow }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);
  const panelId = useId();
  const canExpand = !!w.last_job_id && w.last_found > 0;

  const status = active
    ? t('watch.status.checking')
    : w.last_status === 'error'
      ? t('watch.status.error', { time: timeAgo(w.last_checked_at) })
      : w.last_found > 0
        ? t('watch.status.found', { count: w.last_found, time: timeAgo(w.last_checked_at) })
        : w.last_checked_at
          ? t('watch.status.upToDate', { time: timeAgo(w.last_checked_at) })
          : t('watch.status.never');

  const toggle = async () => {
    if (!canExpand) return;
    const next = !open;
    setOpen(next);
    if (next && files === null) {
      try { setFiles((await jobsApi.files(w.last_job_id)).files || []); }
      catch { setFiles([]); }
    }
  };

  return (
    <div className="border border-border rounded-md overflow-hidden surface-elevated" data-testid={`watch-${w.id}`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${w.last_status === 'error' ? 'bg-destructive' : w.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
          aria-hidden="true"
        />
        <span className="font-mono text-xs truncate flex-1 min-w-0">{w.url}</span>
        <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:block">{status}</span>
        <Select value={String(w.interval_min)} onValueChange={v => onUpdate(w.id, { interval_min: Number(v) })}>
          <SelectTrigger className="w-24 h-7 text-[11px]" data-testid={`watch-interval-${w.id}`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {INTERVALS.map(m => <SelectItem key={m} value={String(m)}>{t(`watch.interval.${m}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0"
          title={w.enabled ? t('watch.pause') : t('watch.resume')}
          onClick={() => onUpdate(w.id, { enabled: !w.enabled })}
        >
          {w.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0"
          title={t('watch.checkNow')} disabled={active || !w.enabled}
          onClick={() => onCheckNow(w.id)}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          title={t('watch.remove')} onClick={() => onRemove(w.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0"
          disabled={!canExpand} aria-expanded={open} aria-controls={panelId}
          title={canExpand ? t('watch.viewFiles') : undefined}
          onClick={toggle}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''} ${canExpand ? '' : 'opacity-30'}`} />
        </Button>
      </div>

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
            <div className="px-3 pb-3 pt-1 border-t border-border bg-muted/20">
              {files && files.length > 0 ? (
                <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 mt-2">
                  {files.slice(0, 24).map(f => (
                    <div key={f.path} className="relative aspect-square rounded overflow-hidden border border-border bg-background">
                      <Thumb f={f} />
                    </div>
                  ))}
                  {w.last_found > files.length && (
                    <span className="aspect-square rounded border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">
                      +{w.last_found - files.length}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pt-2">{t('common.loading')}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function WatchSection({ watches, onUpdate, onRemove, onCheckNow, emptyMessage }) {
  const { t } = useI18n();
  const { active } = useJobs();
  const activeWatchIds = useMemo(
    () => new Set(active.filter(j => j.watch_id).map(j => j.watch_id)),
    [active],
  );

  if (!watches.length) {
    if (!emptyMessage) return null;
    return (
      <p className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-6 text-center">
        {emptyMessage}
      </p>
    );
  }

  const update = async (id, patch) => {
    try { await onUpdate(id, patch); } catch { toast.error(t('watch.actionFailed')); }
  };
  const remove = async (id) => {
    try { await onRemove(id); toast.success(t('watch.removed')); } catch { toast.error(t('watch.actionFailed')); }
  };
  const checkNow = async (id) => {
    try { await onCheckNow(id); } catch { toast.error(t('watch.actionFailed')); }
  };

  return (
    <div className="space-y-2">
      {watches.map(w => (
        <WatchRow
          key={w.id} w={w} active={activeWatchIds.has(w.id)}
          onUpdate={update} onRemove={remove} onCheckNow={checkNow}
        />
      ))}
    </div>
  );
}
