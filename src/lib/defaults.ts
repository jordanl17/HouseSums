/**
 * Builds the full model Inputs from an area, the Bank of England rates, data/defaults.json, an
 * Outlook preset, the buyer type and the user's overrides. Every derived value carries a
 * Provenance so the UI can tag it "Local figure" or "Typical figure".
 *
 * Owner: model teammate. STUB (phase 3 contracts): signatures only.
 *
 * Derivation order (each step uses the final value of the steps before it, so overriding price
 * re-derives the deposit, and overriding the deposit re-picks the mortgage rate):
 *   nation  = selection.nationOverride ?? area.nation ?? defaults.defaultNation
 *   price, rent: area figure (local), or the nation's figure when the area has a fallback or no
 *     area is picked (typical)
 *   houseGrowth, rentGrowth: area figure clamped by defaults.areaClamps, then the preset's
 *     PresetAdjust, then clamped again
 *   deposit = price × defaults.depositFraction
 *   fixYears, termYears and other fixed fields: defaults.fields[key].byNation[nation] ?? default
 *   mortgageRate = pickMortgageRate(rates, (price - deposit) / price, fixYears)
 *   rateAfterFix = mortgageRate + preset.rateAfterFixDelta (floored at 0)
 *   investmentReturn = preset.investmentReturn
 *   survey, homeReport: by nation
 * then each field's override (if any) replaces the derived value.
 */
import type {
  Area,
  AreasFile,
  DefaultsFile,
  DerivedInputs,
  Overrides,
  QuotedRate,
  RatesFile,
  Selection,
} from './types';

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet (phase 3 stub)`);
};

export interface DeriveOptions {
  /** The picked area, or null for none (nation-level figures are used). */
  area: Area | null;
  /** For nation-level figures and the data months. */
  areas: AreasFile;
  rates: RatesFile;
  defaults: DefaultsFile;
  selection: Selection;
  /** The user's changed inputs. Omit or {} for pure defaults. */
  overrides?: Overrides;
}

/** Find an area by slug, or null. */
export function findArea(areas: AreasFile, slug: string | null): Area | null {
  return notImplemented(`findArea(${areas.areas.length}, ${String(slug)})`);
}

/**
 * The quoted rate for a loan-to-value and fix length: the smallest published LTV band at or above
 * `ltv` (the 95% band above 95%; the 60% band at or below 60%), and the nearest published fix
 * length (ties go to the shorter fix). Null only when `rates.rates` is empty.
 */
export function pickMortgageRate(
  rates: RatesFile,
  ltv: number,
  fixYears: number,
): QuotedRate | null {
  return notImplemented(`pickMortgageRate(${rates.asOf}, ${ltv}, ${fixYears})`);
}

/** Derive the full Inputs, the per-field reset values and provenance. Pure, never throws. */
export function deriveInputs(options: DeriveOptions): DerivedInputs {
  return notImplemented(`deriveInputs(${options.selection.areaSlug})`);
}
