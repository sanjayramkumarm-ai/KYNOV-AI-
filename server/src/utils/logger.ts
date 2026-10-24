type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL as Level) || 'info'] ?? 20;
const isProd = process.env.NODE_ENV === 'production';

function write(level: Level, msg: string, meta?: unknown) {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}`;
  const args: unknown[] = meta === undefined ? [line] : [line, meta];
  if (isProd && level !== 'debug') {
    // structured single-line output for log collectors
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : 'log'](
      JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(meta && typeof meta === 'object' ? { meta } : {}) }),
    );
    return;
  }
  // eslint-disable-next-line no-console
  (console[level === 'debug' ? 'log' : level] as (...a: unknown[]) => void)(...args);
}

export const logger = {
  debug: (m: string, meta?: unknown) => write('debug', m, meta),
  info: (m: string, meta?: unknown) => write('info', m, meta),
  warn: (m: string, meta?: unknown) => write('warn', m, meta),
  error: (m: string, meta?: unknown) => write('error', m, meta),
};
