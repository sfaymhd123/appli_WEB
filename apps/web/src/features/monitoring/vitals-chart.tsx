import { useMemo } from 'react';
import type { VitalsSeries } from '../../lib/api/types/monitoring';
import { metricColor, metricThresholds } from './monitoring-display';

interface VitalsChartProps {
  /** Shared unit for every series in this chart (e.g. "mmHg"). */
  unit: string;
  series: VitalsSeries[];
}

const VB_W = 720;
const VB_H = 240;
const PAD = { top: 16, right: 56, bottom: 28, left: 44 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

interface PlotPoint {
  t: number;
  value: number;
}

interface SeriesGeometry {
  metric: string;
  label: string;
  color: string;
  polyline: string;
  dots: { x: number; y: number }[];
  latest?: number;
}

interface ThresholdGeometry {
  key: string;
  y: number;
  color: string;
  label: string;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function axisLabel(t: number): string {
  return new Date(t).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Hand-rolled SVG line chart (no charting dependency, per the lightweight
 * low-bandwidth constraint). Plots one or more vitals series sharing a unit,
 * with dashed §7 threshold reference lines. Responsive via viewBox.
 */
export function VitalsChart({ unit, series }: VitalsChartProps) {
  const geometry = useMemo(() => {
    const perSeries = series.map((s) => ({
      ...s,
      pts: s.points
        .map((p): PlotPoint => ({ t: new Date(p.at).getTime(), value: p.value }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.value)),
    }));

    const allPoints = perSeries.flatMap((s) => s.pts);
    if (allPoints.length === 0) return null;

    const thresholds = series.flatMap((s) =>
      metricThresholds(s.metric).map((th) => ({ metric: s.metric, ...th })),
    );

    let tMin = Math.min(...allPoints.map((p) => p.t));
    let tMax = Math.max(...allPoints.map((p) => p.t));
    if (tMin === tMax) tMax = tMin + 1;

    const values = [...allPoints.map((p) => p.value), ...thresholds.map((th) => th.value)];
    let vMin = Math.min(...values);
    let vMax = Math.max(...values);
    if (vMin === vMax) {
      vMin -= 1;
      vMax += 1;
    }
    const span = vMax - vMin;
    vMin -= span * 0.08;
    vMax += span * 0.08;

    const singleTime = allPoints.every((p) => p.t === allPoints[0].t);
    const scaleX = (t: number): number =>
      singleTime ? PAD.left + PLOT_W / 2 : PAD.left + ((t - tMin) / (tMax - tMin)) * PLOT_W;
    const scaleY = (v: number): number =>
      PAD.top + (1 - (v - vMin) / (vMax - vMin)) * PLOT_H;

    const seriesGeometry: SeriesGeometry[] = perSeries.map((s) => {
      const dots = s.pts.map((p) => ({ x: scaleX(p.t), y: scaleY(p.value) }));
      return {
        metric: s.metric,
        label: s.label,
        color: metricColor(s.metric),
        polyline: dots.map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' '),
        dots,
        latest: s.pts.length ? s.pts[s.pts.length - 1].value : undefined,
      };
    });

    const thresholdGeometry: ThresholdGeometry[] = thresholds.map((th, i) => ({
      key: `${th.metric}-${th.value}-${i}`,
      y: scaleY(th.value),
      color: metricColor(th.metric),
      label: `${th.comparator} ${fmt(th.value)}`,
    }));

    const ticks = Array.from({ length: 4 }, (_, i) => {
      const v = vMin + ((vMax - vMin) * i) / 3;
      return { v, y: scaleY(v) };
    });

    return { seriesGeometry, thresholdGeometry, ticks, tMin, tMax };
  }, [series]);

  if (!geometry) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        Aucune mesure en {unit} pour ce patient.
      </p>
    );
  }

  const { seriesGeometry, thresholdGeometry, ticks, tMin, tMax } = geometry;

  return (
    <div>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Tendance des constantes en ${unit}`}
      >
        {/* Y gridlines + labels */}
        {ticks.map((tick) => (
          <g key={tick.v}>
            <line
              x1={PAD.left}
              y1={tick.y}
              x2={PAD.left + PLOT_W}
              y2={tick.y}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
            <text x={PAD.left - 6} y={tick.y + 3} textAnchor="end" fontSize={10} fill="#6b7280">
              {fmt(tick.v)}
            </text>
          </g>
        ))}

        {/* §7 threshold reference lines (dashed, per metric colour) */}
        {thresholdGeometry.map((th) => (
          <g key={th.key}>
            <line
              x1={PAD.left}
              y1={th.y}
              x2={PAD.left + PLOT_W}
              y2={th.y}
              stroke={th.color}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.55}
            />
            <text x={PAD.left + PLOT_W + 4} y={th.y + 3} fontSize={9} fill={th.color}>
              {th.label}
            </text>
          </g>
        ))}

        {/* X axis baseline + range labels */}
        <line
          x1={PAD.left}
          y1={PAD.top + PLOT_H}
          x2={PAD.left + PLOT_W}
          y2={PAD.top + PLOT_H}
          stroke="#9ca3af"
          strokeWidth={1}
        />
        <text x={PAD.left} y={VB_H - 8} fontSize={10} fill="#6b7280">
          {axisLabel(tMin)}
        </text>
        <text x={PAD.left + PLOT_W} y={VB_H - 8} textAnchor="end" fontSize={10} fill="#6b7280">
          {axisLabel(tMax)}
        </text>

        {/* Series polylines + points */}
        {seriesGeometry.map((s) => (
          <g key={s.metric}>
            {s.polyline && (
              <polyline points={s.polyline} fill="none" stroke={s.color} strokeWidth={2} />
            )}
            {s.dots.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r={3} fill={s.color} />
            ))}
          </g>
        ))}
      </svg>

      {/* Legend */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {seriesGeometry.map((s) => (
          <li key={s.metric} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span>{s.label}</span>
            {s.latest !== undefined && (
              <span className="font-mono text-gray-400">· {fmt(s.latest)} {unit}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
