export function Spinner({ className = 'h-4 w-4', label }: { className?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <svg className={`animate-spin text-cyan-300 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <span className="text-xs text-muted">{label}</span>}
      <span className="sr-only">{label ?? 'Loading'}</span>
    </span>
  );
}

export function FullPageLoader({ message = 'Loading your workspace…' }: { message?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-pulse-ring rounded-full border border-violet-400/40" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 animate-float rounded-full orb-core" />
        </div>
      </div>
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}

export function SkeletonRows({ rows = 4, className = 'h-16' }: { rows?: number; className?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`skeleton w-full ${className}`} />
      ))}
    </div>
  );
}
