/**
 * Geometry for the buy v rent chart (phase 4, results teammate). Pure: no DOM, no JSON.
 *
 * The chart draws in a 0-100 box on both axes (the SVG stretches to the plot with
 * preserveAspectRatio none), and HTML labels sit over it at the same percentages. So every
 * position here is a percentage: x from the left, y from the top (SVG) or from the bottom (CSS).
 */
import { MINUS } from './format';

/** Round to 2 decimal places, so SVG attributes stay short and stable. */
export const round2 = (value: number): number => Math.round(value * 100) / 100;

export interface YScale {
  /** Bottom of the axis, pounds (0, or a negative step multiple). */
  min: number;
  /** Top of the axis, pounds. */
  max: number;
  /** Gap between gridlines, pounds. */
  step: number;
  /** Gridline values from min to max. */
  ticks: number[];
}

/** Steps the y axis may use, times a power of ten: £1k, £2k, £2.5k, £5k, £10k... */
const NICE = [1, 2, 2.5, 5, 10];
/** The smallest step: labels are in £k, so never below £1k. */
const MIN_STEP = 1000;

/** A round step that splits `range` into at most `target` gaps. */
export function niceStep(range: number, target = 5): number {
  if (!(range > 0) || !Number.isFinite(range)) return MIN_STEP;
  const raw = range / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const nice of NICE) {
    const step = nice * power;
    if (step >= raw - 1e-9) return Math.max(MIN_STEP, step);
  }
  return Math.max(MIN_STEP, 10 * power);
}

/** The y axis for these values: always includes £0, rounded out to whole steps. */
export function yScale(values: readonly number[], target = 5): YScale {
  const finite = values.filter((value) => Number.isFinite(value));
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  const step = niceStep(high - low, target);
  const min = Math.floor(low / step + 1e-9) * step;
  let max = Math.ceil(high / step - 1e-9) * step;
  if (max <= min) max = min + step;
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Math.round(value));
  return { min, max, step, ticks };
}

/** Position of a value from the top of the plot, in %. */
export function yPercent(value: number, scale: YScale): number {
  return round2(((scale.max - value) / (scale.max - scale.min)) * 100);
}

/** Position of a year from the left of the plot, in %. */
export function xPercent(year: number, years: number): number {
  return years > 0 ? round2((year / years) * 100) : 0;
}

/** "x,y x,y ..." for an SVG polyline. */
export function polylinePoints(values: readonly number[], scale: YScale): string {
  const years = values.length - 1;
  return values
    .map((value, year) => `${xPercent(year, years)},${yPercent(value, scale)}`)
    .join(' ');
}

/** A closed path filling between the line and £0 (the buy series' 14% fill). */
export function areaPath(values: readonly number[], scale: YScale): string {
  const years = values.length - 1;
  const zero = yPercent(0, scale);
  const line = values.map((value, year) => `L${xPercent(year, years)},${yPercent(value, scale)}`);
  return `M0,${zero} ${line.join(' ')} L${xPercent(years, years)},${zero} Z`;
}

/** Gaps between x axis labels, in years. */
const X_STEPS = [1, 2, 5, 10, 20];

/**
 * Years to label on the x axis: 0 ("Now"), then every 1, 2, 5, 10 or 20 years (the smallest
 * step that gives at most `maxTicks` labels), ending at the horizon. A round tick that would
 * crowd the horizon's label is dropped.
 */
export function xTicks(years: number, maxTicks = 6): number[] {
  if (years <= 0) return [0];
  const step = X_STEPS.find((candidate) => Math.floor(years / candidate) + 1 <= maxTicks) ?? 20;
  const ticks: number[] = [];
  for (let year = 0; year <= years; year += step) ticks.push(year);
  // Make the horizon the last tick; drop a tick that would crowd it.
  const last = ticks[ticks.length - 1] ?? 0;
  if (last !== years) {
    if (years - last < step * 0.7) ticks.pop();
    ticks.push(years);
  }
  return ticks;
}

export interface XTick {
  year: number;
  /** 'all': shown at every width; 'wide' only from 30rem; 'narrow' only below it. */
  show: 'all' | 'wide' | 'narrow';
}

/** Ticks for both widths in one list: up to 6 labels from 30rem, up to 4 on a phone. */
export function responsiveXTicks(years: number): XTick[] {
  const wide = xTicks(years, 6);
  const narrow = xTicks(years, 4);
  const all = [...new Set([...wide, ...narrow])].sort((a, b) => a - b);
  return all.map((year) => {
    const inWide = wide.includes(year);
    const inNarrow = narrow.includes(year);
    let show: XTick['show'] = 'all';
    if (!inNarrow) show = 'wide';
    else if (!inWide) show = 'narrow';
    return { year, show };
  });
}

/** "Now", "Yr 5". */
export function xTickLabel(year: number): string {
  return year === 0 ? 'Now' : `Yr ${year}`;
}

const thousands = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/** Axis label in £ thousands with a true minus: "£250k", "£2.5k", "−£20k", "£1,250k". */
export function formatK(value: number): string {
  const k = Math.round(value / 100) / 10;
  if (k === 0) return '£0k';
  return `${k < 0 ? MINUS : ''}£${thousands.format(Math.abs(k))}k`;
}

/** Year under a point `fraction` (0-1) of the way across the plot. */
export function yearAt(fraction: number, years: number): number {
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(years, Math.max(0, Math.round(fraction * years)));
}

export interface LabelPlacement {
  /** Year at which both direct labels sit. */
  year: number;
  /** True when the buy line is on top there (its label goes above, rent's below). */
  buyOnTop: boolean;
}

/**
 * Where the direct "Buy" and "Rent" labels go: between 55% and 75% of the way along (so the
 * label hanging right of its point stays inside the plot at 360px), off the break-even year so
 * they never sit on the marker, at the year where the lines are furthest apart.
 */
export function labelPlacement(
  buy: readonly number[],
  rent: readonly number[],
  breakEvenYear: number | null,
): LabelPlacement {
  const years = Math.min(buy.length, rent.length) - 1;
  if (years <= 0) return { year: 0, buyOnTop: (buy[0] ?? 0) >= (rent[0] ?? 0) };
  const from = Math.max(1, Math.round(years * 0.55));
  const to = Math.max(from, Math.round(years * 0.75));
  let best = Math.round(years * 0.75);
  let bestGap = -1;
  for (let year = from; year <= to; year++) {
    if (breakEvenYear !== null && Math.abs(year - breakEvenYear) < Math.max(1, years / 10))
      continue;
    const gap = Math.abs((buy[year] ?? 0) - (rent[year] ?? 0));
    if (gap > bestGap) {
      bestGap = gap;
      best = year;
    }
  }
  return { year: best, buyOnTop: (buy[best] ?? 0) >= (rent[best] ?? 0) };
}

/**
 * Which side of its line each direct label sits on. 'above' hangs left of the point, over the
 * line; 'below' hangs right of the point, under it; 'above-right' sits over the line, right of
 * the point.
 */
export type LabelSide = 'above' | 'below' | 'above-right';

/**
 * Lowest point (% of the plot height from its bottom) a label can hang below. A label under the
 * line takes about 1.4rem (its line plus the gap); the plot is at least 11rem tall, so under 18%
 * it would sit on the £0 axis line and the year labels.
 */
export const LOW_LABEL_LIMIT = 18;

/** Gap between the lines (% of the plot height) that fits two labels one above the other. */
export const LABEL_STACK_GAP = 16;

/**
 * Sides for the "Buy" and "Rent" labels at the placement year. The upper line's label goes
 * above it. The lower line's goes below it, unless that line is too close to the bottom of the
 * plot (rent staying near £0 while buying pulls ahead): then it goes above its line, left of the
 * point when the upper label is far enough above, else right of the point, so it never covers
 * the axis and never sits on the other label.
 * `buyY` and `rentY` are % of the plot height from the bottom.
 */
export function labelSides(
  buyOnTop: boolean,
  buyY: number,
  rentY: number,
): { buy: LabelSide; rent: LabelSide } {
  const lowerY = buyOnTop ? rentY : buyY;
  const upperY = buyOnTop ? buyY : rentY;
  let lower: LabelSide = 'below';
  if (lowerY < LOW_LABEL_LIMIT) {
    // Over its line, left of the point like the upper label (the right edge of a phone-width
    // plot has no room for it), unless the lines are too close for two labels stacked there.
    lower = upperY - lowerY >= LABEL_STACK_GAP ? 'above' : 'above-right';
  }
  return buyOnTop ? { buy: 'above', rent: lower } : { buy: lower, rent: 'above' };
}
