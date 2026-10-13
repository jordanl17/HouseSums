/**
 * Words for the parts of the calculator's results that load in the island's deferred chunk
 * (phase 6, perf: moved unchanged from copy.ts, so the island chunk does not carry them): the
 * sensitivity tables, the property tax name and notes, and the chart's spoken summary.
 *
 * Voice as in copy.ts (docs/brief.md): British English, plain words, hyphens never em-dashes,
 * no exclamation marks, never advice.
 */
import { breakEvenText, shortPercent, years } from './copy';
import { formatMoney, formatPercent } from './format';
import type {
  BuyerType,
  Inputs,
  ModelResult,
  SensitivityRow,
  TaxRegime,
  TaxRegimeId,
  TaxResult,
} from './types';

// ---------------------------------------------------------------------------------------------
// What moves the answer (sensitivity)
// ---------------------------------------------------------------------------------------------

/** A type alias, not an interface, so it can be passed where string-keyed rows are expected. */
export type SensitivityTableRow = {
  setting: string;
  answer: string;
};

export interface SensitivityTable {
  rows: SensitivityTableRow[];
  /** Index of the row that matches the current settings. */
  current: number;
}

const same = (a: number, b: number) => Math.abs(a - b) < 5e-6;

/**
 * Break-even year at 0-5% house price growth. When the current growth is not one of those, its
 * own row is added in order, so the current setting is always a row of the table.
 */
export function growthTable(result: ModelResult, inputs: Inputs): SensitivityTable {
  const rows = result.sensitivity
    .filter((row): row is SensitivityRow => row.kind === 'growth')
    .map((row) => ({ growth: row.houseGrowth, year: row.breakEvenYear }));
  if (!rows.some((row) => same(row.growth, inputs.houseGrowth))) {
    rows.push({ growth: inputs.houseGrowth, year: result.breakEvenYear });
    rows.sort((a, b) => a.growth - b.growth);
  }
  return {
    rows: rows.map((row) => ({
      setting: `${shortPercent(row.growth)} a year`,
      answer: breakEvenText(row.year, inputs.years),
    })),
    current: rows.findIndex((row) => same(row.growth, inputs.houseGrowth)),
  };
}

/**
 * Break-even year at the mortgage rate 1 point lower, as entered, and 1 point higher (the rate
 * after the fix moves by the same amount). A lower row that the floor at 0% makes equal to the
 * current rate is left out.
 */
export function rateTable(result: ModelResult, inputs: Inputs): SensitivityTable {
  const rateRows = result.sensitivity.filter((row) => row.kind === 'rate');
  const lower = rateRows.find((row) => row.value < 0);
  const higher = rateRows.find((row) => row.value > 0);
  const rows: SensitivityTableRow[] = [];
  if (lower && !same(lower.mortgageRate, inputs.mortgageRate)) {
    rows.push({
      setting: `${formatPercent(lower.mortgageRate)} (${shortPoints(inputs.mortgageRate - lower.mortgageRate)} lower)`,
      answer: breakEvenText(lower.breakEvenYear, inputs.years),
    });
  }
  const current = rows.length;
  rows.push({
    setting: formatPercent(inputs.mortgageRate),
    answer: breakEvenText(result.breakEvenYear, inputs.years),
  });
  if (higher) {
    rows.push({
      setting: `${formatPercent(higher.mortgageRate)} (${shortPoints(higher.mortgageRate - inputs.mortgageRate)} higher)`,
      answer: breakEvenText(higher.breakEvenYear, inputs.years),
    });
  }
  return { rows, current };
}

/** 0.01 -> "1 point", 0.005 -> "0.5 points". */
function shortPoints(rate: number): string {
  const text = shortPercent(rate).replace('%', '');
  return `${text} ${text === '1' ? 'point' : 'points'}`;
}

// ---------------------------------------------------------------------------------------------
// Property tax
// ---------------------------------------------------------------------------------------------

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The tax by name, plain words first: "Stamp duty (SDLT)", "Land and Buildings Transaction Tax
 * (LBTT)", "Land Transaction Tax (LTT)". Uses the plain name when it differs from the formal one.
 */
export function taxName(regime: TaxRegime): string {
  const plain = regime.plainName.trim();
  const name =
    plain !== '' && plain.toLowerCase() !== regime.name.toLowerCase()
      ? capitalise(plain)
      : regime.name;
  return `${name} (${regime.shortName})`;
}

/** Name of the extra charge on an additional property in each regime. */
const SURCHARGE_NAMES: Record<TaxRegimeId, string> = {
  sdlt: 'the higher rates for an additional property',
  lbtt: 'the Additional Dwelling Supplement (ADS)',
  ltt: 'the higher rates for an additional property',
};

/** One note on how the tax was worked out, or null: relief applied or not, or the surcharge. */
export function taxNote(
  tax: TaxResult,
  regime: TaxRegime,
  buyerType: BuyerType,
  price: number,
): string | null {
  if (buyerType === 'first') {
    if (tax.reliefApplied) return 'First-time buyer relief applied';
    if (regime.firstTimeBuyer === null) return `No first-time buyer relief on ${regime.shortName}`;
    const cap = regime.firstTimeBuyer.maxPrice;
    if (cap !== null && price > cap) return `No first-time buyer relief above ${formatMoney(cap)}`;
    return null;
  }
  if (buyerType === 'additional') {
    if (tax.surcharge > 0)
      return `Includes ${formatMoney(tax.surcharge)} for ${SURCHARGE_NAMES[tax.regime]}`;
    return `No extra charge for an additional property under ${formatMoney(regime.additional.minPrice)}`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Chart summary (read by screen readers in place of the drawing)
// ---------------------------------------------------------------------------------------------

export function chartSummary(result: ModelResult): string {
  const first = result.series[0];
  const last = result.series[result.series.length - 1];
  if (!first || !last) return '';
  const gap = (buy: number, rent: number) =>
    buy >= rent
      ? `${formatMoney(buy - rent)} ahead of renting`
      : `${formatMoney(rent - buy)} behind renting`;
  const parts = [`If you sold, buying starts ${gap(first.buyWealth, first.rentWealth)}`];
  if (result.breakEvenYear !== null) parts.push(`pulls ahead in year ${result.breakEvenYear}`);
  if (result.rentingOvertakesAgainYear !== null)
    parts.push(`falls behind again in year ${result.rentingOvertakesAgainYear}`);
  return `${parts.join(', ')} and ends ${gap(last.buyWealth, last.rentWealth)} after ${years(last.year)}.`;
}
