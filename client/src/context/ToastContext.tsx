import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastCtx {
  toast: (t: Omit<Toast, 'id'>) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const STYLES: Record<ToastKind, string> = {
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  error: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
  info: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300',
  warning: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).slice(2);
      setItems((prev) => [...prev.slice(-3), { ...t, id }]);
      const ttl = t.kind === 'error' ? 7000 : 4500;
      window.setTimeout(() => remove(id), ttl);
    },
    [remove],
  );

  const value = useMemo<ToastCtx>(
    () => ({
      toast,
      success: (title, message) => toast({ kind: 'success', title, message }),
      error: (title, message) => toast({ kind: 'error', title, message }),
      info: (title, message) => toast({ kind: 'info', title, message }),
    }),
    [toast],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = ICONS[t.kind];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-panel backdrop-blur-md ${STYLES[t.kind]}`}
                role={t.kind === 'error' ? 'alert' : 'status'}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-content">{t.title}</p>
                  {t.message && <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.message}</p>}
                  {t.action && (
                    <button
                      type="button"
                      onClick={() => {
                        t.action?.onClick();
                        remove(t.id);
                      }}
                      className="mt-2 text-xs font-medium underline underline-offset-2"
                    >
                      {t.action.label}
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => remove(t.id)} aria-label="Dismiss notification" className="rounded p-1 opacity-60 hover:opacity-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
