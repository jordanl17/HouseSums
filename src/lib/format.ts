/**
 * British number formatting and lenient parsing for the calculator. en-GB, £, commas, a true
 * minus sign (U+2212) for negatives.
 *
 * Owner: format-state teammate. STUB (phase 3 contracts): signatures only.
 */

/** U+2212 MINUS SIGN, used for every negative number shown. */
export const MINUS = '−';

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet (phase 3 stub)`);
};

export interface MoneyFormatOptions {
  /** Show pence ("£1,336.15"). Default false: rounded to whole pounds ("£1,336"). */
  pence?: boolean;
  /** Prefix "+" for positive values (for differences). Default false. */
  signed?: boolean;
}

/** 300000 -> "£300,000"; -1200 -> "−£1,200"; 1336.15 with { pence: true } -> "£1,336.15". */
export function formatMoney(value: number, options?: MoneyFormatOptions): string {
  return notImplemented(`formatMoney(${value}, ${String(options)})`);
}

export interface PercentFormatOptions {
  /** Decimal places. Default 2 for rates ("4.30%"); pass 1 for growth ("3.0%"). */
  decimals?: number;
  /** Append " a year" ("3.0% a year"). Default false. */
  perYear?: boolean;
}

/** Takes a decimal: 0.043 -> "4.30%"; 0.03 with { decimals: 1, perYear: true } -> "3.0% a year". */
export function formatPercent(rate: number, options?: PercentFormatOptions): string {
  return notImplemented(`formatPercent(${rate}, ${String(options)})`);
}

/** 1 -> "1 year"; 6 -> "6 years". */
export function formatYears(years: number): string {
  return notImplemented(`formatYears(${years})`);
}

/**
 * Lenient money parsing: "£300k", "300,000", "1.2m", " 300000 ", "£1,336.15". Returns pounds, or
 * null for anything that isn't a number. Never throws.
 */
export function parseMoney(text: string): number | null {
  return notImplemented(`parseMoney(${text})`);
}

/** "4.3", "4.3%", " 4.30 % " -> 0.043. Returns a decimal, or null. Never throws. */
export function parsePercent(text: string): number | null {
  return notImplemented(`parsePercent(${text})`);
}
