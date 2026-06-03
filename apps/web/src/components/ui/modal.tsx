import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Disable closing on backdrop click / Escape (e.g. during a blocking op). */
  dismissible?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKey);
    // Lock background scroll while the modal is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, dismissible, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-gray-900/50"
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />
      <div
        className={cn(
          'relative z-10 w-full rounded-card bg-white shadow-xl',
          className || 'max-w-lg',
        )}
      >
        {title && (
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
