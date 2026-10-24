import { Link, Outlet } from 'react-router-dom';
import { Logo } from '../common/Logo';
import { useTheme } from '../../context/ThemeContext';
import { Moon, Sun } from 'lucide-react';

export function PublicLayout() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <Logo to="/" />
          <nav className="hidden items-center gap-6 text-sm text-muted sm:flex" aria-label="Site">
            <a href="/#features" className="hover:text-content">Features</a>
            <a href="/#how" className="hover:text-content">How it works</a>
            <a href="/#security" className="hover:text-content">Security</a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-muted hover:bg-ink-800 hover:text-content"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <Link to="/login" className="btn-ghost btn-sm sm:btn">Sign in</Link>
            <Link to="/signup" className="btn-primary btn-sm px-4">Get started</Link>
          </div>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      <footer className="border-t px-4 py-8 text-center text-xs text-muted">
        <p>
          KYNOV AI · Intelligent Personal Workspace ·{' '}
          <Link to="/login" className="underline decoration-white/20 underline-offset-2 hover:text-content">
            Sign in
          </Link>
        </p>
        <p className="mx-auto mt-2 max-w-2xl leading-relaxed text-muted/70">
          Your files and emails belong to you. KYNOV AI stores credentials server-side, encrypts OAuth tokens, and never shares
          data between accounts.
        </p>
      </footer>
    </div>
  );
}
