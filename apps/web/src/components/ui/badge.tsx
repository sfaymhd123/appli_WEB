import type { ReactNode } from 'react';
import { cn } from '../../lib/utils/cn';

/**
 * Badge tones. Includes triage priorities (P1..P5) and DetectedIssue
 * severities (high/moderate/low) per CLAUDE.md §2/§7, plus generic tones.
 *
 * NOTE: class strings are written as full literals so Tailwind's JIT detects
 * them — never build them dynamically (e.g. `bg-priority-${level}`).
 */
export type BadgeTone =
  | 'neutral'
  | 'clinical'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'p1'
  | 'p2'
  | 'p3'
  | 'p4'
  | 'p5'
  | 'high'
  | 'moderate'
  | 'low';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-700 ring-gray-300',
  clinical: 'bg-clinical-50 text-clinical-800 ring-clinical-200',
  success: 'bg-green-50 text-green-700 ring-green-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  p1: 'bg-priority-p1/10 text-priority-p1 ring-priority-p1/30',
  p2: 'bg-priority-p2/10 text-priority-p2 ring-priority-p2/30',
  p3: 'bg-priority-p3/10 text-priority-p3 ring-priority-p3/30',
  p4: 'bg-priority-p4/10 text-priority-p4 ring-priority-p4/30',
  p5: 'bg-priority-p5/10 text-priority-p5 ring-priority-p5/30',
  high: 'bg-severity-high/10 text-severity-high ring-severity-high/30',
  moderate: 'bg-severity-moderate/10 text-severity-moderate ring-severity-moderate/30',
  low: 'bg-severity-low/10 text-severity-low ring-severity-low/30',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
