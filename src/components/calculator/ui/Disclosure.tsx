/** Preact port of Disclosure.astro: a styled <details>. Uncontrolled; `onToggle` reports changes. */
import type { ComponentChildren } from 'preact';

export interface DisclosureProps {
  summary: ComponentChildren;
  /** Initial state only. Default false. */
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: ComponentChildren;
  class?: string;
  id?: string;
  testId?: string;
}

export function Disclosure(props: DisclosureProps) {
  return (
    <details
      class={props.class ? `disclosure ${props.class}` : 'disclosure'}
      id={props.id}
      open={props.defaultOpen ?? false}
      data-testid={props.testId}
      onToggle={(event) => props.onToggle?.(event.currentTarget.open)}
    >
      <summary class="disclosure__summary">{props.summary}</summary>
      <div class="disclosure__body">{props.children}</div>
    </details>
  );
}
