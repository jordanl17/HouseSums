/**
 * Shared contracts for the House Sums engine (phase 3).
 *
 * Units, everywhere in the engine and in the JSON files under data/:
 * - money in pounds (number, not pence), monthly or yearly as the name says;
 * - rates and percentages as decimals (4.3% is 0.043);
 * - years as whole numbers; months as "YYYY-MM" strings.
 *
 * Nothing in this file (or in any src/lib engine module) touches the DOM, imports JSON, or holds
 * a figure. Data is passed in by the caller, so phase 4's Preact island and phase 5's
 * pre-rendered pages can both use the engine.
 *
 * Ownership: the lead owns this file. Teammates may make small additive changes inside the
 * section marked for them and must say so in their handoff. Do not rename or remove anything.
 */

// ---------------------------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------------------------

/** UK nations. NI uses SDLT, the same tax as England. */
export type Nation = 'eng' | 'sco' | 'wal' | 'ni';
export const NATIONS: readonly Nation[] = ['eng', 'sco', 'wal', 'ni'];

/** "moving" assumes the current home is sold before or at completion, so no surcharge applies. */
export type BuyerType = 'first' | 'moving' | 'additional';
export const BUYER_TYPES: readonly BuyerType[] = ['first', 'moving', 'additional'];

/**
 * The Outlook control. "custom" is a display state only: it is shown once any of the four
 * preset-controlled inputs (houseGrowth, rentGrowth, investmentReturn, rateAfterFix) has been
 * overridden. What the engine and the URL carry is always a PresetName.
 */
export type OutlookPreset = 'cautious' | 'typical' | 'optimistic' | 'custom';
export type PresetName = Exclude<OutlookPreset, 'custom'>;
export const PRESET_NAMES: readonly PresetName[] = ['cautious', 'typical', 'optimistic'];

/** A month, "YYYY-MM". */
export type Month = string;

// ---------------------------------------------------------------------------------------------
// data/areas.json (owner: data teammate)
// ---------------------------------------------------------------------------------------------

/** The four local figures an area carries. */
export type AreaField = 'price' | 'growth10y' | 'rent' | 'rentGrowth';
export const AREA_FIELDS: readonly AreaField[] = ['price', 'growth10y', 'rent', 'rentGrowth'];

/** Area-level or nation-level figures. Raw values from the sources, not clamped. */
export interface AreaFigures {
  /** Latest UK HPI average price, all property types, pounds. */
  price: number;
  /** 10-year compound annual growth, (latest / price 10 years earlier)^(1/10) - 1. Unclamped. */
  growth10y: number;
  /** Latest ONS average monthly private rent, pounds. */
  rent: number;
  /** Latest annual change in rent, decimal. Unclamped. */
  rentGrowth: number;
}

export interface Area extends AreaFigures {
  /** ONS local authority code, e.g. "E08000035". */
  code: string;
  /** ONS name lowercased and hyphenated, unique across the file, e.g. "leeds". */
  slug: string;
  /**
   * Display name. The ONS name, except for the few in the "X, City of" / "X, County of" form,
   * which use the common form ("Bristol"); see data/area-names.json.
   */
  name: string;
  /** The ONS name, only when it differs from `name` (e.g. "Bristol, City of"). Phase 5. */
  onsName?: string;
  nation: Nation;
  /** Fields that used the nation's figure instead of a local one. Empty when all are local. */
  fallbacks: AreaField[];
  /**
   * Per-area months, only when they differ from the file's top-level asOf (e.g. NI prices are
   * quarterly). Missing keys mean "same as the file".
   */
  asOf?: Partial<Record<'price' | 'rent', Month>>;
  /** Scotland and NI only: the Broad Rental Market Area whose rent this area uses. */
  rentArea?: string;
  /** Fields that are clearly labelled sample placeholders, not real data. Absent when none. */
  sample?: AreaField[];
}

export interface AreasFile {
  schemaVersion: 1;
  /** True while any figure in the file is a sample placeholder. The UI shows a notice. */
  sample?: boolean;
  /** ISO timestamp of the pipeline run that wrote the file. */
  generatedAt: string;
  /** Latest month of the price and rent data. */
  asOf: { price: Month; rent: Month };
  /**
   * Nation-level figures: the fallback for missing local figures and the no-area default.
   * `asOf` (data teammate, additive) gives the months when they differ from the file's: NI
   * prices are quarterly and NI rents usually lag Great Britain by two months.
   */
  nations: Record<
    Nation,
    AreaFigures & { sample?: AreaField[]; asOf?: Partial<Record<'price' | 'rent', Month>> }
  >;
  /** Sorted by name. */
  areas: Area[];
}

/**
 * data/area-names.json (phase 5, lead): hand-maintained display names and slugs for the areas
 * whose ONS name is in the "X, City of" form, plus slug aliases so older links keep working.
 */
export interface AreaNameEntry {
  /** ONS local authority code. */
  code: string;
  /** The ONS name the entry was written for, e.g. "Bristol, City of". */
  ons: string;
  /** Display name, e.g. "Bristol". */
  name: string;
  /** URL slug, e.g. "bristol". */
  slug: string;
}

export interface AreaNamesFile {
  schemaVersion: 1;
  description: string;
  method: string;
  areas: AreaNameEntry[];
  /** Old slug -> current slug. Never remove an alias once it has been live. */
  aliases: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------
// data/rates.json (owner: data teammate)
// ---------------------------------------------------------------------------------------------

/** Loan-to-value bands the Bank of England publishes quoted rates for. */
export type LtvBand = 0.6 | 0.75 | 0.85 | 0.9 | 0.95;
export const LTV_BANDS: readonly LtvBand[] = [0.6, 0.75, 0.85, 0.9, 0.95];

export interface QuotedRate {
  /** Initial fixed period in years (the BoE publishes 2 and 5; 3 may be added). */
  fixYears: number;
  /** Maximum loan-to-value for the rate. */
  ltv: LtvBand;
  /** Annual rate, decimal. */
  rate: number;
  /** Bank of England IADB series code, e.g. "IUMBV34". */
  series: string;
  /** Month of the observation, when it differs from the file's asOf. */
  asOf?: Month;
  /** True when this rate is a sample placeholder. */
  sample?: boolean;
}

export interface RatesFile {
  schemaVersion: 1;
  sample?: boolean;
  generatedAt: string;
  asOf: Month;
  /** Human-readable source name, e.g. "Bank of England, quoted household interest rates". */
  source: string;
  rates: QuotedRate[];
}

// ---------------------------------------------------------------------------------------------
// data/sources.json (owner: data teammate)
// ---------------------------------------------------------------------------------------------

export interface DataSource {
  /** Stable id, e.g. "uk-hpi". */
  id: string;
  dataset: string;
  publisher: string;
  url: string;
  licence: string;
  licenceUrl?: string;
  asOf: Month;
  /** Extra detail such as series codes and their descriptions. */
  notes?: string;
  series?: { code: string; description: string }[];
}

export interface SourcesFile {
  schemaVersion: 1;
  sample?: boolean;
  generatedAt: string;
  sources: DataSource[];
}

// ---------------------------------------------------------------------------------------------
// data/taxRules.json (owner: tax teammate)
// ---------------------------------------------------------------------------------------------

export type TaxRegimeId = 'sdlt' | 'lbtt' | 'ltt';

/**
 * One band of a slice-based table: the part of the price above `from` and up to `to` is taxed
 * at `rate`. `to: null` means no upper limit. Bands are contiguous and start at 0.
 */
export interface TaxBand {
  from: number;
  to: number | null;
  rate: number;
}

export interface TaxSource {
  title: string;
  url: string;
  /** ISO date the figures were last checked against this page. */
  checked: string;
}

export interface TaxRegime {
  /** "Stamp Duty Land Tax" */
  name: string;
  /** "SDLT" */
  shortName: string;
  /** Plain-English name for the UI, e.g. "stamp duty". */
  plainName: string;
  /** Main residential rates. */
  bands: TaxBand[];
  /**
   * First-time buyer relief: an alternative band table used instead of the main bands, or null
   * where there is none (Wales). `maxPrice`: above it no relief at all (England 500000); null for
   * no cap (Scotland).
   */
  firstTimeBuyer: { bands: TaxBand[]; maxPrice: number | null } | null;
  /**
   * Additional property rules. Either a surcharge `rate` on the whole price on top of the main
   * bands (England +5%, Scotland ADS +8%), or a separate higher-rates `bands` table (Wales).
   * Neither applies when the price is below `minPrice` (40000).
   */
  additional:
    | { kind: 'wholePriceSurcharge'; rate: number; minPrice: number }
    | { kind: 'higherRatesTable'; bands: TaxBand[]; minPrice: number };
  sources: TaxSource[];
}

export interface TaxRules {
  schemaVersion: 1;
  /** Free-text status, e.g. what was verified and when. */
  note?: string;
  /** ISO date the rules take effect, "2026-04-01". */
  effectiveFrom: string;
  /** "2026/27" */
  taxYear: string;
  /** Which regime applies in each nation. */
  nations: Record<Nation, TaxRegimeId>;
  regimes: Record<TaxRegimeId, TaxRegime>;
}

export interface TaxQuery {
  nation: Nation;
  buyerType: BuyerType;
  price: number;
}

export interface TaxBandResult extends TaxBand {
  /** Tax charged on this band's slice, pounds. */
  tax: number;
}

export interface TaxResult {
  regime: TaxRegimeId;
  /** Total tax payable, whole pounds. */
  total: number;
  /** The band table actually applied (main, first-time buyer or higher-rates), with tax per band. */
  bands: TaxBandResult[];
  /** True when first-time buyer relief reduced the bill. */
  reliefApplied: boolean;
  /**
   * Tax due only because it's an additional property: total minus what a moving buyer would pay
   * at the same price. 0 when none applies.
   */
  surcharge: number;
}

// ---------------------------------------------------------------------------------------------
// Inputs (owner: model teammate for derivation, format-state teammate for the URL)
// ---------------------------------------------------------------------------------------------

/**
 * Every numeric input in the brief's Inputs table. Money in pounds, rates as decimals, years as
 * whole numbers.
 */
export interface NumericInputs {
  /** Property price. */
  price: number;
  /** Deposit (default 10% of price). */
  deposit: number;
  /** Monthly rent for a similar home. */
  rent: number;
  /** Initial mortgage rate, annual. */
  mortgageRate: number;
  /** House price growth, annual. */
  houseGrowth: number;
  /** Mortgage term in years. */
  termYears: number;
  /** Initial fix length in years. */
  fixYears: number;
  /** Rate after the fix ends, annual (remortgage, not SVR). */
  rateAfterFix: number;
  /** Product fee, charged only when there is a loan. */
  productFee: number;
  /** Legal fees when buying. */
  legalBuying: number;
  /** Survey (0 in Scotland, where the seller pays for the Home Report). */
  survey: number;
  /** Moving costs. */
  moving: number;
  /** Maintenance as a share of the home's value per year. */
  maintenanceRate: number;
  /** Buildings insurance per year. */
  insurance: number;
  /** Service charge, ground rent and factor fees per year. */
  serviceCharge: number;
  /** Annual rent increase. */
  rentGrowth: number;
  /** Investment return per year after fees. */
  investmentReturn: number;
  /** Inflation per year (uprates insurance and fixed fees). */
  inflation: number;
  /** Estate agent fee as a share of the sale price, including VAT. */
  agentFeeRate: number;
  /** Legal fees when selling. */
  legalSelling: number;
  /** Home Report, a seller cost. The model only applies it when nation is "sco". */
  homeReport: number;
  /** Years to compare, 1-40. */
  years: number;
}

export type NumericInputKey = keyof NumericInputs;

export const NUMERIC_INPUT_KEYS: readonly NumericInputKey[] = [
  'price',
  'deposit',
  'rent',
  'mortgageRate',
  'houseGrowth',
  'termYears',
  'fixYears',
  'rateAfterFix',
  'productFee',
  'legalBuying',
  'survey',
  'moving',
  'maintenanceRate',
  'insurance',
  'serviceCharge',
  'rentGrowth',
  'investmentReturn',
  'inflation',
  'agentFeeRate',
  'legalSelling',
  'homeReport',
  'years',
];

/** Everything the model needs. */
export interface Inputs extends NumericInputs {
  /** Tax rules and Scottish specifics follow this. */
  nation: Nation;
  buyerType: BuyerType;
}

/**
 * What the user picked, apart from numeric overrides. Together with Overrides this is the whole
 * calculator state, and it is what the URL encodes.
 */
export interface Selection {
  /** Area slug, or null for no area (nation-level figures are used). */
  areaSlug: string | null;
  buyerType: BuyerType;
  outlook: PresetName;
  /** Set only when the user overrides the area's nation (tax rules). */
  nationOverride: Nation | null;
}

/** Inputs the user has changed. A key that is absent means "use the derived default". */
export type Overrides = Partial<NumericInputs>;

/** Where a default value came from, for the "Local figure" / "Typical figure" tag. */
export interface Provenance {
  /** "local": the area's own figure. "typical": a national figure, nation fallback or brief default. */
  kind: 'local' | 'typical';
  /** Human-readable source, e.g. "UK House Price Index" or "House Sums typical figure". */
  source: string;
  /** Month of the data, or null for a fixed default. */
  month: Month | null;
  /**
   * Set when the brief's range held an area's growth figure (phase 6): the raw figure and the
   * bound it was held to, e.g. Aberdeen City's 10-year average of -0.0215 shown at the 0 floor.
   * The tag then says "Floored at 0%" or "Capped at 6%", never "Local figure".
   */
  held?: HeldFigure;
}

/** A figure clamped to the brief's range: the raw value, the bound used and which side it is. */
export interface HeldFigure {
  raw: number;
  bound: number;
  side: 'floor' | 'ceiling';
}

export interface DerivedInputs {
  /** Final inputs: overrides applied over derived defaults. */
  inputs: Inputs;
  /**
   * For each field, the value it would have without its own override, given the other overrides
   * (what a "Reset" link restores). Equal to `inputs` for fields that are not overridden.
   */
  base: Inputs;
  /** Provenance of each field's default value. */
  provenance: Record<NumericInputKey, Provenance>;
}

// ---------------------------------------------------------------------------------------------
// data/defaults.json (owner: model teammate)
// ---------------------------------------------------------------------------------------------

/** How a value is shown. Stored values are always in engine units (pounds, decimals, years). */
export type FieldUnit =
  'gbp' | 'gbpPerMonth' | 'gbpPerYear' | 'percent' | 'percentPerYear' | 'years';

export interface FieldSpec {
  /** Plain label for the UI, e.g. "Monthly rent for a similar home". */
  label: string;
  unit: FieldUnit;
  level: 'simple' | 'advanced';
  /**
   * The fixed default, or null when it is derived (price, rent, growth, rent growth, mortgage
   * rate, rate after fix and deposit come from the area, rates and presets).
   */
  default: number | null;
  /** Per-nation defaults that replace `default` (survey, Home Report). */
  byNation?: Partial<Record<Nation, number>>;
  /** Bounds and step in engine units, for inputs, sliders and URL clamping. */
  min: number;
  max: number;
  step: number;
  /**
   * Percentage fields only (required for them): decimal places of a percent the field always
   * shows, wherever its figure appears (input, sensitivity rows, area summary, tables), and keeps
   * when typed. 2 shows 0.051 as "5.10".
   */
  decimals?: number;
  /** Source note for the tooltip, e.g. "Common for first-time buyers". */
  source: string;
  /** Optional hint shown under the field. */
  hint?: string;
}

/**
 * Inputs whose default is derived (from the area, the rates or the Outlook preset) rather than
 * fixed: their FieldSpec.default is null. Every other field has a fixed default.
 * (Added by the model teammate, phase 3.)
 */
export const DERIVED_INPUT_KEYS: readonly NumericInputKey[] = [
  'price',
  'deposit',
  'rent',
  'mortgageRate',
  'houseGrowth',
  'rateAfterFix',
  'rentGrowth',
  'investmentReturn',
];

/** Applied to a clamped area figure: min(value + add, cap ?? Infinity), then clamped again. */
export interface PresetAdjust {
  add: number;
  cap: number | null;
}

export interface PresetSpec {
  label: string;
  description: string;
  houseGrowth: PresetAdjust;
  rentGrowth: PresetAdjust;
  /** Fixed investment return for the preset. */
  investmentReturn: number;
  /** rateAfterFix = mortgageRate + this. */
  rateAfterFixDelta: number;
}

export interface DefaultsFile {
  schemaVersion: 1;
  fields: Record<NumericInputKey, FieldSpec>;
  /** Deposit default as a share of the price (0.1). */
  depositFraction: number;
  /** Clamps applied to the raw area figures before presets (growth 0-6%, rent growth 1-6%). */
  areaClamps: Record<'houseGrowth' | 'rentGrowth', { min: number; max: number }>;
  presets: Record<PresetName, PresetSpec>;
  defaultPreset: PresetName;
  defaultBuyerType: BuyerType;
  /** Nation used when no area is picked and none is chosen. */
  defaultNation: Nation;
}

// ---------------------------------------------------------------------------------------------
// Model output (owner: model teammate)
// ---------------------------------------------------------------------------------------------

export interface UpfrontBreakdown {
  deposit: number;
  tax: number;
  legal: number;
  survey: number;
  moving: number;
  /** 0 when there is no loan. */
  productFee: number;
  /** Upfront costs on top of the deposit: tax + legal + survey + moving + productFee. */
  costs: number;
  /** deposit + costs. */
  cashNeeded: number;
}

export interface SellingBreakdown {
  /** Year-end the costs are for. */
  year: number;
  /** Home value at that year-end. */
  value: number;
  agentFee: number;
  legal: number;
  /** 0 outside Scotland. */
  homeReport: number;
  total: number;
}

export interface FirstMonthCosts {
  mortgage: number;
  maintenance: number;
  /** (insurance + service charge) / 12. */
  insuranceAndCharges: number;
  /** mortgage + maintenance + insuranceAndCharges. */
  owning: number;
  rent: number;
}

/** One year-end. Year 0 is day one, after the purchase. */
export interface YearPoint {
  year: number;
  /** What the buyer would walk away with if they sold at this year-end. */
  buyWealth: number;
  /** The renter's portfolio. */
  rentWealth: number;
  homeValue: number;
  mortgageBalance: number;
  sellingCosts: number;
  buyPortfolio: number;
  /** Totals paid during the year (0 for year 0). */
  owningPaid: number;
  rentPaid: number;
}

export interface SensitivityRow {
  /**
   * "growth": house price growth set to 0, 0.01 ... 0.05, everything else as entered.
   * "rate": mortgage rate and rate after fix both moved by -0.01 or +0.01 (floored at 0).
   */
  kind: 'growth' | 'rate';
  /** The growth used (growth rows) or the rate change applied (rate rows). */
  value: number;
  /** House price growth and initial mortgage rate actually used in this run. */
  houseGrowth: number;
  mortgageRate: number;
  breakEvenYear: number | null;
}

export interface ModelResult {
  /** First year-end (1..years) when buyWealth > rentWealth, or null. */
  breakEvenYear: number | null;
  /** First year-end after breakEvenYear when rentWealth >= buyWealth again, or null. */
  rentingOvertakesAgainYear: number | null;
  /** Year 0..years, one point per year-end. */
  series: YearPoint[];
  firstMonth: FirstMonthCosts;
  upfront: UpfrontBreakdown;
  tax: TaxResult;
  /** Selling costs at the horizon (the last year). */
  selling: SellingBreakdown;
  /** Growth 0..5% then rate -1 and +1 point. Empty when run with { sensitivity: false }. */
  sensitivity: SensitivityRow[];
}

export interface ModelOptions {
  /** Default true. Sensitivity re-runs the model 8 times. */
  sensitivity?: boolean;
}
