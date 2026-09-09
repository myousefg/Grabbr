import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, KeyRound, Wrench, History as HistoryIcon, Sparkles } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/context/I18nProvider';

const DISMISS_KEY = 'grabbr_intro_dismissed';

export function introDismissed() {
  try { return !!localStorage.getItem(DISMISS_KEY); } catch { return true; }
}
export function markIntroDone() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
}

const STEPS = [
  { key: 'welcome', icon: Sparkles, to: '/' },
  { key: 'dashboard', icon: LayoutDashboard, to: '/' },
  { key: 'sites', icon: KeyRound, to: '/sites' },
  { key: 'tools', icon: Wrench, to: '/settings' },
  { key: 'history', icon: HistoryIcon, to: '/history' },
];

export default function Onboarding({ open, onClose }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const [dontShow, setDontShow] = useState(true);

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const Icon = step.icon;

  const goto = (idx) => {
    setI(idx);
    if (STEPS[idx].to) navigate(STEPS[idx].to);
  };

  const finish = () => {
    if (dontShow) markIntroDone();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) finish(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <DialogTitle className="tracking-tight">{t(`onboarding.${step.key}.title`)}</DialogTitle>
          </div>
          <DialogDescription className="leading-relaxed pt-2 text-left">
            {t(`onboarding.${step.key}.body`)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-1.5 py-1">
          {STEPS.map((s, idx) => (
            <span
              key={s.key}
              className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`}
            />
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={e => setDontShow(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-primary"
          />
          {t('onboarding.dontShow')}
        </label>

        <DialogFooter className="sm:justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>
            {t('onboarding.skip')}
          </Button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button variant="outline" size="sm" onClick={() => goto(i - 1)}>
                {t('onboarding.back')}
              </Button>
            )}
            <Button size="sm" onClick={() => (last ? finish() : goto(i + 1))}>
              {last ? t('onboarding.done') : t('onboarding.next')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
