/**
 * Units and number display for calculator fields, decided by the field's unit in
 * data/defaults.json. Pure helpers shared by the field primitives.
 */
import { formatMoney, formatPercent, parseMoney, parsePercent } from '../../../lib/format';
import type { FieldSpec, FieldUnit } from '../../../lib/types';

export interface Affixes {
  prefix?: string;
  suffix?: string;
}

/** "£" before money, "a month" / "a year" after it, "%" or "% a year" after rates, "years". */
export function affixesFor(unit: FieldUnit): Affixes {
  switch (unit) {
    case 'gbp':
      return { prefix: '£' };
    case 'gbpPerMonth':
      return { prefix: '£', suffix: 'a month' };
    case 'gbpPerYear':
      return { prefix: '£', suffix: 'a year' };
    case 'percent':
      return { suffix: '%' };
    case 'percentPerYear':
      return { suffix: '% a year' };
    case 'years':
      return { suffix: 'years' };
  }
}

/** Decimal places to show for a percentage field: 0.0005 -> 2 ("4.30"), 0.001 -> 1 ("3.0"). */
export function percentDecimals(step: number): number {
  const points = step * 100;
  if (!(points > 0)) return 2;
  return Math.max(0, Math.min(4, Math.ceil(-Math.log10(points) - 1e-9)));
}

/** Money for an input: "245,000", or "1,499.50" when there are pence. No "£" (the prefix shows it). */
export function formatMoneyValue(value: number): string {
  const pence = Math.round(value * 100) % 100 !== 0;
  return formatMoney(value, { pence }).replace('£', '');
}

/** A rate for an input, in percent without the sign: 0.043 -> "4.30". */
export function formatPercentValue(value: number, decimals: number): string {
  return formatPercent(value, { decimals }).replace('%', '');
}

/** Whole years: "30". */
export function formatYearsValue(value: number): string {
  return String(Math.round(value));
}

/** Lenient whole-number parse for years ("30", "30 years"). */
export function parseYears(text: string): number | null {
  const parsed = parseMoney(text.replace(/\s*years?$/i, ''));
  return parsed === null ? null : Math.round(parsed);
}

/** Display text for a field value, by unit. */
export function formatFieldValue(value: number, spec: FieldSpec): string {
  switch (spec.unit) {
    case 'percent':
    case 'percentPerYear':
      return formatPercentValue(value, percentDecimals(spec.step));
    case 'years':
      return formatYearsValue(value);
    default:
      return formatMoneyValue(value);
  }
}

/** Human value for aria-valuetext and tooltips: "£245,000", "4.30%", "3.0% a year", "30 years". */
export function describeFieldValue(value: number, spec: FieldSpec): string {
  const { prefix = '', suffix } = affixesFor(spec.unit);
  const text = `${prefix}${formatFieldValue(value, spec)}`;
  if (suffix === undefined) return text;
  return suffix.startsWith('%') ? `${text}${suffix}` : `${text} ${suffix}`;
}

/** Parse what someone typed into a field of this unit, in engine units, or null. */
export function parseFieldValue(text: string, spec: FieldSpec): number | null {
  switch (spec.unit) {
    case 'percent':
    case 'percentPerYear':
      return parsePercent(text);
    case 'years':
      return parseYears(text);
    default:
      return parseMoney(text);
  }
}

/** "2026-07" -> "Jul 2026". Anything else is returned unchanged. */
export function formatMonth(month: string | null): string {
  if (month === null) return '';
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const names = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const name = names[Number(match[2]) - 1];
  return name ? `${name} ${match[1]}` : month;
}
