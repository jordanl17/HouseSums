/**
 * Calculator state <-> URL search params. The state is a Selection (area, buyer type, outlook,
 * nation override) plus Overrides (only the inputs the user changed). Only values that differ
 * from the defaults are written, under short stable keys (documented in docs/decisions.md, "URL
 * state keys (phase 3)"), so links stay short.
 *
 * Owner: format-state teammate.
 *
 * Flow in phase 4:
 *   const { selection, overrides } = decodeState(location.search, defaults, knownSlugs);
 *   const derived = deriveInputs({ area, areas, rates, defaults, selection, overrides });
 *   ...on change: history.replaceState(null, '', '?' + encodeState({ selection, overrides }, derived.base, defaults));
 *
 * How numbers are written, decided by the field's unit in defaults.json (no list in code):
 * - "percent" and "percentPerYear": as a percentage, up to 4 decimal places ("mr=4.3" is 0.043).
 * - "years": a whole number ("y=10").
 * - money ("gbp", "gbpPerMonth", "gbpPerYear"): pounds, up to 2 decimal places ("pf=1499.5").
 * Values are clamped to the field's min and max and rounded to that precision on the way out and
 * on the way in, so decode(encode(x)) is exact for anything the UI can enter, and encoding a
 * decoded state is stable.
 */
import { parseMoney, parsePercent } from './format';
import {
  BUYER_TYPES,
  NATIONS,
  NUMERIC_INPUT_KEYS,
  PRESET_NAMES,
  type DefaultsFile,
  type FieldSpec,
  type Inputs,
  type NumericInputKey,
  type Overrides,
  type Selection,
} from './types';

export interface CalculatorState {
  selection: Selection;
  overrides: Overrides;
}

/** URL keys for the selection. Stable: changing one breaks shared links. */
export const SELECTION_PARAMS = {
  areaSlug: 'a',
  buyerType: 'b',
  outlook: 'o',
  nationOverride: 'n',
} as const satisfies Record<keyof Selection, string>;

/** URL keys for the numeric inputs. Stable: changing one breaks shared links. */
export const INPUT_PARAMS = {
  price: 'p',
  deposit: 'd',
  rent: 'r',
  mortgageRate: 'mr',
  houseGrowth: 'g',
  termYears: 't',
  fixYears: 'fx',
  rateAfterFix: 'ra',
  productFee: 'pf',
  legalBuying: 'lb',
  survey: 'sv',
  moving: 'mv',
  maintenanceRate: 'mt',
  insurance: 'ins',
  serviceCharge: 'sc',
  rentGrowth: 'rg',
  investmentReturn: 'ir',
  inflation: 'inf',
  agentFeeRate: 'ag',
  legalSelling: 'ls',
  homeReport: 'hr',
  years: 'y',
} as const satisfies Record<NumericInputKey, string>;

/** Decimal places written to the URL, in the unit the URL uses (percentage points or pounds). */
const PERCENT_DECIMALS = 4;
const MONEY_DECIMALS = 2;

const SLUG = /^[\p{Ll}\p{N}]+(?:-[\p{Ll}\p{N}]+)*$/u;
const MAX_SLUG_LENGTH = 100;

type Kind = 'percent' | 'years' | 'money';

function kindOf(field: FieldSpec): Kind {
  if (field.unit === 'percent' || field.unit === 'percentPerYear') return 'percent';
  if (field.unit === 'years') return 'years';
  return 'money';
}

/** Multiply by 10^places in decimal, without float noise (0.043 shifted by 2 is exactly 4.3). */
function shift(value: number, places: number): number {
  const [mantissa = '0', exponent = '0'] = value.toExponential().split('e');
  return Number(`${mantissa}e${Number(exponent) + places}`);
}

/** Round half away from zero at `decimals` places, as the number reads in decimal. */
function roundTo(value: number, decimals: number): number {
  const magnitude = shift(Math.round(shift(Math.abs(value), decimals)), -decimals);
  return magnitude === 0 ? 0 : Math.sign(value) * magnitude;
}

/** "4.3000" -> "4.3", "300000.00" -> "300000". */
function plain(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return decimals > 0 ? text.replace(/\.?0+$/, '') : text;
}

const clamp = (value: number, field: FieldSpec): number =>
  Math.min(field.max, Math.max(field.min, value));

/**
 * The canonical URL text for a value in engine units, or null if it isn't a finite number.
 * Clamped to the field range, then rounded to the URL's precision. Exported in phase 4 so the UI
 * can tell whether an override still differs from its default by the same rule encodeState uses.
 */
export function encodeNumber(value: number, field: FieldSpec): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const clamped = clamp(value, field);
  switch (kindOf(field)) {
    case 'percent':
      return plain(roundTo(shift(clamped, 2), PERCENT_DECIMALS), PERCENT_DECIMALS);
    case 'years':
      return plain(roundTo(clamped, 0), 0);
    case 'money':
      return plain(roundTo(clamped, MONEY_DECIMALS), MONEY_DECIMALS);
  }
}

/** Decimal places of a percent a field shows and keeps when typed: 4.19%, never 4.3333%. */
export const PERCENT_INPUT_DECIMALS = 2;

/**
 * A typed or slid value as the calculator keeps it (phase 4 review): clamped to the field and
 * rounded to what the field can show (2 decimals of a percent, pence, whole years), which is
 * also exact in the URL. So the figures on screen, the model's inputs and a shared link always
 * agree: typing 4.33333 keeps 4.33%, and the link reproduces it exactly.
 */
export function canonicalInput(value: number, field: FieldSpec): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const clamped = clamp(value, field);
  let result: number;
  switch (kindOf(field)) {
    case 'percent':
      result = shift(roundTo(shift(clamped, 2), PERCENT_INPUT_DECIMALS), -2);
      break;
    case 'years':
      result = roundTo(clamped, 0);
      break;
    case 'money':
      result = roundTo(clamped, MONEY_DECIMALS);
      break;
  }
  result = clamp(result, field);
  return result === 0 ? 0 : result;
}

/** URL text (lenient: "300k", "4.3%") -> engine units, canonicalised and clamped, or null. */
function decodeNumber(text: string, field: FieldSpec): number | null {
  const kind = kindOf(field);
  const parsed = kind === 'percent' ? parsePercent(text) : parseMoney(text);
  if (parsed === null) return null;
  const canonical = encodeNumber(parsed, field);
  if (canonical === null) return null;
  const value = kind === 'percent' ? Number(`${canonical}e-2`) : Number(canonical);
  // Rounding a clamped value can't leave the range unless min/max are off the grid; clamp again.
  const result = clamp(value, field);
  return result === 0 ? 0 : result;
}

/**
 * Encode to a search string without the leading "?" ("" when everything is default). Selection
 * values equal to the defaults file's defaults are left out, and so is any override equal to the
 * matching `base` value (the derived default it would reset to) once both are rounded to the
 * URL's precision. Percent-type values are written as percentages ("mr=4.3"), money as plain
 * numbers ("p=300000"). Keys come in a fixed order: selection, then inputs in the order of
 * NUMERIC_INPUT_KEYS. Never throws; overrides that aren't finite numbers are left out.
 */
export function encodeState(state: CalculatorState, base: Inputs, defaults: DefaultsFile): string {
  const params = new URLSearchParams();
  const { selection, overrides } = state;

  if (selection.areaSlug !== null && selection.areaSlug !== '') {
    params.set(SELECTION_PARAMS.areaSlug, selection.areaSlug);
  }
  if (selection.buyerType !== defaults.defaultBuyerType) {
    params.set(SELECTION_PARAMS.buyerType, selection.buyerType);
  }
  if (selection.outlook !== defaults.defaultPreset) {
    params.set(SELECTION_PARAMS.outlook, selection.outlook);
  }
  if (selection.nationOverride !== null) {
    params.set(SELECTION_PARAMS.nationOverride, selection.nationOverride);
  }

  for (const key of NUMERIC_INPUT_KEYS) {
    const value = overrides[key];
    const field = defaults.fields[key];
    if (value === undefined || field === undefined) continue;
    const text = encodeNumber(value, field);
    if (text === null || text === encodeNumber(base[key], field)) continue;
    params.set(INPUT_PARAMS[key], text);
  }

  return params.toString();
}

/** Accept "?a=leeds", "a=leeds", or a whole URL; drop any hash. */
function toParams(search: string | URLSearchParams): URLSearchParams {
  if (search instanceof URLSearchParams) return search;
  if (typeof search !== 'string') return new URLSearchParams();
  const query = search.includes('?') ? search.slice(search.indexOf('?') + 1) : search;
  const hash = query.indexOf('#');
  return new URLSearchParams(hash === -1 ? query : query.slice(0, hash));
}

/**
 * The last value for `key` that `read` accepts, or null. A good value appended to a link wins,
 * and a junk one appended after it doesn't wipe it out.
 */
function lastValid<T>(
  params: URLSearchParams,
  key: string,
  read: (value: string) => T | null,
): T | null {
  const values = params.getAll(key);
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const result = read(values[i] ?? '');
    if (result !== null) return result;
  }
  return null;
}

const oneOf =
  <T extends string>(allowed: readonly T[]) =>
  (value: string): T | null =>
    (allowed as readonly string[]).includes(value) ? (value as T) : null;

function slugReader(knownAreas: ReadonlySet<string> | undefined): (value: string) => string | null {
  return (value) => {
    const slug = value.trim().toLowerCase();
    if (knownAreas !== undefined) return knownAreas.has(slug) ? slug : null;
    return slug.length <= MAX_SLUG_LENGTH && SLUG.test(slug) ? slug : null;
  };
}

/**
 * Decode a search string or params. Never throws: unknown keys, malformed numbers and unknown
 * enum values are ignored; numbers are clamped to defaults.fields[key].min/max; an area slug not
 * in `knownAreas` (when given) becomes null, and without `knownAreas` a slug must at least look
 * like one (lowercase letters and digits joined by single hyphens). When a key appears more than
 * once, the last valid value wins. Numbers accept what people type: "p=300k", "mr=4.3%".
 */
export function decodeState(
  search: string | URLSearchParams,
  defaults: DefaultsFile,
  knownAreas?: ReadonlySet<string>,
): CalculatorState {
  const selection: Selection = {
    areaSlug: null,
    buyerType: defaults.defaultBuyerType,
    outlook: defaults.defaultPreset,
    nationOverride: null,
  };
  const overrides: Overrides = {};

  let params: URLSearchParams;
  try {
    params = toParams(search);
  } catch {
    return { selection, overrides };
  }

  selection.areaSlug = lastValid(params, SELECTION_PARAMS.areaSlug, slugReader(knownAreas));
  selection.buyerType =
    lastValid(params, SELECTION_PARAMS.buyerType, oneOf(BUYER_TYPES)) ?? selection.buyerType;
  selection.outlook =
    lastValid(params, SELECTION_PARAMS.outlook, oneOf(PRESET_NAMES)) ?? selection.outlook;
  selection.nationOverride = lastValid(params, SELECTION_PARAMS.nationOverride, oneOf(NATIONS));

  for (const key of NUMERIC_INPUT_KEYS) {
    const field = defaults.fields[key];
    if (field === undefined) continue;
    const value = lastValid(params, INPUT_PARAMS[key], (text) => decodeNumber(text, field));
    if (value !== null) overrides[key] = value;
  }

  return { selection, overrides };
}
