/**
 * Contracts for the Rent v buy calculator island (phase 4).
 *
 * Calculator.tsx (lead) owns all state and passes one `calc: CalcApi` prop to every child
 * component. Children never hold calculator state of their own beyond UI-only state (a draft in
 * a field while it has focus, an open tooltip, the hovered chart year), never read or write the
 * URL, and never fetch. They call the actions on CalcApi.
 *
 * Units are the engine's: money in pounds, rates as decimals (4.3% is 0.043), years whole.
 * Format with src/lib/format.ts, never by hand.
 *
 * Ownership: the lead owns this file. Teammates may add optional fields in the section marked for
 * them and must list the change in their handoff; never rename or remove anything.
 */
import type { AreasMeta } from '../../lib/defaults';
import type { ClientArea } from '../../lib/area-list';
import type { CalculatorState } from '../../lib/state';
import type {
  BuyerType,
  DefaultsFile,
  DerivedInputs,
  FieldSpec,
  Inputs,
  ModelResult,
  Nation,
  NumericInputKey,
  OutlookPreset,
  Overrides,
  PresetName,
  Provenance,
  RatesFile,
  Selection,
  TaxRules,
} from '../../lib/types';

export type { ClientArea } from '../../lib/area-list';

// ---------------------------------------------------------------------------------------------
// Island props (the public contract; phase 5's area pages use these too)
// ---------------------------------------------------------------------------------------------

/**
 * Data the island needs before any area is picked. The page imports the JSON, validates it with
 * src/lib/schema.ts at build time and passes it in; it is serialised into the HTML as props, so
 * it never counts as JavaScript and the island never imports JSON.
 */
export interface CalculatorData {
  defaults: DefaultsFile;
  taxRules: TaxRules;
  rates: RatesFile;
  /** areas.json without the area list: the data months and the nation-level figures. */
  areasMeta: AreasMeta;
  /**
   * Phase 5: old area slug -> current slug (data/area-names.json), so a link with `a=` set to a
   * slug from before the rename still opens the right area. Optional; absent means no aliases.
   */
  slugAliases?: Readonly<Record<string, string>>;
}

export interface CalculatorLinks {
  /** URL of the compact area list, url('data/area-list.json'). Fetched from our own origin. */
  areaList: string;
  /** url('how-it-works'). */
  howItWorks: string;
  /**
   * Phase 6: url('rent-vs-buy'), the folder of the per-area pages ("/HouseSums/rent-vs-buy/").
   * On an area page, picking a different area navigates to `${areaPages}${slug}/` (keeping the
   * user's overrides in the query) instead of leaving the old page's heading and summary.
   * Optional so older callers and fixtures still type-check; both pages pass it through
   * calculatorLinks() in src/lib/calculator-data.ts.
   */
  areaPages?: string;
}

export interface CalculatorProps {
  data: CalculatorData;
  links: CalculatorLinks;
  /**
   * Phase 5 area pages: the area the page is about. The island renders the full answer for it
   * at build time (server render) and hydrates to the same markup, with no fetch needed for the
   * answer. The area list is still fetched when someone uses the picker.
   */
  initialArea?: ClientArea | null;
  /**
   * Optional starting selection and overrides (for example a nation page that wants Scotland's
   * tax rules). Applied before the URL. Missing keys use the defaults.
   */
  initialState?: { selection?: Partial<Selection>; overrides?: Overrides };
  /**
   * Read the URL on load and keep it in sync (history.replaceState). Default true. On an area
   * page the `a=` parameter is left out while the picked area is `initialArea`.
   */
  syncUrl?: boolean;
}

// ---------------------------------------------------------------------------------------------
// State handed to children
// ---------------------------------------------------------------------------------------------

/**
 * - empty:   no area picked yet; the answer panel shows "Pick a place. We'll bring the local numbers."
 * - loading: a link named an area and the area list is still on its way.
 * - ready:   an area is picked and `result` is set.
 * - error:   a link named an area but the list could not be loaded, or the area is unknown.
 *            `areaList.status` says which. The answer panel shows plain copy, never a stack trace.
 */
export type CalcStatus = 'empty' | 'loading' | 'ready' | 'error';

export type AreaListStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Why status is 'error': the link named an area that is not in the list ('unknown-area'; the
 * slug has been dropped from the state and the URL), or the list could not be loaded
 * ('list-failed'; calling loadAreas() retries). Null otherwise.
 */
export type AreaProblem = 'unknown-area' | 'list-failed' | null;

export interface AreaListState {
  status: AreaListStatus;
  /** Sorted by name. Empty until status is 'ready'. */
  areas: readonly ClientArea[];
}

/** Everything a field needs. Build one with `calc.field(key)`. */
export interface FieldModel {
  key: NumericInputKey;
  /** From data/defaults.json: label, unit, min, max, step, source, hint. */
  spec: FieldSpec;
  /** The value in use (override or derived default). */
  value: number;
  /** What Reset restores (derived default given the other overrides). */
  base: number;
  /** True when the field has an override that differs from `base` at the URL's precision. */
  changed: boolean;
  /** Where the default comes from: drives the "Local figure" / "Typical figure" tag. */
  provenance: Provenance;
}

/**
 * The single prop every child receives. Recreated on each render of the island, so children can
 * read it directly; do not memoise on its identity.
 */
export interface CalcApi {
  data: CalculatorData;
  links: CalculatorLinks;
  status: CalcStatus;

  // Area list and the picked area
  areaList: AreaListState;
  /** Start fetching the area list if it is not loaded or loading. Idempotent. Call on focus. */
  loadAreas(): void;
  /** The picked area, or null. */
  area: ClientArea | null;
  /** Set when status is 'error'. */
  problem: AreaProblem;

  // State
  selection: Selection;
  overrides: Overrides;
  /** deriveInputs output for the current state. Always set, even before an area is picked. */
  derived: DerivedInputs;
  /** Shortcut for derived.inputs. */
  inputs: Inputs;
  /** The nation whose tax rules apply (override, else the area's, else the default). */
  nation: Nation;
  /** The Outlook control's display value: 'custom' once any of its four inputs is changed. */
  outlook: OutlookPreset;
  /**
   * runModel(inputs, taxRules) with sensitivity, for the current state. Null while status is not
   * 'ready'. Recomputed at most once per animation frame, so for one frame after an input
   * changes it can lag `inputs`; render figures from `result`, never mix the two in one number.
   */
  result: ModelResult | null;

  // Field helpers
  /** Value, base, changed flag, spec and provenance for one input. */
  field(key: NumericInputKey): FieldModel;

  // Actions (all of them update the URL on the next frame)
  /** Pick an area (fires the 'area-selected' analytics event). Null clears it. */
  selectArea(area: ClientArea | null): void;
  setBuyerType(buyerType: BuyerType): void;
  /** Pick a preset: also clears overrides on the four inputs the preset controls. */
  setOutlook(preset: PresetName): void;
  /** Override the tax rules nation. Null, or the area's own nation, removes the override. */
  setNationOverride(nation: Nation | null): void;
  /**
   * Set an input. A non-finite value is ignored. A value equal to the field's base (at the URL's
   * precision) removes the override, so the Reset link disappears. No clamping here: the inputs
   * teammate clamps to spec.min/max and to the price (deposit) and shows the note.
   */
  setInput(key: NumericInputKey, value: number): void;
  /** Remove the override: the field goes back to `base`. */
  resetInput(key: NumericInputKey): void;
  /** Absolute URL that reproduces the current state (for "Copy link to these figures"). */
  shareUrl(): string;
}

/** Props of every child component: `<AnswerCard calc={calc} />`. */
export interface CalcProps {
  calc: CalcApi;
}

/** Props for InputsPanel, which renders in two places in the layout. */
export interface InputsPanelProps extends CalcProps {
  /**
   * 'primary': Property price only (Area is AreaPicker), in .calc-layout__primary, above the answer
   * at 360px. 'rest': Buyer, Deposit, Monthly rent, Mortgage rate, House price growth, Outlook,
   * in .calc-layout__rest, followed by AdvancedPanel.
   */
  part: 'primary' | 'rest';
}

/** Selection plus overrides: the whole state, exactly what the URL holds. */
export type { CalculatorState };

// ---------------------------------------------------------------------------------------------
// Teammate additions (optional fields only, listed in your handoff)
// ---------------------------------------------------------------------------------------------
