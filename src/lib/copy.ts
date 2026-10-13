/**
 * Words for the calculator's results (phase 4, results teammate). Pure functions, no DOM, no
 * JSON: the answer card, the "what would flip it" hint and key number labels. The sensitivity
 * tables, the property tax name and notes, and the chart's spoken summary are in
 * copy-details.ts (phase 6, perf: they load with the island's deferred chunk).
 *
 * Voice (docs/brief.md): answer first, British English, plain words, hyphens never em-dashes,
 * no exclamation marks, and never advice. Conditional wording only: "at these settings",
 * "if you sold", "buying would", never "you should".
 */
import { formatMoney, formatPercent } from './format';
import type { Inputs, ModelResult } from './types';

// ---------------------------------------------------------------------------------------------
// Small formatters
// ---------------------------------------------------------------------------------------------

/** "1 year", "6 years". */
export function years(count: number): string {
  return `${count} ${count === 1 ? 'year' : 'years'}`;
}

/** A percentage with no trailing zeros: 0.04 -> "4%", 0.045 -> "4.5%", 0.0325 -> "3.25%". */
export function shortPercent(rate: number): string {
  return formatPercent(rate, { decimals: 2 })
    .replace(/\.00%$/, '%')
    .replace(/(\.\d)0%$/, '$1%');
}

/** A whole year count as the sensitivity tables show it: "11 years", or "None in 25 years". */
export function breakEvenText(year: number | null, horizon: number): string {
  return year === null ? `None in ${years(horizon)}` : years(year);
}

// ---------------------------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------------------------

export type AnswerKind = 'break-even' | 'no-break-even';

export interface AnswerFacts {
  breakEvenYear: number | null;
  rentingOvertakesAgainYear: number | null;
  /** Years compared (the horizon). */
  years: number;
  /** The picked area's display name. */
  areaName: string;
  /** True when the deposit covers the whole price, so there is no mortgage. */
  noMortgage: boolean;
}

export interface AnswerCopy {
  kind: AnswerKind;
  /** Words before the numeral: "Buying pulls ahead after". */
  lead: string;
  /** The giant figure: the break-even year, or the horizon when renting stays ahead. */
  numeral: string;
  /** Words after the numeral: "years in Leeds". */
  unit: string;
  /** The whole headline as one sentence, for tests and summaries. */
  headline: string;
  /** One sentence explaining what the headline means. */
  note: string;
  /** "Renting catches up again in year 19.", or null. */
  overtake: string | null;
}

/**
 * The answer card's message before there is an answer: empty, loading a link's area, or an
 * error (an unknown place in the link, or the list of places failing to load).
 */
export function messageText(
  status: 'empty' | 'loading' | 'ready' | 'error',
  problem: 'unknown-area' | 'list-failed' | null,
): string {
  if (status === 'loading') return 'Bringing the local numbers for this link.';
  if (status === 'error') {
    return problem === 'unknown-area'
      ? "We couldn't find the place in that link. Pick a place and we'll bring its local numbers."
      : "The list of places didn't load. Check your connection, then pick a place again.";
  }
  return "Pick a place. We'll bring the local numbers.";
}

/** True when the deposit covers the whole price (the model caps the deposit at the price). */
export function hasNoMortgage(result: ModelResult): boolean {
  const start = result.series[0];
  return start !== undefined && start.homeValue > 0 && start.mortgageBalance <= 0;
}

/** The facts the answer card needs, from the model output. */
export function answerFacts(result: ModelResult, horizon: number, areaName: string): AnswerFacts {
  return {
    breakEvenYear: result.breakEvenYear,
    rentingOvertakesAgainYear: result.rentingOvertakesAgainYear,
    years: horizon,
    areaName,
    noMortgage: hasNoMortgage(result),
  };
}

const NO_MORTGAGE = "The deposit covers the whole price, so there's no mortgage.";

/**
 * Every answer case:
 * - break-even after N years (N = 1 is singular);
 * - break-even, then renting catches up again in year M;
 * - no break-even within the horizon ("Renting comes out ahead for all 25 years");
 * - no mortgage (deposit equals price), said plainly before the explanation.
 */
export function answerCopy(facts: AnswerFacts): AnswerCopy {
  const place = facts.areaName === '' ? '' : ` in ${facts.areaName}`;
  const lead = facts.noMortgage ? `${NO_MORTGAGE} ` : '';
  const what = facts.noMortgage
    ? 'renting and investing the same money'
    : 'renting and investing the difference';
  const own = facts.noMortgage ? 'buying outright' : 'buying';

  if (facts.breakEvenYear === null) {
    const all =
      facts.years === 1 ? 'Renting comes out ahead over' : 'Renting comes out ahead for all';
    const unit = `${facts.years === 1 ? 'year' : 'years'}${place}`;
    return {
      kind: 'no-break-even',
      lead: all,
      numeral: String(facts.years),
      unit,
      headline: `${all} ${facts.years} ${unit}`,
      note: `${lead}At these settings, whenever you sold, you would have more by ${what}.`,
      overtake: null,
    };
  }

  const year = facts.breakEvenYear;
  const unit = `${year === 1 ? 'year' : 'years'}${place}`;
  const again = facts.rentingOvertakesAgainYear;
  let when: string;
  if (again !== null && again - 1 > year)
    when = `If you sold between year ${year} and year ${again - 1}`;
  else if (again !== null) when = `If you sold in year ${year}`;
  else if (year === 1) when = 'Even if you sold after the first year';
  else when = `If you sold in year ${year} or later`;
  return {
    kind: 'break-even',
    lead: 'Buying pulls ahead after',
    numeral: String(year),
    unit,
    headline: `Buying pulls ahead after ${year} ${unit}`,
    note: `${lead}${when}, ${own} would leave you with more than ${what}.`,
    overtake: again === null ? null : `Renting catches up again in year ${again}.`,
  };
}

// ---------------------------------------------------------------------------------------------
// What would flip it
// ---------------------------------------------------------------------------------------------

/** Runs the model for a changed set of inputs and returns its break-even year. */
export type BreakEvenRunner = (inputs: Inputs) => number | null;

export interface FlipHint {
  /** Which input the hint names, or null when no single change within usual ranges flips it. */
  key: 'houseGrowth' | 'years' | 'rent' | 'mortgageRate' | null;
  /** The break-even year with that change, or null. */
  breakEvenYear: number | null;
  text: string;
}

/** Highest house price growth the hint tries by default: the brief's cap for local growth. The
 * island passes defaults.json's `areaClamps.houseGrowth.max` (FlipLimits). */
export const FLIP_GROWTH_MAX = 0.06;
/** Growth steps of half a point. */
export const FLIP_GROWTH_STEP = 0.005;
/** Rent tries up to half as much again, in 5% steps, rounded to £10. */
export const FLIP_RENT_MAX = 1.5;
/** The longest comparison the calculator allows, by default. The island passes defaults.json's
 * `fields.years.max` (FlipLimits). */
export const FLIP_YEARS_MAX = 40;

/** Limits the hint tries up to, read from defaults.json by the island so they never drift. */
export interface FlipLimits {
  growthMax: number;
  yearsMax: number;
}
/** Mortgage rate tries up to 3 points lower, in quarter-point steps, never below 0. */
export const FLIP_RATE_MAX_CUT = 0.03;

const tidy = (value: number) => Math.round(value * 1e10) / 1e10;

/**
 * "What would flip it", when renting comes out ahead for the whole horizon. Re-runs the model
 * with one input changed at a time, in this order, and names the first change that gives a
 * break-even year:
 *   1. house price growth, in half-point steps up to 6% a year;
 *   2. a longer comparison, up to 40 years;
 *   3. a higher rent for a similar home, up to 50% more;
 *   4. a lower mortgage rate (and rate after the fix, by the same amount), up to 3 points lower,
 *      only when there is a mortgage.
 * Plain conditional copy, never advice.
 */
export function flipHint(
  inputs: Inputs,
  run: BreakEvenRunner,
  noMortgage = false,
  limits: FlipLimits = { growthMax: FLIP_GROWTH_MAX, yearsMax: FLIP_YEARS_MAX },
): FlipHint {
  const { growthMax, yearsMax } = limits;
  // 1. House price growth.
  const startGrowth = Math.floor(inputs.houseGrowth / FLIP_GROWTH_STEP + 1e-9) + 1;
  for (let step = startGrowth; tidy(step * FLIP_GROWTH_STEP) <= growthMax + 1e-9; step++) {
    const houseGrowth = tidy(step * FLIP_GROWTH_STEP);
    const year = run({ ...inputs, houseGrowth });
    if (year !== null) {
      return {
        key: 'houseGrowth',
        breakEvenYear: year,
        text: `At ${shortPercent(houseGrowth)} house price growth a year, buying would pull ahead after ${years(year)}.`,
      };
    }
  }

  // 2. A longer comparison.
  if (inputs.years < yearsMax) {
    const year = run({ ...inputs, years: yearsMax });
    if (year !== null) {
      return {
        key: 'years',
        breakEvenYear: year,
        text: `Compared over ${yearsMax} years, buying would pull ahead after ${years(year)}.`,
      };
    }
  }

  // 3. A higher rent.
  for (let share = 1.05; share <= FLIP_RENT_MAX + 1e-9; share = tidy(share + 0.05)) {
    const rent = Math.round((inputs.rent * share) / 10) * 10;
    if (rent <= inputs.rent) continue;
    const year = run({ ...inputs, rent });
    if (year !== null) {
      return {
        key: 'rent',
        breakEvenYear: year,
        text: `If rent for a similar home were ${formatMoney(rent)} a month, buying would pull ahead after ${years(year)}.`,
      };
    }
  }

  // 4. A lower mortgage rate.
  if (!noMortgage) {
    for (let cut = 0.0025; cut <= FLIP_RATE_MAX_CUT + 1e-9; cut = tidy(cut + 0.0025)) {
      if (inputs.mortgageRate - cut < -1e-9) break;
      const mortgageRate = tidy(Math.max(0, inputs.mortgageRate - cut));
      const rateAfterFix = tidy(Math.max(0, inputs.rateAfterFix - cut));
      const year = run({ ...inputs, mortgageRate, rateAfterFix });
      if (year !== null) {
        return {
          key: 'mortgageRate',
          breakEvenYear: year,
          text: `At a ${shortPercent(mortgageRate)} mortgage rate, buying would pull ahead after ${years(year)}.`,
        };
      }
    }
  }

  return {
    key: null,
    breakEvenYear: null,
    text: 'No single change within usual ranges would flip that.',
  };
}

// ---------------------------------------------------------------------------------------------
// Key numbers
// ---------------------------------------------------------------------------------------------

export interface KeyNumbersCopy {
  cash: string;
  firstMonth: string;
  /** "After 10 years", or the horizon when it is shorter. */
  afterLabel: string;
  /** Signed difference, buy minus rent, with a true minus: "+£93,335", "−£12,400". */
  after: string;
  /** "buying ahead", "renting ahead" or "level". */
  afterUnit: string;
}

/** Year the "After N years" key number uses: 10, or the horizon when it is shorter. */
export function afterYear(result: ModelResult): number {
  return Math.min(10, result.series.length - 1);
}

export function keyNumbersCopy(result: ModelResult): KeyNumbersCopy {
  const year = afterYear(result);
  const point = result.series[year];
  const difference = point ? point.buyWealth - point.rentWealth : 0;
  const after = formatMoney(difference, { signed: true });
  let afterUnit = 'level';
  if (after.startsWith('+')) afterUnit = 'buying ahead';
  else if (after !== '£0') afterUnit = 'renting ahead';
  return {
    cash: formatMoney(result.upfront.cashNeeded),
    firstMonth: `${formatMoney(result.firstMonth.owning)} / ${formatMoney(result.firstMonth.rent)}`,
    afterLabel: `After ${years(year)}`,
    after,
    afterUnit,
  };
}
