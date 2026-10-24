import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, ChevronDown, Menu, Moon, Search, Sun, User as UserIcon, LogOut, Settings, CheckCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { notificationsApi } from '../../services/endpoints';
import type { Notification } from '../../types';
import { timeAgo } from '../../utils/format';

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const { data } = await notificationsApi.list();
      setNotifications(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      /* notifications are non-critical */
    }
  };

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b bg-ink-950/75 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button type="button" onClick={onOpenMenu} className="rounded-lg p-2 text-muted hover:bg-ink-800 hover:text-content lg:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </button>

        <form
          className="relative flex-1 max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
          }}
          role="search"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            className="input py-2 pl-9 pr-16"
            placeholder="Search files, emails and ask KYNOV…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Global search"
          />
          <kbd className="kbd absolute right-2.5 top-1/2 hidden -translate-y-1/2 sm:block">↵</kbd>
        </form>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg p-2 text-muted transition hover:bg-ink-800 hover:text-content"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          <div className="relative" ref={bellRef}>
            <button
              type="button"
              onClick={() => setBellOpen((v) => !v)}
              className="relative rounded-lg p-2 text-muted transition hover:bg-ink-800 hover:text-content"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
              aria-expanded={bellOpen}
            >
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            <AnimatePresence>
              {bellOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  className="absolute right-0 mt-2 w-[330px] overflow-hidden rounded-2xl border bg-ink-900/95 shadow-panel backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between border-b px-4 py-2.5">
                    <p className="text-sm font-medium">Notifications</p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-content"
                      onClick={async () => {
                        await notificationsApi.markAllRead().catch(() => undefined);
                        await load();
                      }}
                    >
                      <CheckCheck className="h-3 w-3" /> Mark all read
                    </button>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {notifications.length === 0 && <p className="px-4 py-6 text-center text-xs text-muted">You are all caught up.</p>}
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          if (n.link) navigate(n.link);
                          setBellOpen(false);
                          if (!n.read) void notificationsApi.markRead(n.id).then(load).catch(() => undefined);
                        }}
                        className={`block w-full border-b px-4 py-3 text-left transition hover:bg-ink-800/60 ${n.read ? 'opacity-70' : ''}`}
                      >
                        <p className="text-xs font-medium text-content">{n.title}</p>
                        {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{n.body}</p>}
                        <p className="mt-1 text-[10px] text-muted/70">{timeAgo(n.createdAt)}</p>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl border bg-ink-900/60 px-2 py-1.5 text-sm transition hover:bg-ink-800"
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 text-[11px] font-semibold text-white">
                {initials}
              </span>
              <span className="hidden max-w-[120px] truncate text-xs text-content sm:block">{user?.name}</span>
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted sm:block" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border bg-ink-900/95 shadow-panel backdrop-blur-xl"
                >
                  <div className="border-b px-4 py-3">
                    <p className="truncate text-sm font-medium">{user?.name}</p>
                    <p className="truncate text-[11px] text-muted">{user?.email}</p>
                  </div>
                  {[
                    { label: 'Profile & settings', icon: Settings, to: '/settings' },
                    { label: 'My files', icon: UserIcon, to: '/files' },
                  ].map(({ label, icon: Icon, to }) => (
                    <button
                      key={to}
                      type="button"
                      onClick={() => {
                        navigate(to);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs text-muted transition hover:bg-ink-800 hover:text-content"
                    >
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="flex w-full items-center gap-2.5 border-t px-4 py-2.5 text-left text-xs text-rose-300 transition hover:bg-rose-500/10"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
