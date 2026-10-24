import { Link } from 'react-router-dom';

export function Logo({ size = 'md', to = '/dashboard', showWordmark = true }: { size?: 'sm' | 'md' | 'lg'; to?: string; showWordmark?: boolean }) {
  const box = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  const text = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5" aria-label="KYNOV AI home">
      <span className={`relative grid place-items-center rounded-xl border border-white/10 bg-ink-900 ${box}`}>
        <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-violet-500/25 via-transparent to-cyan-400/25 opacity-80" />
        <svg viewBox="0 0 32 32" className="relative h-[62%] w-[62%]" aria-hidden>
          <defs>
            <linearGradient id="kynov-mark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <path d="M8 5v22M8 16.5 20 5M8 16.5 20 27" stroke="url(#kynov-mark)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <circle cx="24.5" cy="8.5" r="3" fill="#22d3ee" />
        </svg>
      </span>
      {showWordmark && (
        <span className={`font-display font-semibold tracking-tight ${text}`}>
          <span className="text-content">KYNOV</span> <span className="gradient-text">AI</span>
        </span>
      )}
    </Link>
  );
}
