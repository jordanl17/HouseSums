/**
 * Property tax on a residential purchase: SDLT (England and NI), LBTT (Scotland), LTT (Wales).
 *
 * Owner: tax teammate. Pure: every rate and threshold comes from the `rules` argument (loaded
 * from data/taxRules.json and validated with parseTaxRules by the caller). Nothing numeric about
 * tax lives in this file.
 *
 * How it works (see docs/decisions.md, "Tax rules verification (phase 3)"):
 * - Every table is slice-based: the part of the price inside each band is taxed at that band's
 *   rate.
 * - First-time buyer: if the regime has relief and the price is at or under its `maxPrice` (no
 *   cap when null), the relief table replaces the main table, unless it would cost more. Above
 *   the cap there is no relief at all (England's £500,000 cliff edge).
 * - Additional property, price at or above `minPrice` (£40,000): either a surcharge on the whole
 *   price on top of the main table (England and NI +5%, Scotland ADS +8%) or a separate
 *   higher-rates table that replaces the main one (Wales). Below `minPrice` it pays as a mover.
 * - "moving" assumes the current home is sold before or at completion: main rates, no surcharge.
 * - The total is rounded down to whole pounds, as HMRC, Revenue Scotland and the WRA do. Band
 *   figures are kept to the penny so the UI can show the working.
 * - Out of scope (stated in the explainer): the 2% non-UK resident SDLT surcharge, companies,
 *   shared ownership, multiple dwellings and other reliefs.
 */
import type {
  BuyerType,
  Nation,
  TaxBand,
  TaxBandResult,
  TaxQuery,
  TaxRegime,
  TaxRegimeId,
  TaxResult,
  TaxRules,
} from './types';

/** Guards Math.floor against binary float error such as 4499.999999999999. */
const EPSILON = 1e-6;

/** The regime that applies in a nation (NI uses SDLT). */
export function regimeFor(nation: Nation, rules: TaxRules): TaxRegimeId {
  return rules.nations[nation];
}

function toPence(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Tax on each band's slice of `price`. Every band is listed, with 0 above the price. */
function applyBands(bands: readonly TaxBand[], price: number): TaxBandResult[] {
  return bands.map((band) => {
    const top = band.to === null ? price : Math.min(price, band.to);
    const slice = Math.max(0, top - band.from);
    return { from: band.from, to: band.to, rate: band.rate, tax: toPence(slice * band.rate) };
  });
}

function sum(bands: readonly TaxBandResult[]): number {
  return bands.reduce((total, band) => total + band.tax, 0);
}

function wholePounds(value: number): number {
  return Math.max(0, Math.floor(value + EPSILON));
}

interface Bill {
  bands: TaxBandResult[];
  total: number;
  reliefApplied: boolean;
}

function bill(regime: TaxRegime, buyerType: BuyerType, price: number): Bill {
  const main = applyBands(regime.bands, price);
  const mainTotal = wholePounds(sum(main));
  const plain: Bill = { bands: main, total: mainTotal, reliefApplied: false };

  if (buyerType === 'first') {
    const relief = regime.firstTimeBuyer;
    const eligible = relief !== null && (relief.maxPrice === null || price <= relief.maxPrice);
    if (!eligible) return plain;
    const bands = applyBands(relief.bands, price);
    const total = wholePounds(sum(bands));
    if (total > mainTotal) return plain;
    return { bands, total, reliefApplied: total < mainTotal };
  }

  if (buyerType === 'additional' && price >= regime.additional.minPrice) {
    const additional = regime.additional;
    if (additional.kind === 'wholePriceSurcharge') {
      // The surcharge is on the whole price, on top of the main table: `bands` stay the main
      // table and the extra shows up in the result's `surcharge`.
      const surcharge = price * additional.rate;
      return { bands: main, total: wholePounds(sum(main) + surcharge), reliefApplied: false };
    }
    const bands = applyBands(additional.bands, price);
    return { bands, total: wholePounds(sum(bands)), reliefApplied: false };
  }

  return plain;
}

/**
 * Tax due on a purchase. `total` is whole pounds; `bands` is the table actually applied (main,
 * first-time buyer or the Welsh higher-rates table) with the tax on each slice, to the penny;
 * `reliefApplied` is true when first-time buyer relief lowered the bill; `surcharge` is the extra
 * due only because it's an additional property (total minus what a mover pays). A price that is
 * zero, negative or not a number is treated as zero.
 */
export function propertyTax(query: TaxQuery, rules: TaxRules): TaxResult {
  const regimeId = regimeFor(query.nation, rules);
  const regime = rules.regimes[regimeId];
  const price = Number.isFinite(query.price) && query.price > 0 ? query.price : 0;
  const result = bill(regime, query.buyerType, price);
  const surcharge =
    query.buyerType === 'additional'
      ? Math.max(0, result.total - bill(regime, 'moving', price).total)
      : 0;
  return {
    regime: regimeId,
    total: result.total,
    bands: result.bands,
    reliefApplied: result.reliefApplied,
    surcharge,
  };
}
