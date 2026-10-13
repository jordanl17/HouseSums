/**
 * A Field bound to a number. Shows `format(value)` until focused; while focused it keeps what the
 * person typed, calls onValue on every keystroke that parses (live results), and on blur or
 * Enter goes back to the formatted value (so money gets its commas back). The parent decides
 * clamping: if it clamps, the field shows the clamped value on blur.
 *
 * Typed before hydration (polish): on a slow connection the server-rendered field can be typed
 * in before the island hydrates, and Preact leaves an input's value alone while hydrating. So on
 * mount, a field whose text differs from its server-rendered value (the value attribute) takes
 * that text as if it had just been typed: onValue with what it parses to, then, unless the
 * person is still in the field, onCommit as on blur. Still focused, the text stays as typed.
 */
import { useEffect, useState } from 'preact/hooks';
import { Field, type FieldProps } from './Field';

export interface NumberFieldProps extends Omit<
  FieldProps,
  'value' | 'onInput' | 'onFocus' | 'onBlur' | 'onKeyDown'
> {
  value: number;
  format: (value: number) => string;
  parse: (text: string) => number | null;
  /** Every parsed keystroke. */
  onValue: (value: number) => void;
  /** On blur or Enter, with the last parsed value (null when the text didn't parse). */
  onCommit?: (value: number | null) => void;
}

export function NumberField(props: NumberFieldProps) {
  const { value, format, parse, onValue, onCommit, ...rest } = props;
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (text: string) => {
    const parsed = parse(text);
    onCommit?.(parsed);
    setDraft(null);
  };

  useEffect(() => {
    const input = document.getElementById(rest.id);
    // Only a server-rendered input has a value attribute: one Preact creates later (the advanced
    // panel's fields, rendered on first open) never counts as typed.
    if (!(input instanceof HTMLInputElement) || !input.hasAttribute('value')) return;
    if (input.value === input.defaultValue) return;
    const text = input.value;
    const parsed = parse(text);
    if (parsed !== null && Number.isFinite(parsed)) onValue(parsed);
    if (document.activeElement === input) setDraft(text);
    else commit(text);
  }, []); // Mount only: what was typed before hydration.

  return (
    <Field
      {...rest}
      value={draft ?? format(value)}
      onFocus={() => setDraft(format(value))}
      onInput={(text) => {
        setDraft(text);
        const parsed = parse(text);
        if (parsed !== null && Number.isFinite(parsed)) onValue(parsed);
      }}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit(event.currentTarget.value);
          // Stay in the field, showing the tidied value.
          setDraft(null);
        }
      }}
    />
  );
}
