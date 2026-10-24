import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon: Icon, title, description, action, compact }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed text-center ${compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14'}`}>
      <div className={`rounded-2xl border bg-ink-800/60 ${compact ? 'p-2.5' : 'p-3.5'}`}>
        <Icon className={`text-cyan-300/80 ${compact ? 'h-4 w-4' : 'h-6 w-6'}`} aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium text-content">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
