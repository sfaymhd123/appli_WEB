import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils/cn';
import { Spinner } from './spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-clinical-700 text-white hover:bg-clinical-800 focus-visible:ring-clinical-700',
  secondary:
    'bg-white text-clinical-800 border border-clinical-200 hover:bg-clinical-50 focus-visible:ring-clinical-700',
  ghost:
    'bg-transparent text-clinical-800 hover:bg-clinical-50 focus-visible:ring-clinical-700',
  danger:
    'bg-priority-p1 text-white hover:bg-red-700 focus-visible:ring-priority-p1',
};

const SIZES: Record<Size, string> = {
  // All sizes keep a >=44px tap target on the primary axis (rural/older users).
  sm: 'min-h-tap px-3 text-sm gap-1.5',
  md: 'min-h-tap px-4 text-base gap-2',
  lg: 'min-h-[3.25rem] px-6 text-lg gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth = false, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-semibold transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
});
