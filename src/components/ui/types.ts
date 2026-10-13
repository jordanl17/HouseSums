/**
 * Prop contracts for the UI primitives (src/components/ui/*.astro).
 *
 * The Astro components use these as their Props, and phase 4 builds Preact
 * equivalents against the same shapes and the same class names, so the CSS in
 * src/styles/ui/ works for both. Keep markup plain: native elements, BEM-lite
 * classes, no inline styles, no client JS.
 *
 * Values are passed pre-formatted as strings ("245,000", "4.30") so the
 * primitives never do number formatting; phase 3 adds src/lib/format.ts for that.
 */

/** Optional extra class names, appended after the component's own. */
export interface WithClass {
  class?: string;
}

/** `.card`: a plain surface. 26px radius, no border, no shadow. */
export interface CardProps extends WithClass {
  /** Element to render. Default 'div'. */
  as?: 'div' | 'section' | 'article' | 'aside';
  /** id of the heading that names the card, for section/aside landmarks. */
  labelledby?: string;
}

/** `.button`, `.button--primary` (hi-vis with ink text), `.button--secondary` (ink outline). */
export interface ButtonProps extends WithClass {
  /** Default 'primary'. Use primary at most once per view (one hi-vis area per view). */
  variant?: 'primary' | 'secondary';
  /** Renders an <a> instead of a <button> when set. Build it with url(). */
  href?: string;
  /** Button type when rendering a <button>. Default 'button'. */
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

/**
 * `.field`: label above, pill input, optional unit prefix/suffix, hint and error.
 *
 * <div class="field [field--invalid]">
 *   <div class="field__head">
 *     <label class="field__label" for={id}>{label}</label>
 *     <slot name="tag" />                       e.g. <Tag variant="local">
 *   </div>
 *   <div class="field__control">
 *     <span class="field__affix field__affix--prefix">£</span>
 *     <input class="field__input [field__input--text]" id={id} ... />
 *     <span class="field__affix field__affix--suffix">%</span>
 *   </div>
 *   <slot />                                    e.g. a <Slider> under the input
 *   <p class="field__hint" id={`${id}-hint`}>...</p>
 *   <p class="field__error" id={`${id}-error`}>...</p>
 * </div>
 */
export interface FieldProps extends WithClass {
  /** Input id, also used to derive the hint and error ids. */
  id: string;
  /** Visible label, plain and specific: "Monthly rent for a similar home". */
  label: string;
  /** Input name. Defaults to id. */
  name?: string;
  /** Pre-formatted value, e.g. "245,000". */
  value?: string;
  /** Unit before the value, e.g. "£". */
  prefix?: string;
  /** Unit after the value, e.g. "%", "% a year", "years". */
  suffix?: string;
  /** Hint under the input. */
  hint?: string;
  /** Error under the input. Sets aria-invalid and .field--invalid. */
  error?: string;
  /**
   * 'number' (default): right-aligned tabular value, inputmode decimal.
   * 'text': left-aligned, for names such as the area.
   */
  kind?: 'number' | 'text';
  /** Passed to the input. Default 'decimal' for kind 'number'. */
  inputmode?: 'decimal' | 'numeric' | 'text';
  /** Static example inputs on /styleguide/ set this so nothing looks editable that is not. */
  readonly?: boolean;
}

/** `.slider`: styled native range. Ink track, hi-vis thumb with an ink outline. */
export interface SliderProps extends WithClass {
  id: string;
  /** Accessible name (aria-label), e.g. "Property price slider". */
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Human-readable value for screen readers, e.g. "£245,000". Sets aria-valuetext. */
  valuetext?: string;
}

/** One option of a segmented control. */
export interface SegmentedOption {
  value: string;
  label: string;
}

/**
 * `.segmented`: a radio group styled as joined pills.
 *
 * <fieldset class="segmented">
 *   <legend class="segmented__legend">Outlook</legend>
 *   <div class="segmented__options">
 *     <label class="segmented__option">
 *       <input class="segmented__input" type="radio" name value checked />
 *       <span class="segmented__label">Cautious</span>
 *     </label>
 *   </div>
 * </fieldset>
 *
 * The radio is visually hidden but stays focusable; the focus ring is drawn on
 * .segmented__label via `.segmented__input:focus-visible + .segmented__label`.
 */
export interface SegmentedProps extends WithClass {
  /** Radio group name. */
  name: string;
  /** Group label, e.g. "Outlook", "Buyer". */
  legend: string;
  options: SegmentedOption[];
  /** Value of the checked option. */
  value?: string;
}

/** `.tag`, `.tag--local` (hi-vis), `.tag--typical` (tag-alt). Mono, pill, sentence case. */
export interface TagProps extends WithClass {
  /** Default 'typical'. */
  variant?: 'local' | 'typical';
  /** Optional title attribute naming the source and month, e.g. "ONS private rents, Aug 2026". */
  title?: string;
}

/** `.disclosure`: styled <details>/<summary>. Default slot is the body. */
export interface DisclosureProps extends WithClass {
  /** Summary text, e.g. "Adjust every assumption (18)". */
  summary: string;
  /** Open by default. Default false. */
  open?: boolean;
}

/**
 * `.key-number`: mono label, figure and unit. Renders a <div> holding a <dt> and <dd>,
 * so place several inside <dl class="key-numbers">.
 */
export interface KeyNumberProps extends WithClass {
  /** e.g. "Cash needed upfront". */
  label: string;
  /** Pre-formatted figure, e.g. "£38,699" or "+£30,886". */
  value: string;
  /** Optional unit or comparison after the figure, e.g. "a month" or "/ £1,180 rent". */
  unit?: string;
}

/**
 * `.answer`: the sentence with the giant numeral in the buy colour.
 *
 * <div class="answer">
 *   <p class="answer__sentence">
 *     <span class="answer__lead">Buying pulls ahead after</span>
 *     <span class="answer__numeral">6</span>
 *     <span class="answer__unit">years</span>
 *   </p>
 *   <p class="answer__note">(default slot: one explaining sentence, optional)</p>
 * </div>
 */
export interface AnswerNumeralProps extends WithClass {
  /** Text before the numeral: "Buying pulls ahead after". */
  lead: string;
  /** The numeral itself, e.g. "6". */
  value: string;
  /** Text after the numeral: "years". */
  unit: string;
}

/** One column of a data table. */
export interface DataTableColumn {
  key: string;
  label: string;
  /** Right-aligned tabular figures. Default false. */
  numeric?: boolean;
}

/** `.data-table`: thin ink rules, no zebra stripes, right-aligned numbers. */
export interface DataTableProps extends WithClass {
  /** Caption, read by screen readers; shown unless captionHidden. */
  caption: string;
  captionHidden?: boolean;
  columns: DataTableColumn[];
  /** Rows keyed by column key, values pre-formatted. */
  rows: Record<string, string>[];
}
