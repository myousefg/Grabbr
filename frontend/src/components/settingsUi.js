// Shared layout primitives for the settings-style rows used on
// Settings, Dashboard (Output), and Sites (Cookies & Auth).

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
    <div className="p-4 flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}
