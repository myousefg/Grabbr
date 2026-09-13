import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, X, RotateCcw, Trash2, FolderOpen, Terminal, ChevronDown, KeyRound, Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';
import { jobsApi } from '@/lib/api';
import { isElectron } from '@/lib/electron';
import { useCooldownTick, HINT_KEY } from '@/lib/jobHints';

const STATUS_STYLE = {
  queued:   'bg-muted text-muted-foreground',
  running:  'bg-primary text-primary-foreground',
  done:     'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  error:    'bg-destructive/15 text-destructive',
  canceled: 'bg-muted text-muted-foreground',
};

const LINE_COLOR = {
  file: 'text-foreground',
  skip: 'text-muted-foreground',
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-destructive',
  info: 'text-muted-foreground',
};

export default function JobCard({ job }) {
  const { t } = useI18n();
  const { logs, cancel, retry, remove, setJobOpen } = useJobs();
  const [open, setOpen] = useState(false);
  const [fullLog, setFullLog] = useState(null);

  const live = logs[job.id] || [];
  const active = job.status === 'running' || job.status === 'queued';
  const cooldown = useCooldownTick(job);

  // Tells JobsProvider this card is expanded, so a just-finished job doesn't
  // vanish out of Queue & Active mid-read.
  useEffect(() => () => setJobOpen(job.id, false), [job.id, setJobOpen]);

  const toggleLog = async () => {
    const next = !open;
    setOpen(next);
    setJobOpen(job.id, next);
    if (next && !active && fullLog === null) {
      try { setFullLog((await jobsApi.log(job.id)).log || ''); }
      catch { setFullLog(''); }
    }
  };

  const openFolder = () => { if (isElectron && job.dest_dir) window.electronAPI.openPath(job.dest_dir); };

  return (
    <div className="border border-border rounded-lg p-4 space-y-3" data-testid={`job-${job.id}`}>
      <div className="flex items-start gap-3">
        <span className={`text-[10px] font-medium tracking-[0.15em] px-2 py-1 rounded ${STATUS_STYLE[job.status] || ''}`}>
          {t(`dashboard.status.${job.status}`)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs break-all leading-relaxed">{job.url}</p>
        </div>
        {job.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
        <span className="text-foreground">
          {job.files_ok || 0}{job.total > 0 ? ` / ${job.total}` : ''} {t('dashboard.files')}
        </span>
        {job.files_skipped > 0 && <span>{job.files_skipped} {t('dashboard.skipped')}</span>}
        {job.files_error > 0 && <span className="text-destructive">{job.files_error} {t('dashboard.errors')}</span>}
      </div>

      {job.total > 0 && (job.status === 'running' || job.status === 'queued') && (
        <Progress value={Math.min(100, ((job.files_ok || 0) / job.total) * 100)} className="h-1" />
      )}

      {job.status === 'running' && job.current_file && (
        <p className="text-xs font-mono text-muted-foreground truncate">↳ {job.current_file}</p>
      )}

      {job.status === 'error' && job.error_text && (
        <p className="text-xs font-mono text-destructive whitespace-pre-wrap line-clamp-3">{job.error_text}</p>
      )}

      {(job.hint === 'auth' || job.hint === 'cookies_locked') && (job.status === 'error' || job.status === 'done') && (
        <Link
          to="/sites"
          className="inline-flex items-start gap-1.5 text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
        >
          <KeyRound className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {t(HINT_KEY[job.hint])}
        </Link>
      )}
      {job.hint === 'rate_limited' && job.status === 'error' && (
        <p className="inline-flex items-start gap-1.5 text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Timer className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {cooldown > 0 ? t('dashboard.rateLimitedWait', { min: cooldown }) : t('dashboard.rateLimited')}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {active && (
          <Button size="sm" variant="ghost" onClick={() => cancel(job.id)} data-testid="job-cancel">
            <X className="w-3.5 h-3.5 mr-1" /> {t('dashboard.cancel')}
          </Button>
        )}
        {!active && (
          <>
            <Button size="sm" variant="ghost" onClick={() => retry(job.id)} data-testid="job-retry">
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> {t('dashboard.retry')}
            </Button>
            {isElectron && job.dest_dir && (
              <Button size="sm" variant="ghost" onClick={openFolder}>
                <FolderOpen className="w-3.5 h-3.5 mr-1" /> {t('dashboard.openFolder')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => remove(job.id)} data-testid="job-remove">
              <Trash2 className="w-3.5 h-3.5 mr-1" /> {t('dashboard.remove')}
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={toggleLog} className="ml-auto">
          <Terminal className="w-3.5 h-3.5 mr-1" />
          {open ? t('dashboard.hideLog') : t('dashboard.log')}
          <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      {open && (
        <ScrollArea className="h-48 rounded-md border border-border bg-muted/30">
          <pre className="p-3 text-[11px] font-mono leading-relaxed">
            {active
              ? (live.length
                  ? live.map((l, i) => <div key={i} className={LINE_COLOR[l.kind] || ''}>{l.text}</div>)
                  : <span className="text-muted-foreground">…</span>)
              : (fullLog ?? '…')}
          </pre>
        </ScrollArea>
      )}
    </div>
  );
}
