/**
 * Small natural-language date range parser used by Smart Search, chat and the
 * voice assistant ("files I uploaded yesterday", "emails from last week").
 * Returns UTC day boundaries so results match what the user sees locally.
 */
export interface DateRange {
  from?: Date;
  to?: Date;
  label?: string;
}

const DAY = 86_400_000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export function parseDateRange(query: string, now = new Date()): DateRange | null {
  const q = (query || '').toLowerCase();
  if (!q.trim()) return null;

  if (/\btoday\b/.test(q)) return { from: startOfDay(now), to: endOfDay(now), label: 'today' };
  if (/\byesterday\b/.test(q)) {
    const d = new Date(now.getTime() - DAY);
    return { from: startOfDay(d), to: endOfDay(d), label: 'yesterday' };
  }
  if (/\b(this|last)\s+week\b/.test(q)) {
    const isLast = /last\s+week/.test(q);
    const day = now.getDay(); // 0 Sun
    const monday = new Date(now.getTime() - ((day + 6) % 7) * DAY);
    const start = startOfDay(isLast ? new Date(monday.getTime() - 7 * DAY) : monday);
    const end = endOfDay(isLast ? new Date(monday.getTime() - DAY) : now);
    return { from: start, to: end, label: isLast ? 'last week' : 'this week' };
  }
  if (/\b(this|last)\s+month\b/.test(q)) {
    const isLast = /last\s+month/.test(q);
    const start = new Date(now.getFullYear(), now.getMonth() + (isLast ? -1 : 0), 1);
    const end = isLast
      ? new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      : endOfDay(now);
    return { from: startOfDay(start), to: end, label: isLast ? 'last month' : 'this month' };
  }
  if (/\b(this|last)\s+year\b/.test(q)) {
    const isLast = /last\s+year/.test(q);
    const year = now.getFullYear() + (isLast ? -1 : 0);
    return {
      from: new Date(year, 0, 1),
      to: isLast ? new Date(year, 11, 31, 23, 59, 59, 999) : endOfDay(now),
      label: isLast ? 'last year' : 'this year',
    };
  }

  const rel = /(\d{1,3})\s+(day|week|month|hour)s?\s+ago/.exec(q);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2];
    const ms = unit === 'hour' ? 3_600_000 : unit === 'day' ? DAY : unit === 'week' ? 7 * DAY : 30 * DAY;
    return { from: new Date(now.getTime() - n * ms), to: now, label: `${n} ${rel[2]}${n > 1 ? 's' : ''} ago` };
  }

  const lastN = /last\s+(\d{1,3})\s+(day|week|month)s?/.exec(q);
  if (lastN) {
    const n = Number(lastN[1]);
    const unit = lastN[2];
    const ms = unit === 'day' ? DAY : unit === 'week' ? 7 * DAY : 30 * DAY;
    return { from: new Date(now.getTime() - n * ms), to: now, label: `last ${n} ${unit}s` };
  }

  // "in january", "january 2025", "in march"
  for (let i = 0; i < MONTHS.length; i++) {
    if (new RegExp(`\\b${MONTHS[i]}\\b`).test(q)) {
      const yearMatch = /\b(20\d{2})\b/.exec(q);
      const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear();
      const start = new Date(year, i, 1);
      const end = new Date(year, i + 1, 0, 23, 59, 59, 999);
      return { from: start, to: end, label: `${MONTHS[i]} ${year}` };
    }
  }

  const y = /\b(20\d{2})\b/.exec(q);
  if (y) {
    const year = Number(y[1]);
    return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59, 999), label: String(year) };
  }

  return null;
}

/** Strip date phrases before building the lexical query. */
export function stripDatePhrases(query: string): string {
  return query
    .replace(/\b(today|yesterday|this week|last week|this month|last month|this year|last year)\b/gi, ' ')
    .replace(/\b\d{1,3}\s+(day|week|month|hour)s?\s+ago\b/gi, ' ')
    .replace(/\blast\s+\d{1,3}\s+(day|week|month)s?\b/gi, ' ')
    .replace(new RegExp(`\\b(${MONTHS.join('|')})\\b`, 'gi'), ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
