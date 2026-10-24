import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Mic } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '../../context/AuthContext';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('kynov-sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    window.localStorage.setItem('kynov-sidebar', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);

  useEffect(() => {
    const main = document.getElementById('kynov-main');
    main?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Keyboard shortcuts: ⌘/Ctrl+K → smart search, ⌘/Ctrl+J → voice
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        navigate('/search');
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        navigate('/voice');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="flex min-h-screen">
      <a
        href="#kynov-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main id="kynov-main" className="min-h-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-10" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      {/* Floating voice entry point (mobile-friendly push-to-talk shortcut) */}
      <button
        type="button"
        onClick={() => navigate('/voice')}
        className="fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 text-white shadow-glow transition hover:scale-105 active:scale-95"
        aria-label={`Open voice assistant${user ? `, ${user.name}` : ''}`}
        title="Voice assistant (Ctrl/⌘ + J)"
      >
        <Mic className="h-6 w-6" />
        <span className="absolute inset-0 rounded-full ring-1 ring-white/20" />
      </button>
    </div>
  );
}
