/**
 * British number formatting and lenient parsing for the calculator. en-GB, £, commas, a true
 * minus sign (U+2212) for negatives.
 *
 * Owner: format-state teammate.
 *
 * Conventions:
 * - Signs come first: "−£1,200", "+£1,200". A value that rounds to zero is shown unsigned ("£0",
 *   "0.0%"), never as "−£0".
 * - Rounding is half away from zero, applied to the number as written in decimal (1.005 shows
 *   as "1.01"), the same on both sides of zero, so a column of differences lines up.
 * - The output has no hyphen-minus anywhere, so it reads correctly in tabular figures.
 * - Formatters return "" for NaN and infinities rather than "NaN" or throwing; parsers return
 *   null for anything that isn't a plain number. Nothing here throws.
 */

/** U+2212 MINUS SIGN, used for every negative number shown. */
export const MINUS = '−';

const LOCALE = 'en-GB';
const MAX_DECIMALS = 10;

const formatters = new Map<string, Intl.NumberFormat>();

/** Cached en-GB formatter with a fixed or maximum number of decimals. */
function numberFormat(minDecimals: number, maxDecimals: number): Intl.NumberFormat {
  const key = `${minDecimals}:${maxDecimals}`;
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals,
      useGrouping: true,
    });
    formatters.set(key, format);
  }
  return format;
}

/** Format the absolute value and work out the sign prefix, so "−0" never appears. */
function signed(
  value: number,
  format: Intl.NumberFormat,
  showPlus: boolean,
): { sign: string; digits: string } {
  const digits = format.format(Math.abs(value));
  const isZero = /^[0.,]*$/.test(digits);
  if (isZero) return { sign: '', digits };
  if (value < 0) return { sign: MINUS, digits };
  return { sign: showPlus ? '+' : '', digits };
}

/** Remove float noise from a scaled value (0.0435 * 100 is 4.3500000000000005 or 4.35). */
function clean(value: number): number {
  return Number(value.toPrecision(15));
}

export interface MoneyFormatOptions {
  /** Show pence ("£1,336.15"). Default false: rounded to whole pounds ("£1,336"). */
  pence?: boolean;
  /** Prefix "+" for positive values (for differences). Default false. */
  signed?: boolean;
}

/** 300000 -> "£300,000"; -1200 -> "−£1,200"; 1336.15 with { pence: true } -> "£1,336.15". */
export function formatMoney(value: number, options: MoneyFormatOptions = {}): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const decimals = options.pence === true ? 2 : 0;
  const { sign, digits } = signed(value, numberFormat(decimals, decimals), options.signed === true);
  return `${sign}£${digits}`;
}

export interface PercentFormatOptions {
  /** Decimal places. Default 2 for rates ("4.30%"); pass 1 for growth ("3.0%"). */
  decimals?: number;
  /** Append " a year" ("3.0% a year"). Default false. */
  perYear?: boolean;
  /** Prefix "+" for positive values (for changes such as "+1%"). Default false. */
  signed?: boolean;
}

/** Takes a decimal: 0.043 -> "4.30%"; 0.03 with { decimals: 1, perYear: true } -> "3.0% a year". */
export function formatPercent(rate: number, options: PercentFormatOptions = {}): string {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return '';
  const requested = options.decimals;
  const decimals =
    typeof requested === 'number' && Number.isFinite(requested)
      ? Math.min(MAX_DECIMALS, Math.max(0, Math.round(requested)))
      : 2;
  const { sign, digits } = signed(
    clean(rate * 100),
    numberFormat(decimals, decimals),
    options.signed === true,
  );
  return `${sign}${digits}%${options.perYear === true ? ' a year' : ''}`;
}

/**
 * A percentage field's figure at the precision the field always shows (its `decimals` in
 * data/defaults.json), so the same figure reads the same in the field, the tables and the
 * summary: 0.051 at 2 decimals -> "5.10%", 0.05 at 1 with { perYear: true } -> "5.0% a year".
 */
export function formatFieldPercent(
  rate: number,
  field: { decimals?: number | undefined },
  options: Omit<PercentFormatOptions, 'decimals'> = {},
): string {
  return formatPercent(rate, { ...options, decimals: field.decimals ?? 2 });
}

/** 1 -> "1 year"; 6 -> "6 years". At most one decimal place ("2.5 years"). */
export function formatYears(years: number): string {
  if (typeof years !== 'number' || !Number.isFinite(years)) return '';
  const { sign, digits } = signed(years, numberFormat(0, 1), false);
  return `${sign}${digits} ${digits === '1' ? 'year' : 'years'}`;
}

// A leading sign may sit before or after the pound sign, but only one sign is allowed.
// Digits are either plain ("300000") or grouped in threes with commas ("300,000").
const MONEY =
  /^([+\-−])?\s*(£)?\s*([+\-−])?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)\s*([km])?$/i;

const PERCENT =
  /^([+\-−])?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)\s*%?(?:\s*(?:a|per)\s+year)?$/i;

/** Build a number from a decimal string and a power of ten, exactly ("1.15", 3 -> 1150). */
function fromDecimal(sign: string | undefined, digits: string, exponent: number): number | null {
  const magnitude = Number(`${digits}e${exponent}`);
  if (!Number.isFinite(magnitude)) return null;
  if (magnitude === 0) return 0;
  return sign === '-' || sign === MINUS ? -magnitude : magnitude;
}

/**
 * Lenient money parsing: "£300k", "300,000", "1.2m", " 300000 ", "£1,336.15", "−£1,200".
 * Returns pounds, or null for anything that isn't a number. Never throws.
 *
 * Rejected on purpose: badly grouped commas ("3,00,000", "300,00"), spaces inside the digits,
 * exponents ("1e5"), unit words ("300 pcm") and anything else after the number.
 */
export function parseMoney(text: string): number | null {
  if (typeof text !== 'string') return null;
  const match = MONEY.exec(text.trim());
  if (!match) return null;
  const [, signBefore, , signAfter, number = '', suffix = ''] = match;
  if (signBefore !== undefined && signAfter !== undefined) return null;
  const exponent = { k: 3, m: 6 }[suffix.toLowerCase()] ?? 0;
  return fromDecimal(signBefore ?? signAfter, number.replaceAll(',', ''), exponent);
}

/**
 * "4.3", "4.3%", " 4.30 % ", "3.0% a year" -> a decimal (0.043). Returns null for anything else.
 * Never throws.
 */
export function parsePercent(text: string): number | null {
  if (typeof text !== 'string') return null;
  const match = PERCENT.exec(text.trim());
  if (!match) return null;
  const [, sign, number = ''] = match;
  return fromDecimal(sign, number.replaceAll(',', ''), -2);
}
