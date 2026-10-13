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
  /** Bottom of the axis, pounds (0, a negative step multiple, or just under a small dip). */
  min: number;
  /** Top of the axis, pounds. */
  max: number;
  /** Gap between gridlines, pounds. */
  step: number;
  /** Gridline values from min (or £0, after a small dip) to max. */
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

/** A dip below £0 smaller than this share of a step gets no gridline of its own. */
const SMALL_DIP = 0.25;
/** Room left under the lowest value in that case, as a share of a step. */
const DIP_ROOM = 0.04;

/**
 * The y axis for these values: always includes £0, rounded out to whole steps (except a small
 * dip below £0, which ends just under the lowest value).
 */
export function yScale(values: readonly number[], target = 5): YScale {
  const finite = values.filter((value) => Number.isFinite(value));
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  const step = niceStep(high - low, target);
  let min = Math.floor(low / step + 1e-9) * step;
  // A small dip below £0 (a high loan-to-value's first year) next to a large top would take a
  // whole step: a quarter of the plot for −£1k. Then the axis stops just under the lowest value
  // instead, with no gridline below £0.
  if (low < 0 && -low < step * SMALL_DIP) min = low - step * DIP_ROOM;
  const first = Math.ceil(min / step - 1e-9) * step;
  let max = Math.ceil(high / step - 1e-9) * step;
  if (max <= first) max = first + step;
  const ticks: number[] = [];
  // `|| 0` turns −0 into 0.
  for (let value = first; value <= max + step / 2; value += step)
    ticks.push(Math.round(value) || 0);
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
  /**
   * Year at which both direct labels sit. Whole years, except on a 1 or 2-year horizon, where
   * it can be a half year (the labels sit between two year-ends, on the straight line joining them).
   */
  year: number;
  /** Buy and rent values at that year (interpolated for a half year). */
  buy: number;
  rent: number;
  /** True when the buy line is on top there (its label goes above, rent's below). */
  buyOnTop: boolean;
}

/** Furthest along (fraction of the horizon) a label may sit: a label hanging right of its point
 * then still ends inside the plot at 360px. */
const LABEL_MAX_AT = 0.7;
/** Furthest along a label may sit when its box is checked against the plot (labelPlacement
 * given the axis): only tried when no place up to LABEL_MAX_AT keeps the labels off the lines. */
const LABEL_FAR_AT = 0.8;
/** Where labels prefer to sit, and the wider range tried when the break-even year is in the way. */
const LABEL_PREFERRED_FROM = 0.55;
const LABEL_WIDE_FROM = 0.25;

/** A series' value at a whole or half year. */
function valueAt(values: readonly number[], at: number): number {
  const low = Math.floor(at);
  const high = Math.ceil(at);
  const a = values[low] ?? 0;
  const b = values[high] ?? a;
  return a + (b - a) * (at - low);
}

/** Label positions between `from` and `to` (LABEL_MAX_AT) of the horizon: whole years, or half
 * years on a 1 or 2-year horizon (which has no whole year inside that range). */
function labelCandidates(years: number, from: number, to = LABEL_MAX_AT): number[] {
  const step = years <= 2 ? 0.5 : 1;
  const out: number[] = [];
  for (
    let at = Math.ceil((years * from) / step - 1e-9) * step;
    at <= years * to + 1e-9;
    at += step
  ) {
    if (at > 0) out.push(at);
  }
  return out;
}

/**
 * Where the direct "Buy" and "Rent" labels go: between 55% and 70% of the way along (so a label
 * hanging right of its point stays inside the plot at 360px, and never past the right edge),
 * off the break-even year so they never sit on the marker, at the place where the lines are
 * furthest apart. When the break-even year blocks every place there, the range widens back to
 * 25%. A 1 or 2-year horizon uses half years: on a 1-year horizon the labels sit half way.
 */
export function labelPlacement(
  buy: readonly number[],
  rent: readonly number[],
  breakEvenYear: number | null,
  scale?: YScale,
): LabelPlacement {
  const years = Math.min(buy.length, rent.length) - 1;
  const at = (year: number): LabelPlacement => {
    const buyValue = valueAt(buy, year);
    const rentValue = valueAt(rent, year);
    return { year, buy: buyValue, rent: rentValue, buyOnTop: buyValue >= rentValue };
  };
  if (years <= 0) return at(0);
  const step = years <= 2 ? 0.5 : 1;
  const clearance = Math.max(step, years / 10);
  const clear = (year: number) =>
    breakEvenYear === null || Math.abs(year - breakEvenYear) >= clearance;
  /** Places in a range clear of the marker, lines furthest apart first (earlier on a tie). */
  const ranked = (from: number, to?: number) =>
    labelCandidates(years, from, to)
      .filter(clear)
      .map((year) => ({ year, gap: Math.abs(valueAt(buy, year) - valueAt(rent, year)) }))
      .sort((x, y) => y.gap - x.gap)
      .map((candidate) => candidate.year);
  const preferred = ranked(LABEL_PREFERRED_FROM);
  const wide = ranked(LABEL_WIDE_FROM);
  if (scale) {
    // Given the axis, the first of those places (preferred range, then the wider one, then up
    // to LABEL_FAR_AT) where labelSides can keep both labels off both lines.
    const fromBottom = (value: number) => 100 - yPercent(value, scale);
    const lines = { buy: buy.map(fromBottom), rent: rent.map(fromBottom), floor: fromBottom(0) };
    const far = ranked(LABEL_WIDE_FROM, LABEL_FAR_AT).filter((year) => !wide.includes(year));
    for (const year of [...preferred, ...wide, ...far]) {
      const placement = at(year);
      const buyY = fromBottom(placement.buy);
      const rentY = fromBottom(placement.rent);
      const sides = defaultSides(placement.buyOnTop, buyY, rentY);
      if (clearSides(sides, buyY, rentY, { ...lines, x: xPercent(year, years) })) return placement;
    }
  }
  const best = preferred[0] ?? wide[0];
  if (best !== undefined) return at(best);
  // Unreachable in practice (the wide range always has a place clear of one year); stay inside.
  return at(Math.max(step, Math.floor((years * LABEL_MAX_AT) / step) * step));
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
 * A direct label's box at the narrowest plot (360px wide page: a 248px by 176-192px plot), in %
 * of the plot: x from the left, y from the bottom, as the CSS places it (chart.css and
 * results.css). Widths include the key line. Wider plots make the real box smaller in %, so a
 * side that is clear here is clear at every width.
 */
export const LABEL_BOX = {
  width: { buy: 18, rent: 22 },
  height: 8,
  /** margin-bottom / translate of var(--space-2) above or below the line. */
  gapY: 4.5,
  /** var(--space-1) beside the point. */
  gapX: 1.6,
} as const;

/** Space kept between a label and a line, in % of the plot height (the lines are 3px). */
const LINE_CLEARANCE = 1;
/** Space kept between a label hanging below its line and the £0 line, in % of the plot height. */
const BASELINE_CLEARANCE = 2;

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The box a label takes on `side` of the point (x, y), both in % (y from the bottom). */
export function labelBox(side: LabelSide, x: number, y: number, width: number): Rect {
  const { height, gapX, gapY } = LABEL_BOX;
  switch (side) {
    case 'above':
      return { x0: x - gapX - width, x1: x - gapX, y0: y + gapY, y1: y + gapY + height };
    case 'above-right':
      return { x0: x + gapX, x1: x + gapX + width, y0: y + gapY, y1: y + gapY + height };
    case 'below':
      return { x0: x + gapX, x1: x + gapX + width, y0: y - gapY - height, y1: y - gapY };
  }
}

/**
 * Lowest and highest point of a line (one y per year, % from the bottom, years spread evenly
 * over 0-100% across) between x0 and x1. The line is continuous, so it passes through every
 * height in between: it crosses a box spanning x0-x1 exactly when this range meets the box's.
 */
export function lineRange(ys: readonly number[], x0: number, x1: number): [number, number] {
  const years = ys.length - 1;
  const at = (x: number): number => {
    if (years <= 0) return ys[0] ?? 0;
    const position = (Math.min(100, Math.max(0, x)) / 100) * years;
    return valueAt(ys, position);
  };
  let low = Math.min(at(x0), at(x1));
  let high = Math.max(at(x0), at(x1));
  for (let year = 0; year <= years; year += 1) {
    const x = years > 0 ? (year / years) * 100 : 0;
    if (x <= x0 || x >= x1) continue;
    const y = ys[year] ?? 0;
    low = Math.min(low, y);
    high = Math.max(high, y);
  }
  return [low, high];
}

/** True when the line passes through the box (with a little clearance). */
export function crosses(ys: readonly number[], box: Rect): boolean {
  const [low, high] = lineRange(ys, box.x0, box.x1);
  return low <= box.y1 + LINE_CLEARANCE && high >= box.y0 - LINE_CLEARANCE;
}

const overlap = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Both lines in plot %, and where the labels sit, for labelSides to keep labels off them. */
export interface LabelLines {
  /** The placement year's position, % from the left. */
  x: number;
  /** One value per year, % of the plot height from the bottom. */
  buy: readonly number[];
  rent: readonly number[];
  /** The £0 line, % of the plot height from the bottom (0 unless the axis dips below £0). */
  floor: number;
}

const SIDES: readonly LabelSide[] = ['above', 'above-right', 'below'];

/**
 * Sides for the "Buy" and "Rent" labels at the placement year. The upper line's label goes
 * above it. The lower line's goes below it, unless that line is too close to the bottom of the
 * plot (rent staying near £0 while buying pulls ahead): then it goes above its line, left of the
 * point when the upper label is far enough above, else right of the point, so it never covers
 * the axis and never sits on the other label.
 * `buyY` and `rentY` are % of the plot height from the bottom.
 *
 * Given the lines (polish), the sides are also kept off both lines: when a label would sit on
 * a line (Cardiff at 360px: the rent label, above its line and left of the point, sat on the buy
 * line where the lines cross), the nearest arrangement that keeps both labels off both lines,
 * off each other, inside the plot and clear of the £0 line is used instead (measured boxes, so a
 * label may hang below a line under LOW_LABEL_LIMIT when it really fits). If there is none, the
 * sides above stand.
 */
export function labelSides(
  buyOnTop: boolean,
  buyY: number,
  rentY: number,
  lines?: LabelLines,
): { buy: LabelSide; rent: LabelSide } {
  const sides = defaultSides(buyOnTop, buyY, rentY);
  if (!lines) return sides;
  return clearSides(sides, buyY, rentY, lines) ?? sides;
}

type Sides = { buy: LabelSide; rent: LabelSide };

/** The sides before the lines are considered (see labelSides). */
function defaultSides(buyOnTop: boolean, buyY: number, rentY: number): Sides {
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

/**
 * The arrangement nearest `preferred` (fewest labels moved, then in SIDES order) that keeps both
 * labels off both lines, off each other, inside the plot and clear of the £0 line, or null when
 * there is none.
 */
function clearSides(
  preferred: Sides,
  buyY: number,
  rentY: number,
  lines: LabelLines,
): Sides | null {
  const fits = ({ buy, rent }: Sides): boolean => {
    const buyBox = labelBox(buy, lines.x, buyY, LABEL_BOX.width.buy);
    const rentBox = labelBox(rent, lines.x, rentY, LABEL_BOX.width.rent);
    // Inside the plot, and clear of the £0 line (the boxes are measured, so this replaces the
    // LOW_LABEL_LIMIT rule of thumb).
    const inside = (box: Rect) =>
      box.x0 >= 0 && box.x1 <= 100 && box.y0 >= lines.floor + BASELINE_CLEARANCE && box.y1 <= 100;
    return (
      inside(buyBox) &&
      inside(rentBox) &&
      !overlap(buyBox, rentBox) &&
      ![lines.buy, lines.rent].some((ys) => crosses(ys, buyBox) || crosses(ys, rentBox))
    );
  };
  const changes = (option: Sides) =>
    Number(option.buy !== preferred.buy) + Number(option.rent !== preferred.rent);
  const options = SIDES.flatMap((buy) => SIDES.map((rent) => ({ buy, rent }))).sort(
    (x, y) => changes(x) - changes(y),
  );
  return options.find(fits) ?? null;
}
