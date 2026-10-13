/** Preact port of KeyNumber.astro. Place several inside <dl class="key-numbers">. */
import type { ComponentChildren } from 'preact';

export interface KeyNumberProps {
  label: ComponentChildren;
  /** Pre-formatted figure, e.g. "£38,699" or "+£30,886". */
  value: ComponentChildren;
  unit?: ComponentChildren;
  class?: string;
  testId?: string;
}

export function KeyNumber(props: KeyNumberProps) {
  return (
    <div
      class={props.class ? `key-number ${props.class}` : 'key-number'}
      data-testid={props.testId}
    >
      <dt class="key-number__label">{props.label}</dt>
      <dd class="key-number__value">
        <span class="key-number__figure">{props.value}</span>
        {props.unit !== undefined && props.unit !== null && (
          <span class="key-number__unit">{props.unit}</span>
        )}
      </dd>
    </div>
  );
}
