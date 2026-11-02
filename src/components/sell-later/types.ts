import type { FieldSpec } from '../../lib/types';
import type { SellLaterInputs } from '../../lib/sell-later';

/** The fields a person can change, in the order shown. */
export type SellLaterField = 'price' | 'deposit' | 'mortgageRate' | 'termYears' | 'yearsHeld';

/** Everything the island needs, worked out at build time from data/ (src/pages/sell-later.astro). */
export interface SellLaterProps {
  initial: SellLaterInputs;
  specs: Record<SellLaterField, FieldSpec>;
  /** Hint under each field: where its starting figure comes from. */
  sources: Record<SellLaterField, string>;
  /** Price changes for the table, decimals. */
  priceChanges: readonly number[];
  /** Price changes drawn on the chart, decimals. */
  chartChanges: readonly number[];
}
