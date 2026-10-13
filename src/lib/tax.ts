/**
 * Property tax on a residential purchase: SDLT (England and NI), LBTT (Scotland), LTT (Wales).
 *
 * Owner: tax teammate. Pure: every rate and threshold comes from the `rules` argument (loaded
 * from data/taxRules.json by the caller). Nothing numeric about tax lives in this file.
 *
 * STUB (phase 3 contracts): returns a zero bill until the tax teammate lands the real thing.
 * That is the correct answer for the model's reference scenario (first-time buyer, England,
 * £300,000), so the model can be built against it.
 */
import type { Nation, TaxQuery, TaxRegimeId, TaxResult, TaxRules } from './types';

/** The regime that applies in a nation (NI uses SDLT). */
export function regimeFor(nation: Nation, rules: TaxRules): TaxRegimeId {
  return rules.nations[nation];
}

/**
 * Tax due on a purchase. `total` is whole pounds; `bands` is the table actually applied with the
 * tax on each slice; `reliefApplied` is true when first-time buyer relief lowered the bill;
 * `surcharge` is the extra due only because it's an additional property.
 */
export function propertyTax(query: TaxQuery, rules: TaxRules): TaxResult {
  return {
    regime: regimeFor(query.nation, rules),
    total: 0,
    bands: [],
    reliefApplied: false,
    surcharge: 0,
  };
}
