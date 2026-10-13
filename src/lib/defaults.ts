/**
 * Builds the full model Inputs from an area, the Bank of England rates, data/defaults.json, an
 * Outlook preset, the buyer type and the user's overrides. Every derived value carries a
 * Provenance so the UI can tag it "Local figure" or "Typical figure".
 *
 * Owner: model teammate. Pure: no DOM, no JSON imports, no figures (every number comes from the
 * arguments). The only literals here are source names for the provenance tags.
 *
 * Derivation order (each step uses the final value of the steps before it, so overriding price
 * re-derives the deposit, and overriding the deposit re-picks the mortgage rate):
 *   nation  = selection.nationOverride ?? area.nation ?? defaults.defaultNation
 *   price, rent: area figure (local), or the nation's figure when the area has a fallback or no
 *     area is picked (typical). With an area, the fallback nation is the area's own nation, even
 *     when the tax nation is overridden.
 *   houseGrowth, rentGrowth: area figure clamped by defaults.areaClamps, then the preset's
 *     PresetAdjust, then clamped again
 *   deposit = price × defaults.depositFraction
 *   fixYears, termYears and other fixed fields: defaults.fields[key].byNation[nation] ?? default
 *   mortgageRate = pickMortgageRate(rates, (price - deposit) / price, fixYears)
 *   rateAfterFix = mortgageRate + preset.rateAfterFixDelta (floored at 0)
 *   investmentReturn = preset.investmentReturn
 *   survey, homeReport: by nation
 * then each field's override (if any) replaces the derived value.
 *
 * Provenance: "local" only for an area's own figure (clamping to the brief's range keeps it
 * local). A nation figure, a fixed default, a Bank of England rate (a UK figure) or a value the
 * Outlook preset changed is "typical". Sample placeholder figures say so in the source.
 */
import {
  DERIVED_INPUT_KEYS,
  NUMERIC_INPUT_KEYS,
  type Area,
  type AreaField,
  type AreasFile,
  type DefaultsFile,
  type DerivedInputs,
  type Inputs,
  type Month,
  type Nation,
  type NumericInputKey,
  type Overrides,
  type Provenance,
  type QuotedRate,
  type RatesFile,
  type Selection,
} from './types';

/**
 * An area as deriveInputs needs it. The ONS code is not used, so the client's compact area list
 * (phase 4, src/lib/area-list.ts) can leave it out.
 */
export type DeriveArea = Omit<Area, 'code'>;

/** The parts of areas.json deriveInputs reads: the data months and the nation-level figures. */
export type AreasMeta = Pick<AreasFile, 'asOf' | 'nations'>;

export interface DeriveOptions {
  /** The picked area, or null for none (nation-level figures are used). */
  area: DeriveArea | null;
  /** For nation-level figures and the data months. A whole AreasFile is fine. */
  areas: AreasMeta | AreasFile;
  rates: RatesFile;
  defaults: DefaultsFile;
  selection: Selection;
  /** The user's changed inputs. Omit or {} for pure defaults. */
  overrides?: Overrides;
}

const NATION_NAMES: Record<Nation, string> = {
  eng: 'England',
  sco: 'Scotland',
  wal: 'Wales',
  ni: 'Northern Ireland',
};

const HPI = 'UK House Price Index';
const RENTS = 'ONS Price Index of Private Rents';
const SAMPLE = ' (sample figure, not real data)';

/** Allowance for floating-point loan-to-values such as 0.9000000000000001. */
const LTV_EPSILON = 1e-9;

/** Find an area by slug, or null. */
export function findArea(areas: AreasFile, slug: string | null): Area | null {
  if (slug === null) return null;
  return areas.areas.find((area) => area.slug === slug) ?? null;
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
  let fix: number | null = null;
  for (const quoted of rates.rates) {
    const distance = Math.abs(quoted.fixYears - fixYears);
    if (
      fix === null ||
      distance < Math.abs(fix - fixYears) ||
      (distance === Math.abs(fix - fixYears) && quoted.fixYears < fix)
    ) {
      fix = quoted.fixYears;
    }
  }
  let best: QuotedRate | null = null;
  let largest: QuotedRate | null = null;
  for (const quoted of rates.rates) {
    if (quoted.fixYears !== fix) continue;
    if (largest === null || quoted.ltv > largest.ltv) largest = quoted;
    if (quoted.ltv + LTV_EPSILON >= ltv && (best === null || quoted.ltv < best.ltv)) best = quoted;
  }
  return best ?? largest;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Drops binary noise from sums such as 0.041 + 0.01, so derived values read and compare cleanly. */
const tidy = (value: number): number => Math.round(value * 1e10) / 1e10;

const isSample = (list: readonly AreaField[] | undefined, field: AreaField): boolean =>
  list?.includes(field) ?? false;

/** Derive the full Inputs, the per-field reset values and provenance. Pure, never throws. */
export function deriveInputs(options: DeriveOptions): DerivedInputs {
  const { area, areas, rates, defaults, selection } = options;
  const overrides = options.overrides ?? {};
  const preset = defaults.presets[selection.outlook] ?? defaults.presets[defaults.defaultPreset];

  const nation: Nation = selection.nationOverride ?? area?.nation ?? defaults.defaultNation;
  const figuresNation: Nation = area?.nation ?? nation;
  const nationFigures = areas.nations[figuresNation];

  const values = {} as Record<NumericInputKey, number>;
  const base = {} as Record<NumericInputKey, number>;
  const provenance = {} as Record<NumericInputKey, Provenance>;

  /** Record a derived value and apply the field's override, if a usable one exists. */
  const set = (key: NumericInputKey, derived: number, source: Provenance): number => {
    const override = overrides[key];
    base[key] = derived;
    provenance[key] = source;
    values[key] = typeof override === 'number' && Number.isFinite(override) ? override : derived;
    return values[key];
  };

  const typical = (source: string, month: Month | null = null): Provenance => ({
    kind: 'typical',
    source,
    month,
  });

  /** An area figure, or the nation's figure when it fell back or there is no area. */
  const areaFigure = (field: AreaField, dataset: string, monthKey: 'price' | 'rent') => {
    const fileMonth = areas.asOf[monthKey];
    if (area && !area.fallbacks.includes(field)) {
      let source = dataset;
      if (monthKey === 'rent' && area.rentArea) source += `, ${area.rentArea} rental area`;
      if (isSample(area.sample, field)) source += SAMPLE;
      const month = area.asOf?.[monthKey] ?? fileMonth;
      return { value: area[field], provenance: { kind: 'local', source, month } as Provenance };
    }
    let source = `${dataset}, ${NATION_NAMES[figuresNation]} average`;
    if (isSample(nationFigures.sample, field)) source += SAMPLE;
    return { value: nationFigures[field], provenance: typical(source, fileMonth) };
  };

  /** Clamp to the brief's range, apply the preset, clamp again. */
  const growth = (
    field: 'growth10y' | 'rentGrowth',
    key: 'houseGrowth' | 'rentGrowth',
    dataset: string,
    monthKey: 'price' | 'rent',
  ) => {
    const { value, provenance: origin } = areaFigure(field, dataset, monthKey);
    const { min, max } = defaults.areaClamps[key];
    const clamped = clamp(value, min, max);
    const adjust = preset[key];
    const adjusted = tidy(clamp(Math.min(clamped + adjust.add, adjust.cap ?? Infinity), min, max));
    if (adjusted === clamped) return set(key, clamped, origin);
    return set(
      key,
      adjusted,
      typical(`${origin.source}, adjusted for the ${preset.label} outlook`, origin.month),
    );
  };

  // 1. Price and rent.
  const priceFigure = areaFigure('price', HPI, 'price');
  const price = set('price', priceFigure.value, priceFigure.provenance);
  const rentFigure = areaFigure('rent', RENTS, 'rent');
  set('rent', rentFigure.value, rentFigure.provenance);

  // 2. Growth and rent growth.
  growth('growth10y', 'houseGrowth', `${HPI}, 10-year average`, 'price');
  growth('rentGrowth', 'rentGrowth', `${RENTS}, annual change`, 'rent');

  // 3. Deposit from the final price.
  const deposit = set(
    'deposit',
    tidy(Math.max(0, price) * defaults.depositFraction),
    typical(defaults.fields.deposit.source),
  );

  // 4. Fixed and per-nation fields.
  for (const key of NUMERIC_INPUT_KEYS) {
    if (key in values) continue;
    const field = defaults.fields[key];
    const fixed = field.byNation?.[nation] ?? field.default;
    if (fixed !== null) set(key, fixed, typical(field.source));
    // parseDefaults rejects a missing fixed default; the minimum keeps this total regardless.
    else if (!DERIVED_INPUT_KEYS.includes(key)) set(key, field.min, typical(field.source));
  }

  // 5. Mortgage rate from the final loan-to-value and fix length.
  const ltv = price > 0 ? Math.max(0, price - deposit) / price : 0;
  const quoted = pickMortgageRate(rates, ltv, values.fixYears);
  let rateSource = defaults.fields.mortgageRate.source;
  if (quoted) {
    rateSource = `${rates.source}: ${quoted.fixYears}-year fix, up to ${tidy(quoted.ltv * 100)}% loan-to-value`;
    if (quoted.sample) rateSource += SAMPLE;
  }
  const mortgageRate = set(
    'mortgageRate',
    quoted?.rate ?? defaults.fields.mortgageRate.min,
    typical(rateSource, quoted ? (quoted.asOf ?? rates.asOf) : null),
  );

  // 6. Rate after the fix and investment return, from the preset.
  const afterSource =
    preset.rateAfterFixDelta === 0
      ? defaults.fields.rateAfterFix.source
      : `The initial rate, adjusted for the ${preset.label} outlook`;
  set(
    'rateAfterFix',
    tidy(Math.max(0, mortgageRate + preset.rateAfterFixDelta)),
    typical(afterSource),
  );
  set(
    'investmentReturn',
    preset.investmentReturn,
    typical(`${defaults.fields.investmentReturn.source} (${preset.label} outlook)`),
  );

  const inputs: Inputs = { ...values, nation, buyerType: selection.buyerType };
  return { inputs, base: { ...base, nation, buyerType: selection.buyerType }, provenance };
}
