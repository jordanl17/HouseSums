/**
 * Provenance tag with an accessible toggletip: "Local figure" (hi-vis) or "Typical figure"
 * (tag-alt), same `.tag` classes as phase 2.
 *
 * With `info`, the whole tag is a button. Pressing it (click, tap, Enter or Space) shows the
 * source in a bubble that is also a polite live region, so screen readers hear it; Escape, a
 * second press, moving focus away or tapping elsewhere closes it. Mouse hover also shows it,
 * but nothing depends on hover.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface TagProps {
  variant?: 'local' | 'typical';
  children: ComponentChildren;
  /** Source and month for the toggletip, e.g. "UK House Price Index, Jul 2026". */
  info?: string;
  /** Names the figure for the button's accessible name: "Property price". */
  about?: string;
  /** id of the bubble; required with info so it is unique per field. */
  id?: string;
  testId?: string;
}

export function Tag({ variant = 'typical', children, info, about, id, testId }: TagProps) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const open = pinned || hover;

  useEffect(() => {
    if (!pinned) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setPinned(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [pinned]);

  // Content shown by hover alone must be dismissable without moving the pointer (WCAG 1.4.13):
  // Escape anywhere closes it while it is open by hover.
  useEffect(() => {
    if (!hover || pinned) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHover(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hover, pinned]);

  const className = `tag tag--${variant}`;
  if (info === undefined) {
    return (
      <span class={className} data-testid={testId}>
        {children}
      </span>
    );
  }
  const bubbleId = id ?? undefined;
  return (
    <span
      class="toggletip"
      ref={root}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        ref={button}
        type="button"
        class={`${className} tag--button`}
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={bubbleId}
        data-testid={testId}
        onClick={() => {
          if (pinned) {
            setPinned(false);
            setHover(false);
          } else {
            setPinned(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setPinned(false);
            setHover(false);
          }
        }}
        onBlur={() => setPinned(false)}
      >
        <span class="tag__text">{children}</span>
        <span class="visually-hidden">{about ? `: source for ${about}` : ': source'}</span>
        <span class="tag__icon" aria-hidden="true">
          i
        </span>
      </button>
      <span class="toggletip__bubble" id={bubbleId} role="status" hidden={!open}>
        {open ? info : ''}
      </span>
    </span>
  );
}
