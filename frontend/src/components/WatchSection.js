import { useMemo } from 'react';
import { toast } from 'sonner';
import { Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';

const INTERVALS = [15, 30, 60, 180, 360, 720, 1440];

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function WatchRow({ w, active, onUpdate, onRemove, onCheckNow }) {
  const { t } = useI18n();
  const status = active
    ? t('watch.status.checking')
    : w.last_status === 'error'
      ? t('watch.status.error', { time: timeAgo(w.last_checked_at) })
      : w.last_found > 0
        ? t('watch.status.found', { count: w.last_found, time: timeAgo(w.last_checked_at) })
        : w.last_checked_at
          ? t('watch.status.upToDate', { time: timeAgo(w.last_checked_at) })
          : t('watch.status.never');

  return (
    <div className="flex items-center gap-3 border border-border rounded-md px-3 py-2.5 surface-elevated" data-testid={`watch-${w.id}`}>
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
    </div>
  );
}

export default function WatchSection({ watches, onUpdate, onRemove, onCheckNow }) {
  const { t } = useI18n();
  const { active } = useJobs();
  const activeWatchIds = useMemo(
    () => new Set(active.filter(j => j.watch_id).map(j => j.watch_id)),
    [active],
  );

  if (!watches.length) return null;

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
    <section className="space-y-3">
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground block">{t('watch.section')}</span>
      <div className="space-y-2">
        {watches.map(w => (
          <WatchRow
            key={w.id} w={w} active={activeWatchIds.has(w.id)}
            onUpdate={update} onRemove={remove} onCheckNow={checkNow}
          />
        ))}
      </div>
    </section>
  );
}
