import type { BadgeTone } from '../../components/ui';

/**
 * Lightweight, dependency-free charts for the KPI dashboard (CLAUDE.md §11 —
 * keep the PoC laptop-runnable; no heavy charting library). Everything is plain
 * CSS/flex/grid using the Tailwind design tokens.
 */

export interface BarDatum {
  label: string;
  value: number;
  /** Tailwind background class for the bar (defaults to the clinical accent). */
  colorClass?: string;
}

/** Horizontal bar chart — bars are scaled to the largest value in the set. */
export function BarChart({
  data,
  formatValue = (n) => n.toLocaleString('fr-FR'),
}: {
  data: BarDatum[];
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-3 text-sm">
          <span className="truncate text-gray-600" title={d.label}>
            {d.label}
          </span>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${d.colorClass ?? 'bg-clinical-600'}`}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="text-right font-semibold tabular-nums text-gray-900">
            {formatValue(d.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface Segment {
  label: string;
  value: number;
  /** Tailwind background class for the segment + its legend swatch. */
  colorClass: string;
}

/** A single stacked bar (composition) with a legend underneath. */
export function SegmentedBar({ segments }: { segments: Segment[] }) {
  const total = Math.max(1, segments.reduce((sum, s) => sum + s.value, 0));
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {shown.map((s) => (
          <div
            key={s.label}
            className={s.colorClass}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${s.colorClass}`} aria-hidden />
            <span>{s.label}</span>
            <span className="font-semibold tabular-nums text-gray-900">{s.value.toLocaleString('fr-FR')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STAT_TONE_TEXT: Partial<Record<BadgeTone, string>> = {
  neutral: 'text-gray-900',
  clinical: 'text-clinical-700',
  success: 'text-green-700',
  warning: 'text-amber-600',
  danger: 'text-red-600',
  info: 'text-blue-700',
};

/** A single headline metric (big number + label + optional hint). */
export function StatCard({
  label,
  value,
  hint,
  tone = 'clinical',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: BadgeTone;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${STAT_TONE_TEXT[tone] ?? 'text-gray-900'}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
