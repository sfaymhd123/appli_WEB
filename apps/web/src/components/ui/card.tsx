import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
}

export function Card({ className, children, hover, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-200',
        hover && 'hover:border-clinical-200 hover:shadow-md hover:ring-1 hover:ring-clinical-50',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  tone?: 'neutral' | 'clinical' | 'warning' | 'danger';
}

export function CardHeader({ 
  title, 
  description, 
  action, 
  className,
  tone = 'neutral'
}: CardHeaderProps) {
  const bgTones = {
    neutral: 'bg-gray-50/40',
    clinical: 'bg-clinical-50/50',
    warning: 'bg-amber-50/50',
    danger: 'bg-red-50/50',
  };

  const borderTones = {
    neutral: 'border-gray-100',
    clinical: 'border-clinical-100/50',
    warning: 'border-amber-100/50',
    danger: 'border-red-100/50',
  };

  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b px-6 py-5',
        bgTones[tone],
        borderTones[tone],
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h3 className="text-base font-semibold tracking-tight text-gray-900">{title}</h3>
        {description && <p className="text-xs text-gray-500 leading-relaxed">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-6 py-5', className)} {...rest}>
      {children}
    </div>
  );
}
