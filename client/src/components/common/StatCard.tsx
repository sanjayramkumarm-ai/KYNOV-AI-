import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'violet' | 'cyan' | 'emerald' | 'amber';
  onClick?: () => void;
}

const ACCENTS: Record<string, string> = {
  violet: 'from-violet-500/20 to-transparent text-violet-300 border-violet-400/20',
  cyan: 'from-cyan-400/20 to-transparent text-cyan-300 border-cyan-400/20',
  emerald: 'from-emerald-400/20 to-transparent text-emerald-300 border-emerald-400/20',
  amber: 'from-amber-400/20 to-transparent text-amber-300 border-amber-400/20',
};

export function StatCard({ icon: Icon, label, value, hint, accent = 'violet', onClick }: Props) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Tag
        {...(onClick ? { onClick, type: 'button' as const } : {})}
        className={`panel card-hover flex w-full items-center gap-3 p-4 text-left ${onClick ? 'cursor-pointer' : ''}`}
      >
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-gradient-to-br ${ACCENTS[accent]}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-wider text-muted">{label}</span>
          <span className="block truncate font-display text-xl font-semibold text-content">{value}</span>
          {hint && <span className="block truncate text-[11px] text-muted">{hint}</span>}
        </span>
      </Tag>
    </motion.div>
  );
}
