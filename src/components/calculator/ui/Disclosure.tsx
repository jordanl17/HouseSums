/**
 * Preact port of Disclosure.astro: a styled <details>. Uncontrolled; `onToggle` reports changes.
 *
 * Phase 6 (perf): the body renders the first time the disclosure opens, not before, and then
 * stays rendered (closing it only hides it again, so what was typed or scrolled is kept). The
 * advanced panel (17 fields) and the year-by-year table were about 27 KB of every area page's
 * HTML while closed. Once open, the markup, ids and test hooks are exactly what they were.
 * Opening renders the body before the next paint: the summary's click sets it, `toggle` catches
 * any other way of opening (a script setting `open`), and one opened before hydration is filled
 * when the component mounts.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

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
  const [rendered, setRendered] = useState(props.defaultOpen ?? false);
  const details = useRef<HTMLDetailsElement>(null);
  // Opened before the page's JavaScript took over (a <details> works without it): fill it now.
  useEffect(() => {
    if (details.current?.open) setRendered(true);
  }, []);
  return (
    <details
      ref={details}
      class={props.class ? `disclosure ${props.class}` : 'disclosure'}
      id={props.id}
      open={props.defaultOpen ?? false}
      data-testid={props.testId}
      onToggle={(event) => {
        const open = event.currentTarget.open;
        if (open) setRendered(true);
        props.onToggle?.(open);
      }}
    >
      <summary class="disclosure__summary" onClick={() => setRendered(true)}>
        {props.summary}
      </summary>
      <div class="disclosure__body">{rendered && props.children}</div>
    </details>
  );
}
