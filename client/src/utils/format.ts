export function timeAgo(input?: string | Date | null): string {
  if (!input) return '—';
  const date = typeof input === 'string' ? new Date(input) : input;
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function formatDate(input?: string | Date | null, withTime = false): string {
  if (!input) return '—';
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function formatTime(input?: string | Date | null): string {
  if (!input) return '';
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Working late';
}

export function initials(name = ''): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function relativeDue(input?: string | null): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' | 'none' } {
  if (!input) return { label: 'No due date', tone: 'none' };
  const due = new Date(input);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const dayDiff = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86_400_000);

  if (due.getTime() < now.getTime() && dayDiff <= 0) return { label: `Overdue · ${formatDate(due, true)}`, tone: 'overdue' };
  if (dayDiff === 0) return { label: `Today · ${formatTime(due)}`, tone: 'today' };
  if (dayDiff === 1) return { label: `Tomorrow · ${formatTime(due)}`, tone: 'soon' };
  if (dayDiff > 1 && dayDiff <= 7) return { label: `${formatDate(due)} · ${formatTime(due)}`, tone: 'soon' };
  return { label: formatDate(due, true), tone: 'later' };
}

export function toDateTimeLocal(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
