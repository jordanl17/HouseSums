/**
 * Pure helpers for the calculator's inputs (phase 4, inputs teammate): area search, clamping
 * and the calm notes that go with it, deposit copy, slider ranges, labels and the advanced
 * panel's groups. No DOM, no JSON imports, no figures: limits come from data/defaults.json
 * (passed in as FieldSpec) and tax names from data/taxRules.json.
 */
import { formatMoney, formatPercent } from './format';
import type { DefaultsFile, FieldSpec, Nation, NumericInputKey, TaxRules } from './types';

export const NATION_NAMES: Record<Nation, string> = {
  eng: 'England',
  sco: 'Scotland',
  wal: 'Wales',
  ni: 'Northern Ireland',
};

// ---------------------------------------------------------------------------------------------
// Area search
// ---------------------------------------------------------------------------------------------

/** Lower case, no diacritics, no punctuation, single spaces: "Ynys Môn" -> "ynys mon". */
export function normaliseName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Areas whose name contains the query (case, diacritics and punctuation ignored), best first:
 * an exact match, then names that start with it, then names with a word that starts with it,
 * then the rest. Alphabetical order (the list's order) within each group.
 */
export function filterAreas<T extends { name: string }>(areas: readonly T[], query: string): T[] {
  const q = normaliseName(query);
  if (q === '') return [...areas];
  const ranked: T[][] = [[], [], [], []];
  for (const area of areas) {
    const name = normaliseName(area.name);
    if (name === q) ranked[0]?.push(area);
    else if (name.startsWith(q)) ranked[1]?.push(area);
    else if (name.includes(` ${q}`)) ranked[2]?.push(area);
    else if (name.includes(q)) ranked[3]?.push(area);
  }
  return ranked.flat();
}

/** The area whose name matches the text exactly (case and diacritics ignored), if any. */
export function exactArea<T extends { name: string }>(areas: readonly T[], text: string): T | null {
  const q = normaliseName(text);
  if (q === '') return null;
  return areas.find((area) => normaliseName(area.name) === q) ?? null;
}

/** One line under the area field. Kept short so the field never changes height at 360px. */
export function areaHint(options: {
  status: 'empty' | 'loading' | 'ready' | 'error';
  nation: Nation;
  taxRules: TaxRules;
  problem?: 'unknown-area' | 'list-failed' | null;
}): string {
  const { status, nation, taxRules } = options;
  if (status === 'loading') return 'Finding the place in this link';
  if (status === 'error') {
    return options.problem === 'unknown-area'
      ? "That link's place isn't on our list"
      : "Couldn't load places";
  }
  if (status === 'empty') return 'A local authority, such as Leeds';
  const regime = taxRules.regimes[taxRules.nations[nation]];
  if (regime.plainName === 'stamp duty') return `Stamp duty (${regime.shortName}) applies`;
  return `${regime.shortName}: ${NATION_NAMES[nation]}'s stamp duty`;
}

/** "England: stamp duty (SDLT)", "Scotland: LBTT". For the tax rules control. */
export function nationOptionLabel(nation: Nation, taxRules: TaxRules): string {
  const regime = taxRules.regimes[taxRules.nations[nation]];
  const tax =
    regime.plainName === 'stamp duty' ? `stamp duty (${regime.shortName})` : regime.shortName;
  return `${NATION_NAMES[nation]}: ${tax}`;
}

// ---------------------------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------------------------

/** Round to the step's precision, dropping float noise from range inputs (0.0435000001). */
export function roundToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

export interface Clamped {
  value: number;
  /** Which limit the value was pulled back to, or null when it was already in range. */
  hit: 'min' | 'max' | null;
}

/** Keep a typed value inside the field's bounds from defaults.json. Years are whole. */
export function clampToSpec(value: number, spec: FieldSpec): Clamped {
  const whole = spec.unit === 'years' ? Math.round(value) : value;
  if (whole < spec.min) return { value: spec.min, hit: 'min' };
  if (whole > spec.max) return { value: spec.max, hit: 'max' };
  return { value: whole, hit: null };
}

/** A value with its unit, for notes: "£10,000", "£100 a month", "15.00%", "40 years". */
export function describeLimit(value: number, spec: FieldSpec): string {
  switch (spec.unit) {
    case 'gbp':
      return formatMoney(value);
    case 'gbpPerMonth':
      return `${formatMoney(value)} a month`;
    case 'gbpPerYear':
      return `${formatMoney(value)} a year`;
    case 'percent':
      return formatPercent(value, { decimals: spec.step < 0.001 ? 2 : 1 });
    case 'percentPerYear':
      return formatPercent(value, { decimals: spec.step < 0.001 ? 2 : 1, perYear: true });
    case 'years':
      return `${Math.round(value)} ${Math.round(value) === 1 ? 'year' : 'years'}`;
  }
}

/** The calm note shown when a typed value was pulled back into range. */
export function rangeNote(hit: 'min' | 'max', spec: FieldSpec): string {
  return hit === 'min'
    ? `The lowest this takes is ${describeLimit(spec.min, spec)}`
    : `The highest this takes is ${describeLimit(spec.max, spec)}`;
}

/** Shown when the typed text isn't a number; the field goes back to its value. */
export const NOT_A_NUMBER_NOTE = "That isn't a number, so it's unchanged";

const LTV_TERM = "loan-to-value (how much of the price you're borrowing)";

/** "12.5%" or "10%": one decimal only when it is needed. */
function share(fraction: number): string {
  const tenths = Math.round(fraction * 1000);
  return formatPercent(tenths / 1000, { decimals: tenths % 10 === 0 ? 0 : 1 });
}

/** Deposit hint: its share of the price, with loan-to-value explained on first use. */
export function depositHint(deposit: number, price: number): string {
  if (!(price > 0)) return '';
  if (deposit >= price) return 'All of the price, so no mortgage';
  const fraction = Math.max(0, deposit) / price;
  const ltv = share(1 - fraction);
  if (deposit <= 0) return `No deposit, so ${ltv} ${LTV_TERM}`;
  return `${share(fraction)} of the price, so ${ltv} ${LTV_TERM}`;
}

/** The deposit's calm note, or null: more than the price, or under 5%. */
export function depositNote(deposit: number, price: number): string | null {
  if (!(price > 0)) return null;
  if (deposit > price) return "Deposit can't be more than the price";
  if (deposit / price < 0.05 - 1e-9) return 'Few lenders offer loans above 95% loan-to-value';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Sliders
// ---------------------------------------------------------------------------------------------

/** The four key inputs that get a slider as well as a number field. */
export const SLIDER_KEYS: readonly NumericInputKey[] = [
  'price',
  'rent',
  'mortgageRate',
  'houseGrowth',
];

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

/**
 * Slider bounds. The field's own bounds are far too wide for a slider (a price of £10,000 to
 * £10m), so price and rent run from 0.4x to 2.5x the local figure with round ends, the rate from
 * 0% to 10%, and growth across its whole range. A typed value outside the slider's range is
 * still used; the slider just sits at its end.
 */
export function sliderRange(key: NumericInputKey, base: number, spec: FieldSpec): SliderRange {
  const within = (value: number) => Math.min(spec.max, Math.max(spec.min, value));
  if (key === 'price' || key === 'rent') {
    const unit = key === 'price' ? 10000 : 50;
    const centre = base > 0 ? base : spec.min;
    return {
      min: within(Math.floor((centre * 0.4) / unit) * unit),
      max: within(Math.ceil((centre * 2.5) / unit) * unit),
      step: spec.step,
    };
  }
  if (key === 'mortgageRate') return { min: spec.min, max: within(0.1), step: spec.step };
  return { min: spec.min, max: spec.max, step: spec.step };
}

// ---------------------------------------------------------------------------------------------
// Labels and hints
// ---------------------------------------------------------------------------------------------

export function mortgageRateLabel(label: string, fixYears: number): string {
  return `${label}, ${Math.round(fixYears)}-year fix`;
}

/**
 * Short hints under some advanced fields, explaining a term or what the number covers. Copy, not
 * figures; the service charge's flats hint comes from defaults.json.
 */
export const FIELD_HINTS: Partial<Record<NumericInputKey, string>> = {
  rateAfterFix: "Assumes you remortgage rather than pay the lender's standard variable rate",
  productFee: "The lender's arrangement fee, only paid with a mortgage",
  maintenanceRate: "Of the home's value, each year",
  investmentReturn: 'If you invested in a global index fund in an ISA, after fees',
  inflation: 'Uprates buildings insurance and the service charge',
  agentFeeRate: 'Of the sale price, including VAT',
  homeReport: 'Scotland only: the survey pack the seller pays for',
  years: 'How long you might stay, from 1 to 40 years',
};

/** Survey hint depends on the nation: in Scotland the seller's Home Report replaces it. */
export function surveyHint(nation: Nation): string | undefined {
  return nation === 'sco' ? 'In Scotland the seller pays for a Home Report instead' : undefined;
}

// ---------------------------------------------------------------------------------------------
// Advanced panel
// ---------------------------------------------------------------------------------------------

export interface AdvancedGroup {
  title: string;
  /** True for the group that starts with the tax rules (nation) control. */
  nation?: boolean;
  keys: readonly NumericInputKey[];
}

export const ADVANCED_GROUPS: readonly AdvancedGroup[] = [
  { title: 'Tax and time frame', nation: true, keys: ['years'] },
  { title: 'Mortgage', keys: ['termYears', 'fixYears', 'rateAfterFix', 'productFee'] },
  { title: 'Buying costs', keys: ['legalBuying', 'survey', 'moving'] },
  { title: 'Running costs', keys: ['maintenanceRate', 'insurance', 'serviceCharge'] },
  { title: 'Renting and investing', keys: ['rentGrowth', 'investmentReturn', 'inflation'] },
  { title: 'Selling costs', keys: ['agentFeeRate', 'legalSelling', 'homeReport'] },
];

/** Whether a field is shown for this tax nation: the Home Report is Scotland only. */
export function shownFor(key: NumericInputKey, nation: Nation): boolean {
  return key !== 'homeReport' || nation === 'sco';
}

/** The advanced numeric inputs shown for this nation, in panel order. */
export function advancedKeys(nation: Nation, defaults: DefaultsFile): NumericInputKey[] {
  return ADVANCED_GROUPS.flatMap((group) => group.keys).filter(
    (key) => defaults.fields[key].level === 'advanced' && shownFor(key, nation),
  );
}

/** N in "Adjust every assumption (N)": the tax rules control plus the numeric inputs shown. */
export function advancedCount(nation: Nation, defaults: DefaultsFile): number {
  return advancedKeys(nation, defaults).length + 1;
}
