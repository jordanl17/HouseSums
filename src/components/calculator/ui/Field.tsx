/**
 * Preact port of src/components/ui/Field.astro: label, optional tag and action (Reset) on one
 * line, the pill with unit affixes, then children (a Slider), hint, note and error. Same global
 * classes as phase 2 (src/styles/ui/field.css), so it looks identical.
 *
 * aria-describedby lists, in this order and only when present: the prefix and suffix (so units
 * are announced with the value), the hint, the note, the error, then `describedBy`.
 */
import type { ComponentChildren, JSX, Ref } from 'preact';

export interface FieldProps {
  /** Input id; also gives `${id}-prefix`, `-suffix`, `-hint`, `-note`, `-error`. */
  id: string;
  label: ComponentChildren;
  /** Text shown in the input. */
  value: string;
  prefix?: string | undefined;
  suffix?: string | undefined;
  /** Muted line under the input. */
  hint?: ComponentChildren;
  /** Calm, polite-live line under the input, e.g. "Kept to £10,000,000, the most this takes". */
  note?: ComponentChildren;
  /** Error under the input. Sets aria-invalid and .field--invalid. */
  error?: ComponentChildren;
  /** Tag in the head row, e.g. <Tag variant="local" ...>. */
  tag?: ComponentChildren;
  /** Action in the head row after the tag, e.g. <ResetButton />. */
  action?: ComponentChildren;
  /** Under the pill, before the hint: a <Slider>. */
  children?: ComponentChildren;
  /** 'number' (default): right-aligned mono figures. 'text': left-aligned, for the area name. */
  kind?: 'number' | 'text';
  inputMode?: 'decimal' | 'numeric' | 'text' | 'search';
  class?: string;
  /** data-testid on the .field wrapper. Default `field-${id}`. */
  testId?: string;
  inputRef?: Ref<HTMLInputElement>;
  onInput?: (text: string, event: JSX.TargetedEvent<HTMLInputElement, Event>) => void;
  onFocus?: (event: JSX.TargetedFocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: JSX.TargetedFocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (event: JSX.TargetedKeyboardEvent<HTMLInputElement>) => void;
  /** Extra attributes for the input (role="combobox", aria-expanded, autocomplete...). */
  inputAttrs?: JSX.HTMLAttributes<HTMLInputElement>;
  /** Extra ids appended to aria-describedby. */
  describedBy?: string;
  readOnly?: boolean;
  /**
   * Wrap the pill and everything under it in a div with this class (added by the inputs
   * teammate), so a grid can align the label rows of neighbouring fields with subgrid.
   */
  bodyClass?: string;
}

export function Field(props: FieldProps) {
  const {
    id,
    label,
    value,
    prefix,
    suffix,
    hint,
    note,
    error,
    tag,
    action,
    children,
    kind = 'number',
    inputMode = kind === 'number' ? 'decimal' : 'text',
    testId = `field-${id}`,
  } = props;
  const has = (node: ComponentChildren) => node !== undefined && node !== null && node !== false;
  const ids = [
    prefix ? `${id}-prefix` : '',
    suffix ? `${id}-suffix` : '',
    has(hint) ? `${id}-hint` : '',
    has(note) ? `${id}-note` : '',
    has(error) ? `${id}-error` : '',
    props.describedBy ?? '',
  ].filter(Boolean);
  const invalid = has(error);
  const wrap = (body: ComponentChildren) =>
    props.bodyClass ? <div class={props.bodyClass}>{body}</div> : body;

  return (
    <div
      class={['field', invalid ? 'field--invalid' : '', props.class ?? '']
        .filter(Boolean)
        .join(' ')}
      data-testid={testId}
    >
      <div class="field__head">
        <label class="field__label" for={id}>
          {label}
        </label>
        {(has(tag) || has(action)) && (
          <span class="field__meta">
            {tag}
            {action}
          </span>
        )}
      </div>
      {wrap(
        <>
          <div class="field__control">
            {prefix && (
              <span class="field__affix field__affix--prefix" id={`${id}-prefix`}>
                {prefix}
              </span>
            )}
            <input
              {...props.inputAttrs}
              {...(props.inputRef ? { ref: props.inputRef } : {})}
              class={kind === 'text' ? 'field__input field__input--text' : 'field__input'}
              id={id}
              name={id}
              type="text"
              inputMode={inputMode}
              value={value}
              readOnly={props.readOnly}
              aria-describedby={ids.length > 0 ? ids.join(' ') : undefined}
              aria-invalid={invalid ? 'true' : undefined}
              onInput={(event) => props.onInput?.(event.currentTarget.value, event)}
              onFocus={props.onFocus}
              onBlur={props.onBlur}
              onKeyDown={props.onKeyDown}
            />
            {suffix && (
              <span class="field__affix field__affix--suffix" id={`${id}-suffix`}>
                {suffix}
              </span>
            )}
          </div>
          {children}
          {has(hint) && (
            <p class="field__hint" id={`${id}-hint`}>
              {hint}
            </p>
          )}
          <p
            class="field__hint field__note"
            id={`${id}-note`}
            aria-live="polite"
            hidden={!has(note)}
          >
            {note}
          </p>
          {invalid && (
            <p class="field__error" id={`${id}-error`}>
              {error}
            </p>
          )}
        </>,
      )}
    </div>
  );
}

/**
 * The "Reset" link next to a changed input. A button (it acts on the page), styled as a small
 * underlined link. Its accessible name says which field it resets.
 */
export function ResetButton(props: { label: string; onReset: () => void; testId?: string }) {
  return (
    <button
      type="button"
      class="field__reset"
      aria-label={`Reset ${props.label}`}
      data-testid={props.testId}
      onClick={props.onReset}
    >
      Reset
    </button>
  );
}
