import type { ReactNode } from 'react';
import { cn } from '../../lib/utils/cn';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Optional leading glyph/icon node. */
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-gray-300 bg-gray-50/60 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="mb-3 text-clinical-600" aria-hidden>{icon}</div>}
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
