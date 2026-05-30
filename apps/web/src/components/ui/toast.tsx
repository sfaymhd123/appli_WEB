import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils/cn';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  /** Push a toast; returns its id. Auto-dismisses after `ms` (default 4000). */
  toast: (message: string, tone?: ToastTone, ms?: number) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-green-200 bg-green-50 text-green-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-clinical-200 bg-clinical-50 text-clinical-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info', ms = 4000) => {
      const id = nextId.current++;
      setItems((prev) => [...prev, { id, tone, message }]);
      if (ms > 0) window.setTimeout(() => dismiss(id), ms);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
          aria-live="polite"
          aria-atomic="false"
        >
          {items.map((t) => (
            <div
              key={t.id}
              role="status"
              className={cn(
                'flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-card',
                TONE_STYLES[t.tone],
              )}
            >
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Fermer"
                className="shrink-0 text-current/70 hover:text-current"
              >
                ✕
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
