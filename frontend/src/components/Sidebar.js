import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Clock, Settings, Download, KeyRound } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useI18n } from '@/context/I18nProvider';
import { useJobs } from '@/context/JobsProvider';

export default function Sidebar() {
  const { t } = useI18n();
  const { connected, active } = useJobs();

  const navItems = [
    { to: '/',        icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/history', icon: Clock,           label: t('nav.history') },
    { to: '/sites',   icon: KeyRound,        label: t('nav.sites') },
  ];

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-md text-xs tracking-[0.1em] font-medium transition-colors duration-200 ${
      isActive ? 'bg-primary text-primary-foreground'
               : 'text-muted-foreground hover:text-foreground hover:bg-accent'
    }`;

  return (
    <aside className="w-52 border-r border-border bg-background flex flex-col shrink-0" data-testid="sidebar">
      <div className="p-5 pb-4">
        <div className="flex items-center gap-2.5">
          <Download className="w-5 h-5 text-foreground" strokeWidth={2} />
          <span className="text-lg font-semibold tracking-tight">Grabbr</span>
        </div>
        <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground mt-1.5">
          {t('nav.tagline')}
        </p>
      </div>

      <Separator />

      <nav className="flex-1 p-3 space-y-0.5" data-testid="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={linkClass}
            data-testid={`nav-${item.label.toLowerCase()}`}
          >
            <item.icon className="w-4 h-4" strokeWidth={1.8} />
            {item.label}
            {item.to === '/' && active.length > 0 && (
              <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {active.length}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <Separator />

      <div className="p-3 space-y-2">
        <NavLink to="/settings" className={linkClass} data-testid="nav-settings">
          <Settings className="w-4 h-4" strokeWidth={1.8} />
          {t('nav.settings')}
        </NavLink>
        <div className="flex items-center gap-2 px-3 text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
          {connected ? t('nav.connected') : t('nav.offline')}
        </div>
      </div>
    </aside>
  );
}
