import { cn } from '../../lib/utils/cn';

const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
} as const;

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  /** Accessible label; defaults to a French loading hint. */
  label?: string;
  className?: string;
}

export function Spinner({ size = 'md', label = 'Chargement…', className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent',
        SIZES[size],
        className,
      )}
    />
  );
}
