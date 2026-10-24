import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  FolderOpen,
  FolderTree,
  LayoutDashboard,
  Mail,
  Mic,
  Search,
  Settings,
  Sparkles,
  ListChecks,
  HardDrive,
  LogOut,
  X,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Logo } from '../common/Logo';
import { formatBytes } from '../common/FileIcon';
import { useAuth } from '../../context/AuthContext';

export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/chat', label: 'KYNOV AI Chat', icon: Sparkles },
  { to: '/files', label: 'My Files', icon: FolderOpen },
  { to: '/gmail', label: 'Gmail Inbox', icon: Mail },
  { to: '/search', label: 'Smart Search', icon: Search },
  { to: '/voice', label: 'Voice Assistant', icon: Mic },
  { to: '/tasks', label: 'Tasks & Reminders', icon: ListChecks },
  { to: '/manager', label: 'Intelligent File Manager', icon: FolderTree },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }: Props) {
  const { user, features, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const quota = user?.storageQuota ?? 1;
  const used = user?.storageUsed ?? 0;
  const percent = Math.min(100, Math.round((used / quota) * 100));

  const content = (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-1 pt-1`}>
        {collapsed ? <Logo size="sm" showWordmark={false} /> : <Logo />}
        <button
          type="button"
          onClick={onToggle}
          className="hidden rounded-lg p-1.5 text-muted transition hover:bg-ink-800 hover:text-content lg:block"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" onClick={onCloseMobile} className="rounded-lg p-1.5 text-muted lg:hidden" aria-label="Close menu">
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                isActive
                  ? 'bg-gradient-to-r from-violet-500/20 via-violet-500/5 to-transparent text-content'
                  : 'text-muted hover:bg-ink-800/70 hover:text-content',
              ].join(' ')
            }
            title={collapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-violet-400 to-cyan-400" />}
                <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-cyan-300' : 'text-muted group-hover:text-content'}`} aria-hidden />
                {!collapsed && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {!collapsed && (
        <div className="rounded-xl border bg-ink-900/60 p-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <HardDrive className="h-3 w-3" /> Storage
            </span>
            <span>{percent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-400 transition-all"
              style={{ width: `${Math.max(2, percent)}%` }}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Storage used"
            />
          </div>
          <p className="mt-1.5 text-[10px] text-muted">
            {formatBytes(used)} of {formatBytes(quota)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className={`chip ${features?.ai ? 'chip-active' : ''}`}>{features?.ai ? 'AI on' : 'AI off'}</span>
            <span className={`chip ${features?.gmail ? 'chip-active' : ''}`}>{features?.gmail ? 'Gmail ready' : 'Gmail off'}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void logout()}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition hover:bg-rose-500/10 hover:text-rose-300 ${collapsed ? 'justify-center' : ''}`}
        aria-label="Sign out"
      >
        <LogOut className="h-[18px] w-[18px]" aria-hidden />
        {!collapsed && 'Sign out'}
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop / tablet */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r bg-ink-950/70 backdrop-blur-xl transition-[width] duration-300 lg:block ${
          collapsed ? 'w-[78px]' : 'w-[264px]'
        }`}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={onCloseMobile}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r bg-ink-950/95 backdrop-blur-xl lg:hidden"
              aria-label="Mobile navigation"
            >
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
