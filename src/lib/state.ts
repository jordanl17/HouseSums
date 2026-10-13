/**
 * Calculator state <-> URL search params. The state is a Selection (area, buyer type, outlook,
 * nation override) plus Overrides (only the inputs the user changed). Only values that differ
 * from the defaults are written, under short stable keys (documented in docs/decisions.md, "URL
 * state keys"), so links stay short.
 *
 * Owner: format-state teammate. STUB (phase 3 contracts): signatures only.
 *
 * Flow in phase 4:
 *   const { selection, overrides } = decodeState(location.search, defaults, knownSlugs);
 *   const derived = deriveInputs({ area, areas, rates, defaults, selection, overrides });
 *   ...on change: history.replaceState(null, '', '?' + encodeState({ selection, overrides }, derived.base, defaults));
 */
import type { DefaultsFile, Inputs, Overrides, Selection } from './types';

const notImplemented = (name: string): never => {
  throw new Error(`${name} is not implemented yet (phase 3 stub)`);
};

export interface CalculatorState {
  selection: Selection;
  overrides: Overrides;
}

/**
 * Encode to a search string without the leading "?" ("" when everything is default). Selection
 * values equal to the defaults file's defaults are left out, and so is any override equal to the
 * matching `base` value (the derived default it would reset to). Percent-type values are written
 * as percentages ("mr=4.3"), money as plain numbers ("p=300000").
 */
export function encodeState(state: CalculatorState, base: Inputs, defaults: DefaultsFile): string {
  return notImplemented(
    `encodeState(${state.selection.outlook}, ${base.price}, ${defaults.schemaVersion})`,
  );
}

/**
 * Decode a search string or params. Never throws: unknown keys, malformed numbers and unknown
 * enum values are ignored; numbers are clamped to defaults.fields[key].min/max; an area slug not
 * in `knownAreas` (when given) becomes null.
 */
export function decodeState(
  search: string | URLSearchParams,
  defaults: DefaultsFile,
  knownAreas?: ReadonlySet<string>,
): CalculatorState {
  return notImplemented(
    `decodeState(${String(search)}, ${defaults.schemaVersion}, ${String(knownAreas)})`,
  );
}
