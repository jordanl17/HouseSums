/**
 * Sell later figures in the query string, so a link keeps them. Same keys and units as the Rent v
 * buy links (src/lib/state.ts): money in pounds, the rate in percentage points, years whole.
 * Only figures that differ from the starting ones are written; a link with none is the page
 * itself. Values are clamped to the field's bounds on the way in; anything unreadable is ignored.
 */
import type { SellLaterInputs } from './sell-later';
import type { FieldSpec } from './types';

export type SellLaterKey = 'price' | 'deposit' | 'mortgageRate' | 'termYears' | 'yearsHeld';

/** Stable: changing one breaks shared links. */
export const SELL_LATER_PARAMS = {
  price: 'p',
  deposit: 'd',
  mortgageRate: 'mr',
  termYears: 't',
  yearsHeld: 'y',
} as const satisfies Record<SellLaterKey, string>;

const KEYS = Object.keys(SELL_LATER_PARAMS) as SellLaterKey[];

/** URL text for a value: "4.25" for 0.0425, "300000" for £300,000, "5" for 5 years. */
function toParam(key: SellLaterKey, value: number): string {
  if (key === 'mortgageRate') return String(Number((value * 100).toFixed(4)));
  if (key === 'termYears' || key === 'yearsHeld') return String(Math.round(value));
  return String(Number(value.toFixed(2)));
}

/** "?p=320000&y=10", or "" when nothing differs from `initial`. */
export function encodeSellLater(inputs: SellLaterInputs, initial: SellLaterInputs): string {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    if (toParam(key, inputs[key]) !== toParam(key, initial[key])) {
      params.set(SELL_LATER_PARAMS[key], toParam(key, inputs[key]));
    }
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** The starting figures with whatever the query sets, each clamped to its field. */
export function decodeSellLater(
  search: string,
  initial: SellLaterInputs,
  specs: Record<SellLaterKey, FieldSpec>,
): SellLaterInputs {
  const params = new URLSearchParams(search);
  const next = { ...initial };
  for (const key of KEYS) {
    const text = params.get(SELL_LATER_PARAMS[key]);
    if (text === null || text.trim() === '') continue;
    let value = Number(text);
    if (!Number.isFinite(value)) continue;
    if (key === 'mortgageRate') value /= 100;
    if (key === 'termYears' || key === 'yearsHeld') value = Math.round(value);
    next[key] = Math.min(specs[key].max, Math.max(specs[key].min, value));
  }
  next.deposit = Math.min(next.deposit, next.price);
  next.yearsHeld = Math.min(next.yearsHeld, next.termYears);
  return next;
}
