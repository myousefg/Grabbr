// Shared layout primitives for the settings-style rows used on
// Settings, Dashboard (Output), and Sites (Cookies & Auth).

import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Section({ label, children, aside }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</h2>
        {aside}
      </div>
      <div className="border border-border rounded-lg divide-y divide-border">{children}</div>
    </section>
  );
}

export function Row({ title, desc, children }) {
  return (
    <div className="p-4 flex items-center justify-between gap-6">
      <div className="min-w-0 flex items-center gap-1.5">
        <p className="text-sm font-medium truncate">{title}</p>
        {desc && (
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button type="button" tabIndex={-1} className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground">
                <Info className="w-3.5 h-3.5" />
                <span className="sr-only">{desc}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs leading-relaxed" side="top">
              {desc}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}
