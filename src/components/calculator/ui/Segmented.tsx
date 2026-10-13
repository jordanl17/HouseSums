/**
 * Preact port of Segmented.astro: native radios styled as joined pills (src/styles/ui/segmented.css).
 * Arrow keys move between options natively. When `value` matches no option (the Outlook's
 * "Custom" state), no radio is checked; pass `status` to say so in words. Every radio is
 * described by the status line (id `{name}-status`), so it is read out on entering the group.
 */
import type { ComponentChildren } from 'preact';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string = string> {
  name: string;
  legend: string;
  options: readonly SegmentedOption<T>[];
  value: string;
  onChange: (value: T) => void;
  /** Shown after the options, e.g. "Custom: you've changed one of these assumptions". */
  status?: ComponentChildren;
  class?: string;
  testId?: string;
}

export function Segmented<T extends string>(props: SegmentedProps<T>) {
  const hasStatus = props.status !== undefined && props.status !== null;
  // Each radio points at the status line, so a screen reader entering the group hears it (in
  // the Custom state no radio is checked, and the status is what says so).
  const statusId = `${props.name}-status`;
  return (
    <fieldset
      class={props.class ? `segmented ${props.class}` : 'segmented'}
      data-testid={props.testId}
    >
      <legend class="segmented__legend">{props.legend}</legend>
      <div class="segmented__options">
        {props.options.map((option) => (
          <label class="segmented__option" key={option.value}>
            <input
              class="segmented__input"
              type="radio"
              name={props.name}
              value={option.value}
              checked={option.value === props.value}
              aria-describedby={hasStatus ? statusId : undefined}
              onChange={() => props.onChange(option.value)}
            />
            <span class="segmented__label">{option.label}</span>
          </label>
        ))}
      </div>
      {hasStatus && (
        <p class="segmented__status" id={statusId}>
          {props.status}
        </p>
      )}
    </fieldset>
  );
}
