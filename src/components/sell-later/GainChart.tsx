/**
 * Gain or loss (y) against the year you sell (x), one line per sale price change. Lines are SVG
 * scaled to the box with non-scaling strokes; labels are HTML placed by percentage, so text keeps
 * its size at any width. The chart repeats the table and sentences, so it is hidden from
 * assistive tech.
 */
import { formatMoney } from '../../lib/format';
import type { GainPoint } from '../../lib/sell-later';

interface GainChartProps {
  series: readonly GainPoint[];
  changes: readonly number[];
  /** Year to mark (the chosen sale year). */
  marker: number;
  label: (change: number) => string;
}

/** Round step for about `count` ticks: 1, 2 or 5 times a power of ten. */
function niceStep(range: number, count: number): number {
  const raw = range / count;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

const compact = (value: number) =>
  Math.abs(value) >= 1000
    ? `${formatMoney(value / 1000, { signed: value > 0 })}k`
    : formatMoney(value, { signed: value > 0 });

export function GainChart({ series, changes, marker, label }: GainChartProps) {
  const last = series[series.length - 1]?.year ?? 1;
  const all = series.flatMap((p) => p.gains).concat(0);
  const step = niceStep(Math.max(1, Math.max(...all) - Math.min(...all)), 4);
  const min = Math.floor(Math.min(...all) / step) * step;
  const max = Math.ceil(Math.max(...all) / step) * step;
  const x = (year: number) => (year / Math.max(1, last)) * 100;
  const y = (value: number) => ((max - value) / Math.max(1, max - min)) * 100;

  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(v);
  const xStep = last > 20 ? 10 : 5;
  const xTicks: number[] = [];
  for (let year = 0; year <= last; year += xStep) xTicks.push(year);

  return (
    <div class="gain-chart" aria-hidden="true" data-testid="sell-later-chart">
      <div class="gain-chart__y">
        {ticks.map((v) => (
          <span key={v} style={{ top: `${y(v)}%` }}>
            {compact(v)}
          </span>
        ))}
      </div>
      <div class="gain-chart__plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {ticks.map((v) => (
            <line
              key={v}
              class={v === 0 ? 'gain-chart__zero' : 'gain-chart__grid'}
              x1="0"
              x2="100"
              y1={y(v)}
              y2={y(v)}
              vector-effect="non-scaling-stroke"
            />
          ))}
          <line
            class="gain-chart__marker"
            x1={x(marker)}
            x2={x(marker)}
            y1="0"
            y2="100"
            vector-effect="non-scaling-stroke"
          />
          {changes.map((change, i) => (
            <polyline
              key={change}
              class={`gain-chart__line gain-chart__line--${change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}`}
              points={series.map((p) => `${x(p.year)},${y(p.gains[i] ?? 0)}`).join(' ')}
              vector-effect="non-scaling-stroke"
            />
          ))}
        </svg>
        {changes.map((change, i) => (
          <span
            key={change}
            class="gain-chart__label"
            style={{ top: `${y(series[series.length - 1]?.gains[i] ?? 0)}%` }}
          >
            {label(change)}
          </span>
        ))}
        <span class="gain-chart__marker-label" style={{ left: `${x(marker)}%` }}>
          Year {marker}
        </span>
      </div>
      <div class="gain-chart__x">
        {xTicks.map((year) => (
          <span key={year} style={{ left: `${x(year)}%` }}>
            {year}
          </span>
        ))}
      </div>
      <p class="gain-chart__x-title">Years until you sell</p>
    </div>
  );
}
