import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  Search, Trash2, ChevronDown, RotateCcw, FolderOpen, KeyRound, Film, FolderX, ImageOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';
import { useSettings } from '@/context/SettingsProvider';
import { jobsApi, thumbUrl } from '@/lib/api';
import { isElectron } from '@/lib/electron';
import { useCooldownTick, HINT_KEY } from '@/lib/jobHints';
import { snappy, listItem } from '@/lib/motion';

const DOT = {
  done: 'bg-emerald-500', error: 'bg-destructive', canceled: 'bg-muted-foreground/40',
};

function samePath(a, b) {
  if (!a || !b) return false;
  const norm = (s) => s.replace(/[\\/]+/g, '\\').replace(/\\+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Thumbnail cell. Images load straight from disk; videos get an ffmpeg-extracted
// frame from the backend. Either can fall back to an icon if it can't render.
function Thumb({ f }) {
  const [failed, setFailed] = useState(false);
  const Icon = f.kind === 'video' ? Film : ImageOff;
  return (
    <>
      {failed ? (
        <span className="w-full h-full flex items-center justify-center">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </span>
      ) : (
        <img
          src={thumbUrl(f.path)} alt={f.name} loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      )}
      {f.kind === 'video' && !failed && (
        <span className="absolute bottom-0.5 end-0.5 rounded bg-black/60 p-0.5 leading-none">
          <Film className="w-3 h-3 text-white" />
        </span>
      )}
    </>
  );
}

function HistoryRow({ job }) {
  const { t } = useI18n();
  const { retry, remove, deleteFiles } = useJobs();
  const { env } = useSettings();
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState(null);
  const [files, setFiles] = useState(null);
  const panelId = useId();
  const cooldown = useCooldownTick(job);
  const flagged = job.hint === 'auth' || job.hint === 'cookies_locked' || job.hint === 'rate_limited';
  // "One flat folder" (or any structure gallery-dl didn't subfolder) puts this
  // job's files directly in the shared download root; deleting them would
  // wipe every other job's files too, so the backend refuses and we shouldn't
  // offer a confirm dialog that promises otherwise.
  const sharedDest = samePath(job.dest_dir, env?.output_dir);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && log === null) {
      try { setLog((await jobsApi.log(job.id)).log || ''); } catch { setLog(''); }
      if (job.files_ok > 0) {
        try { setFiles((await jobsApi.files(job.id)).files || []); } catch { setFiles([]); }
      } else {
        setFiles([]);
      }
    }
  };

  const result = job.files_error > 0 && !job.files_ok
    ? <span className="text-destructive">{job.files_error} {t('dashboard.errors')}</span>
    : <span>{job.files_ok || 0}{job.total > 0 ? `/${job.total}` : ''} {t('dashboard.files')}{job.files_skipped ? ` · ${job.files_skipped} ${t('dashboard.skipped')}` : ''}</span>;

  return (
    <div className="border border-border rounded-md overflow-hidden surface-elevated" data-testid={`hist-${job.id}`}>
      <button onClick={toggle} aria-expanded={open} aria-controls={panelId} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent/50 transition-colors">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[job.status] || 'bg-muted-foreground/40'}`} aria-hidden="true" />
        <span className="sr-only">{t(`dashboard.status.${job.status}`)}</span>
        <span className="font-mono text-xs truncate flex-1 min-w-0">{job.url}</span>
        {flagged ? <KeyRound className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" /> : null}
        <span className="text-[11px] text-muted-foreground font-mono shrink-0 hidden sm:block">{result}</span>
        <span className="text-[11px] text-muted-foreground shrink-0 w-8 text-right">{timeAgo(job.finished_at || job.created_at)}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
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
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border bg-muted/20">
          <div className="text-[11px] font-mono text-muted-foreground break-all">{job.dest_dir}</div>

          {files && files.length > 0 && (
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
              {files.slice(0, 24).map((f) => (
                <button
                  key={f.path}
                  onClick={() => isElectron && window.electronAPI.openPath(f.path)}
                  title={f.name}
                  className="relative aspect-square rounded overflow-hidden border border-border bg-background hover:ring-2 hover:ring-ring transition-shadow"
                >
                  <Thumb f={f} />
                </button>
              ))}
              {job.files_ok > files.length && (
                <span className="aspect-square rounded border border-dashed border-border flex items-center justify-center text-[10px] text-muted-foreground">
                  +{job.files_ok - files.length}
                </span>
              )}
            </div>
          )}
          {job.error_text && (
            <p className="text-xs font-mono text-destructive whitespace-pre-wrap">{job.error_text}</p>
          )}
          {(job.hint === 'auth' || job.hint === 'cookies_locked') && (
            <Link to="/sites" className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <KeyRound className="w-3.5 h-3.5" /> {t(HINT_KEY[job.hint])}
            </Link>
          )}
          {job.hint === 'rate_limited' && (
            <p className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
              {cooldown > 0 ? t('dashboard.rateLimitedWait', { min: cooldown }) : t('dashboard.rateLimited')}
            </p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button size="sm" variant="ghost" onClick={() => retry(job.id)}>
              <RotateCcw className="w-3.5 h-3.5 me-1" /> {t('history.reDownload')}
            </Button>
            {isElectron && job.dest_dir && (
              <Button size="sm" variant="ghost" onClick={() => window.electronAPI.openPath(job.dest_dir)}>
                <FolderOpen className="w-3.5 h-3.5 me-1" /> {t('history.openFolder')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => remove(job.id)}>
              <Trash2 className="w-3.5 h-3.5 me-1" /> {t('history.remove')}
            </Button>
            {sharedDest ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm" variant="ghost"
                    className="text-muted-foreground/50 hover:text-muted-foreground/50 hover:bg-transparent cursor-default"
                    onClick={() => toast.info(t('history.sharedFolderNote'))}
                  >
                    <FolderX className="w-3.5 h-3.5 me-1" /> {t('history.delete')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                  {t('history.sharedFolderNote')}
                </TooltipContent>
              </Tooltip>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm" variant="ghost"
                    className="text-destructive hover:text-destructive"
                    title={t('history.deleteConfirmDesc')}
                  >
                    <FolderX className="w-3.5 h-3.5 me-1" /> {t('history.delete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('history.deleteConfirm')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('history.deleteConfirmDesc')}
                      {job.dest_dir && (
                        <span className="block mt-1 font-mono text-[11px] break-all">{job.dest_dir}</span>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        try {
                          const r = await deleteFiles(job.id);
                          toast.success(t('history.deleted', { count: r?.removed ?? 0 }));
                        } catch (e) {
                          toast.error(e?.response?.data?.detail || t('history.deleteFailed'));
                        }
                      }}
                    >
                      {t('common.confirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          {log !== null && (
            <ScrollArea className="h-40 rounded border border-border bg-background">
              <pre className="p-2 text-[11px] font-mono leading-relaxed">{log || <span className="text-muted-foreground">{t('common.loading')}</span>}</pre>
            </ScrollArea>
          )}
        </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function History() {
  const { t } = useI18n();
  const { finished, clearFinished } = useJobs();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const rows = useMemo(() => finished.filter(j => {
    if (status !== 'all' && j.status !== status) return false;
    if (query && !j.url.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [finished, query, status]);

  const doClear = async () => { await clearFinished(); toast.success(t('history.clear')); };

  return (
    <div className="space-y-5 pb-12">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight leading-none">{t('history.title')}</h1>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('history.search')}
            className="ps-9 h-9" data-testid="history-search" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36 h-9" data-testid="history-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('history.allStatus')}</SelectItem>
            <SelectItem value="done">{t('dashboard.status.done')}</SelectItem>
            <SelectItem value="error">{t('dashboard.status.error')}</SelectItem>
            <SelectItem value="canceled">{t('dashboard.status.canceled')}</SelectItem>
          </SelectContent>
        </Select>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-9" disabled={!finished.length}>
              <Trash2 className="w-4 h-4 me-2" /> {t('history.clear')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('history.clearConfirm')}</AlertDialogTitle>
              <AlertDialogDescription>{t('history.clearConfirmDesc')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={doClear}>{t('common.confirm')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-10 text-center">
          <p className="text-sm font-medium">{query ? t('history.noResults', { query }) : t('history.empty')}</p>
          {!query && <p className="text-xs text-muted-foreground mt-1">{t('history.emptyDesc')}</p>}
        </div>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {rows.map(job => (
              <motion.div
                key={job.id}
                layout
                initial={listItem.initial}
                animate={listItem.animate}
                exit={listItem.exit}
                transition={snappy}
              >
                <HistoryRow job={job} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
