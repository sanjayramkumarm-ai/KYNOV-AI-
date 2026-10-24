import { AlertCircle, ArrowUpRight, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  title: string;
  message: string;
  envVars?: string[];
  steps?: string[];
  action?: ReactNode;
  tone?: 'info' | 'warning';
}

/**
 * Honest "integration not configured" panel. Used instead of fake data whenever
 * a provider (AI / Google OAuth / S3) has no credentials.
 */
export function SetupNotice({ title, message, envVars, steps, action, tone = 'warning' }: Props) {
  // Static class strings (Tailwind JIT cannot see interpolated class names).
  const shell = tone === 'warning' ? 'border-amber-400/25 bg-amber-500/[0.06]' : 'border-cyan-400/25 bg-cyan-500/[0.06]';
  const iconBox = tone === 'warning' ? 'border-amber-400/30 bg-amber-500/10' : 'border-cyan-400/30 bg-cyan-500/10';
  const iconColor = tone === 'warning' ? 'text-amber-300' : 'text-cyan-300';
  return (
    <div className={`rounded-2xl border p-5 ${shell}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-xl border p-2 ${iconBox}`}>
          <AlertCircle className={`h-4 w-4 ${iconColor}`} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-content">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">{message}</p>

          {envVars?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {envVars.map((v) => (
                <code key={v} className="rounded-md border border-white/10 bg-ink-900/80 px-2 py-1 font-mono text-[11px] text-cyan-300">
                  {v}
                </code>
              ))}
            </div>
          ) : null}

          {steps?.length ? (
            <ol className="mt-3 space-y-1 text-[11px] leading-relaxed text-muted">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-cyan-300/80">{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {action}
            <Link to="/settings" className="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-content">
              <Settings2 className="h-3 w-3" /> Settings
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
