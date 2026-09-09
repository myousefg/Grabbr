import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, FileImage, AlertTriangle, KeyRound } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { previewApi } from '@/lib/api';
import { useI18n } from '@/context/I18nProvider';

export default function PreviewDialog({ url, options, open, onOpenChange, onConfirm }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !url) return;
    setLoading(true); setData(null); setError(null);
    previewApi.run(url, options)
      .then(setData)
      .catch(e => setError(e?.response?.data?.detail || String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url]);

  const count = data?.count ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="tracking-tight">{t('preview.title')}</DialogTitle>
          <DialogDescription className="font-mono text-xs break-all">{url}</DialogDescription>
        </DialogHeader>

        <div className="min-h-[180px]">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('preview.resolving')}
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 text-sm text-destructive py-4">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="font-mono text-xs">{error}</span>
            </div>
          )}

          {!loading && data && (
            <>
              <div className="text-sm mb-2">
                <span className="font-semibold">
                  {t('preview.found', { count, s: count === 1 ? '' : 's' })}
                </span>
                {data.truncated && (
                  <span className="text-muted-foreground ml-2">
                    ({t('preview.truncated', { count: data.files.length })})
                  </span>
                )}
              </div>

              {count === 0 && (
                <p className="text-xs text-muted-foreground py-4">{t('preview.noFiles')}</p>
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

              {data.files.length > 0 && (
                <ScrollArea className="h-44 rounded-md border border-border">
                  <ul className="p-2 space-y-0.5">
                    {data.files.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                        <FileImage className="w-3 h-3 shrink-0" />
                        <span className="truncate">{f}</span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
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
          <Button
            onClick={() => { onConfirm(url, data?.count || 0); onOpenChange(false); }}
            disabled={loading}
          >
            {t('preview.downloadThis')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
