/**
 * Area picker (owner: inputs teammate): a WAI-ARIA 1.2 combobox with a listbox popup, "list
 * autocomplete with automatic selection".
 *
 * - Typing filters the 361 local authorities by name, ignoring case, diacritics and punctuation
 *   (src/lib/inputs.ts filterAreas), and highlights the best match, so "Leeds" then Enter picks
 *   Leeds. Each option shows the nation as secondary text.
 * - Down and Up open the list and move through it; Alt+Down opens it without moving; Enter picks
 *   the highlighted place; Escape closes the list, and a second Escape puts back the picked
 *   place's name. Leaving the field picks a place typed in full, otherwise restores the name.
 * - Focus stays in the input throughout (aria-activedescendant); a click or tap on an option
 *   picks it without moving focus.
 * - The list is fetched by the island (calc.loadAreas) on focus; while it loads or if it fails,
 *   the popup and the one-line hint say so in plain words, with a "Try again" button, which
 *   moves focus back to the field (it disappears as the list loads).
 * - On an area page, picking another place opens that place's page (Calculator.tsx); until it
 *   does, the field shows the place's name and the hint says "Opening York".
 *
 * Renders one .field (input id "calc-area", data-testid "field-calc-area"). The hint line is
 * always one line, so the field never changes height above the answer card at 360px.
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { areaHint, exactArea, filterAreas, NATION_NAMES } from '../../lib/inputs';
import { Field } from './ui';
import type { CalcProps, ClientArea } from './types';

const LIST_ID = 'calc-area-list';
const optionId = (area: ClientArea) => `calc-area-option-${area.slug}`;

export default function AreaPicker({ calc }: CalcProps) {
  const { areaList } = calc;
  /** What the person has typed since focusing; null shows the picked area's name. */
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLUListElement>(null);
  const field = useRef<HTMLInputElement>(null);

  const ready = areaList.status === 'ready';
  const matches = ready ? filterAreas(areaList.areas, query ?? '') : [];
  const current = open && active >= 0 ? matches[active] : undefined;

  // Keep the highlighted option in view as it moves.
  useEffect(() => {
    if (!current || !list.current) return;
    const node = list.current.querySelector(`#${optionId(current)}`);
    if (node instanceof HTMLElement) node.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const pick = (area: ClientArea) => {
    setQuery(null);
    setOpen(false);
    setActive(-1);
    if (area.slug !== calc.area?.slug) calc.selectArea(area);
  };

  const move = (step: number) => {
    if (!open) setOpen(true);
    if (matches.length === 0) return;
    const start = active < 0 ? (step > 0 ? -1 : matches.length) : active;
    setActive((start + step + matches.length) % matches.length);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (event.altKey) setOpen(true);
        else move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Enter': {
        if (!open) break;
        event.preventDefault();
        const chosen = current ?? (matches.length === 1 ? matches[0] : undefined);
        if (chosen) pick(chosen);
        break;
      }
      case 'Escape':
        if (open) {
          event.preventDefault();
          setOpen(false);
          setActive(-1);
        } else if (query !== null) {
          event.preventDefault();
          setQuery(null);
        }
        break;
      default:
        break;
    }
  };

  let hint = areaHint({
    status: calc.status,
    nation: calc.nation,
    taxRules: calc.data.taxRules,
    problem: calc.problem,
  });
  const failed = areaList.status === 'error';
  if (failed && calc.status !== 'error') hint = "Couldn't load places";
  // An area page opening another area's page (phase 6).
  const leaving = calc.leavingFor ?? null;
  if (leaving) hint = `Opening ${leaving.name}`;

  let message: string | null = null;
  if (failed) message = "Couldn't load the list of places.";
  else if (!ready) message = 'Loading places';
  else if (matches.length === 0)
    message = `No place called ‘${query ?? ''}’. Try the council's name.`;

  const inputAttrs: JSX.InputHTMLAttributes<HTMLInputElement> = {
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': open ? 'true' : 'false',
    'aria-controls': LIST_ID,
    'aria-activedescendant': current ? optionId(current) : undefined,
    autocomplete: 'off',
    autoCapitalize: 'none',
    spellcheck: false,
    placeholder: 'Start typing a place',
    onClick: () => {
      calc.loadAreas();
      setOpen(true);
    },
  };

  return (
    <Field
      id="calc-area"
      label="Area"
      kind="text"
      value={leaving?.name ?? query ?? calc.area?.name ?? ''}
      inputRef={field}
      class="calc-field calc-area"
      bodyClass="calc-field__body"
      hint={
        <>
          {hint}
          {failed && (
            <>
              {' '}
              <button
                type="button"
                class="field__reset"
                onClick={() => {
                  calc.loadAreas();
                  // The button goes once the list loads, so focus waits in the field (phase 6).
                  field.current?.focus();
                }}
              >
                Try again
              </button>
            </>
          )}
        </>
      }
      inputAttrs={inputAttrs}
      onFocus={(event) => {
        calc.loadAreas();
        event.currentTarget.select();
      }}
      onInput={(text) => {
        setQuery(text);
        setOpen(true);
        // Highlight the best match, so Enter picks it.
        setActive(text.trim() === '' ? -1 : 0);
      }}
      onKeyDown={onKeyDown}
      onBlur={() => {
        setOpen(false);
        setActive(-1);
        if (query === null) return;
        const typed = ready ? exactArea(areaList.areas, query) : null;
        if (typed) pick(typed);
        else setQuery(null);
      }}
    >
      <div class="combo__popup" hidden={!open}>
        {message !== null && <p class="combo__message">{message}</p>}
        <ul
          class="combo__list"
          id={LIST_ID}
          role="listbox"
          aria-label="Places"
          ref={list}
          hidden={matches.length === 0}
        >
          {open &&
            matches.map((area, index) => (
              <li
                key={area.slug}
                id={optionId(area)}
                role="option"
                aria-label={`${area.name}, ${NATION_NAMES[area.nation]}`}
                aria-selected={index === active ? 'true' : 'false'}
                class={
                  area.slug === calc.area?.slug
                    ? 'combo__option combo__option--picked'
                    : 'combo__option'
                }
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => {
                  if (index !== active) setActive(index);
                }}
                onClick={() => pick(area)}
              >
                <span class="combo__name">{area.name}</span>
                {/* A word break between the two (invisible in the flex row), so the visible text
                    reads "Leeds England" and sits inside the name "Leeds, England" (WCAG 2.5.3). */}{' '}
                <span class="combo__nation">{NATION_NAMES[area.nation]}</span>
              </li>
            ))}
        </ul>
      </div>
      <p class="visually-hidden" role="status">
        {open ? (message ?? '') : ''}
      </p>
    </Field>
  );
}
