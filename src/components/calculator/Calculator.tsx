/**
 * The Rent v buy calculator: the single Preact island on the home page (and, in phase 5, on
 * every area page).
 *
 * Owner: phase lead. Children get one `calc: CalcApi` prop (see ./types.ts) and never touch the
 * URL, the network or each other's state.
 *
 * Flow (docs/phases.md, phase 3 handoff):
 *   state = { selection, overrides }            the URL's content, nothing else
 *   derived = deriveInputs({ area, areas: areasMeta, rates, defaults, selection, overrides })
 *   result = runModel(derived.inputs, taxRules) once per animation frame
 *   URL = encodeState(state, derived.base, defaults) via history.replaceState in the same frame
 *
 * Server render and hydration: the first render uses only props (no URL, no window), so the
 * build-time HTML and the first client render match. With `initialArea` (area pages) the first
 * render already has the full answer. After mounting, the island reads the URL; if the URL
 * names an area it fetches the area list, then shows the answer.
 *
 * Recalculation: `derived` is recomputed synchronously on every render (cheap, and the fields
 * must show what was typed). `result` is recomputed in one requestAnimationFrame per frame: a
 * burst of input events (a slider drag) cancels and re-schedules the pending frame, so the
 * model runs at most once per frame. When the area itself changes, the result is computed in
 * the same render so the headline never names one area with another's figures.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { track } from '../../lib/analytics';
import { answerCopy, answerFacts, messageText } from '../../lib/copy';
import { deriveInputs } from '../../lib/defaults';
import { runModel } from '../../lib/model';
import {
  canonicalInput,
  decodeState,
  encodeNumber,
  encodeState,
  type CalculatorState,
} from '../../lib/state';
import type {
  BuyerType,
  ModelResult,
  Nation,
  NumericInputKey,
  OutlookPreset,
  Overrides,
  PresetName,
  Selection,
} from '../../lib/types';
import AnswerCard from './AnswerCard';
import AreaPicker from './AreaPicker';
import {
  LaterAdvancedPanel,
  LaterCardGhost,
  LaterChart,
  LaterMore,
  LaterShareLink,
  loadLater,
} from './deferred';
import InputsPanel from './InputsPanel';
import KeyNumbers from './KeyNumbers';
import type {
  AreaListState,
  AreaProblem,
  CalcApi,
  CalcStatus,
  CalculatorProps,
  ClientArea,
  FieldModel,
} from './types';

/** The four inputs the Outlook preset sets. Overriding any of them shows "Custom". */
export const OUTLOOK_KEYS: readonly NumericInputKey[] = [
  'houseGrowth',
  'rentGrowth',
  'investmentReturn',
  'rateAfterFix',
];

/** Inputs that come from the area. Picking an area clears their overrides. */
export const AREA_KEYS: readonly NumericInputKey[] = ['price', 'rent', 'houseGrowth', 'rentGrowth'];

/** How long the answer must stay the same before the live region announces it, in ms. */
const ANNOUNCE_DELAY = 600;

/**
 * sessionStorage key (phase 6): set to the slug just before an area page sends the visitor to
 * another area's page, so that page puts focus back in the Area field and announces its answer.
 */
const PICKED_KEY = 'house-sums:picked-area';

interface Computed {
  /** Slug the result was computed for, so an area change never shows a stale headline. */
  slug: string;
  result: ModelResult;
}

function initialCalcState(props: CalculatorProps): CalculatorState {
  const { defaults } = props.data;
  return {
    selection: {
      areaSlug: props.initialArea?.slug ?? null,
      buyerType: defaults.defaultBuyerType,
      outlook: defaults.defaultPreset,
      nationOverride: null,
      ...props.initialState?.selection,
    },
    overrides: { ...props.initialState?.overrides },
  };
}

const without = (overrides: Overrides, keys: readonly NumericInputKey[]): Overrides => {
  const next = { ...overrides };
  for (const key of keys) delete next[key];
  return next;
};

/** Run when the browser is idle, or soon after load where requestIdleCallback is missing. */
function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 1500);
  return () => window.clearTimeout(id);
}

export default function Calculator(props: CalculatorProps) {
  const { data, links, initialArea = null, syncUrl = true } = props;
  const { defaults, taxRules, rates, areasMeta } = data;

  const [state, setState] = useState<CalculatorState>(() => initialCalcState(props));
  const [area, setArea] = useState<ClientArea | null>(initialArea);
  const [areaList, setAreaList] = useState<AreaListState>({ status: 'idle', areas: [] });
  const [problem, setProblem] = useState<AreaProblem>(null);
  /** Slug from the URL waiting for the area list. */
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  /** True once the URL has been read, so we never overwrite a shared link before reading it. */
  const [urlRead, setUrlRead] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  /** True once the deferred chunk (deferred.tsx) has loaded or failed: its parts are live. */
  const [laterSettled, setLaterSettled] = useState(false);
  /** 'loading' or 'ready' while a fetch is in flight or done, so loadAreas is idempotent. */
  const listRequest = useRef<'none' | 'loading' | 'ready'>('none');

  const derived = useMemo(
    () =>
      deriveInputs({
        area,
        areas: areasMeta,
        rates,
        defaults,
        selection: state.selection,
        overrides: state.overrides,
      }),
    [area, areasMeta, rates, defaults, state],
  );

  // ---- Result, once per frame ----
  const [computed, setComputed] = useState<Computed | null>(() =>
    initialArea ? { slug: initialArea.slug, result: runModel(derived.inputs, taxRules) } : null,
  );
  let result: ModelResult | null = null;
  if (area) {
    result =
      computed && computed.slug === area.slug
        ? computed.result
        : runModel(derived.inputs, taxRules); // area just changed: no stale frame
  }

  const encoded = useMemo(() => {
    const selection =
      initialArea && state.selection.areaSlug === initialArea.slug
        ? { ...state.selection, areaSlug: null }
        : state.selection;
    // The Home Report only exists under Scotland's rules; a value set there and left behind by
    // a switch to another nation has no control or Reset, so the link leaves it out.
    const overrides =
      derived.inputs.nation === 'sco' ? state.overrides : without(state.overrides, ['homeReport']);
    return encodeState({ selection, overrides }, derived.base, defaults);
  }, [state, derived, defaults, initialArea]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const frame = window.requestAnimationFrame(() => {
      if (area) setComputed({ slug: area.slug, result: runModel(derived.inputs, taxRules) });
      else setComputed(null);
      if (syncUrl && urlRead) {
        const query = encoded === '' ? '' : `?${encoded}`;
        const next = `${window.location.pathname}${query}${window.location.hash}`;
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        // replaceState only: typing never adds history entries, so Back leaves the page.
        if (next !== current) window.history.replaceState(window.history.state, '', next);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [derived, area, encoded, urlRead, syncUrl, taxRules]);

  // ---- Area list ----
  const loadAreas = () => {
    if (listRequest.current !== 'none') return;
    listRequest.current = 'loading';
    setAreaList((list) => ({ ...list, status: 'loading' }));
    // The list's validator loads with the list (phase 6): the island never needs it before.
    Promise.all([
      fetch(links.areaList, { credentials: 'same-origin' }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      }),
      import('../../lib/area-list'),
    ])
      .then(([json, { parseAreaList }]) => {
        const areas = parseAreaList(json);
        listRequest.current = 'ready';
        setAreaList({ status: 'ready', areas });
      })
      .catch(() => {
        // Calling loadAreas again (the picker does on focus) retries.
        listRequest.current = 'none';
        setAreaList({ status: 'error', areas: [] });
      });
  };

  // ---- Mount: read the URL, prefetch the list when idle ----
  useEffect(() => {
    // data-hydrated means every part is live, the deferred ones included, so tests and anything
    // else waiting on it never act on a part that is still static.
    const settle = () => {
      setLaterSettled(true);
      setHydrated(true);
    };
    loadLater().then(settle, settle);
    if (syncUrl && window.location.search !== '') {
      const decoded = decodeState(window.location.search, defaults, undefined, data.slugAliases);
      const slug = decoded.selection.areaSlug ?? initialArea?.slug ?? null;
      // A value typed before hydration (NumberField) is newer than the link, so it stays.
      setState((current) => ({
        selection: { ...decoded.selection, areaSlug: slug },
        overrides: { ...decoded.overrides, ...current.overrides },
      }));
      if (slug !== null && slug !== initialArea?.slug) {
        setArea(null);
        setPendingSlug(slug);
        loadAreas();
      }
    }
    setUrlRead(true);
    return whenIdle(loadAreas);
  }, []); // Mount only.

  // ---- Resolve a slug from the URL once the list arrives ----
  useEffect(() => {
    if (pendingSlug === null) return;
    // Waits for the deferred chunk too, so the chart arrives with the answer and nothing moves.
    if (areaList.status === 'ready' && laterSettled) {
      const found = areaList.areas.find((candidate) => candidate.slug === pendingSlug) ?? null;
      setPendingSlug(null);
      if (found) {
        setArea(found);
        setProblem(null);
        setState((current) => ({
          ...current,
          selection: {
            ...current.selection,
            nationOverride:
              current.selection.nationOverride === found.nation
                ? null
                : current.selection.nationOverride,
          },
        }));
      } else {
        setProblem('unknown-area');
        setState((current) => ({
          ...current,
          selection: { ...current.selection, areaSlug: null },
        }));
      }
    } else if (areaList.status === 'error') {
      setProblem('list-failed');
    }
  }, [pendingSlug, areaList.status, laterSettled]);

  // ---- Area pages: another area means another page (phase 6) ----
  // Each area page's heading, summary and title are static HTML about that area, so the island
  // never shows a different area there: picking one (or an old link's ?a=) goes to its page.
  const areaPage = initialArea !== null && syncUrl && links.areaPages !== undefined;
  /** Area being opened, so the picker shows its name until the page changes. */
  const [leaving, setLeaving] = useState<ClientArea | null>(null);

  /** `${areaPages}${slug}/?...`: the selection and these overrides, encoded against that area. */
  const areaPageHref = (next: ClientArea, overrides: Overrides): string => {
    const nationOverride =
      state.selection.nationOverride === next.nation ? null : state.selection.nationOverride;
    const selection: Selection = { ...state.selection, areaSlug: next.slug, nationOverride };
    const nextDerived = deriveInputs({
      area: next,
      areas: areasMeta,
      rates,
      defaults,
      selection,
      overrides,
    });
    // As in `encoded`: the page names the area, and a Home Report only exists under Scotland's rules.
    const kept =
      nextDerived.inputs.nation === 'sco' ? overrides : without(overrides, ['homeReport']);
    const query = encodeState(
      { selection: { ...selection, areaSlug: null }, overrides: kept },
      nextDerived.base,
      defaults,
    );
    return `${links.areaPages ?? ''}${next.slug}/${query === '' ? '' : `?${query}`}`;
  };

  const leaveFor = (next: ClientArea, overrides: Overrides, how: 'assign' | 'replace') => {
    setLeaving(next);
    try {
      window.sessionStorage.setItem(PICKED_KEY, next.slug);
    } catch {
      // Storage blocked: the next page simply starts at the top.
    }
    const href = areaPageHref(next, overrides);
    if (how === 'replace') window.location.replace(href);
    else window.location.assign(href);
  };

  // An old link such as /rent-vs-buy/leeds/?a=york (before phase 6, picking an area here only
  // rewrote the query): once York resolves, replace the entry with York's own page, keeping every
  // figure the link carries.
  useEffect(() => {
    if (!areaPage || !area || area.slug === initialArea?.slug) return;
    leaveFor(area, state.overrides, 'replace');
  }, [area]);

  // Back to a page kept in the back/forward cache: it is this page's area again.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setLeaving(null);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  // ---- Actions ----
  const setSelection = (patch: Partial<Selection>) =>
    setState((current) => ({ ...current, selection: { ...current.selection, ...patch } }));

  const field = (key: NumericInputKey): FieldModel => {
    const spec = defaults.fields[key];
    const value = derived.inputs[key];
    const base = derived.base[key];
    const override = state.overrides[key];
    const changed =
      override !== undefined && encodeNumber(override, spec) !== encodeNumber(base, spec);
    return { key, spec, value, base, changed, provenance: derived.provenance[key] };
  };

  const outlook: OutlookPreset = OUTLOOK_KEYS.some((key) => field(key).changed)
    ? 'custom'
    : state.selection.outlook;

  let status: CalcStatus = 'empty';
  if (area) status = 'ready';
  else if (pendingSlug !== null) status = areaList.status === 'error' ? 'error' : 'loading';
  else if (problem !== null) status = 'error';

  const calc: CalcApi = {
    data,
    links,
    status,
    areaList,
    loadAreas,
    area,
    problem: status === 'error' ? (problem ?? 'list-failed') : null,
    selection: state.selection,
    overrides: state.overrides,
    derived,
    inputs: derived.inputs,
    nation: derived.inputs.nation,
    outlook,
    result,
    field,
    leavingFor: leaving,
    selectArea(next) {
      // On an area page another area has its own page, heading and summary (phase 6): go there,
      // carrying the person's own figures, instead of showing it under this page's heading.
      if (next && areaPage && next.slug !== initialArea?.slug) {
        track('area-selected');
        leaveFor(next, without(state.overrides, AREA_KEYS), 'assign');
        return;
      }
      setArea(next);
      setProblem(null);
      setPendingSlug(null);
      setState((current) => ({
        selection: {
          ...current.selection,
          areaSlug: next?.slug ?? null,
          nationOverride:
            next && current.selection.nationOverride === next.nation
              ? null
              : current.selection.nationOverride,
        },
        overrides: without(current.overrides, AREA_KEYS),
      }));
      if (next) track('area-selected');
    },
    setBuyerType(buyerType: BuyerType) {
      setSelection({ buyerType });
    },
    setOutlook(preset: PresetName) {
      setState((current) => ({
        selection: { ...current.selection, outlook: preset },
        overrides: without(current.overrides, OUTLOOK_KEYS),
      }));
    },
    setNationOverride(nation: Nation | null) {
      setSelection({ nationOverride: nation !== null && nation === area?.nation ? null : nation });
    },
    setInput(key: NumericInputKey, typed: number) {
      if (typeof typed !== 'number' || !Number.isFinite(typed)) return;
      const spec = defaults.fields[key];
      // Kept at the precision the field shows and the URL carries, so a shared link reproduces
      // exactly what this page computed (canonicalInput in state.ts).
      const value = canonicalInput(typed, spec);
      const same = encodeNumber(value, spec) === encodeNumber(derived.base[key], spec);
      setState((current) => ({
        ...current,
        overrides: same
          ? without(current.overrides, [key])
          : { ...current.overrides, [key]: value },
      }));
    },
    resetInput(key: NumericInputKey) {
      setState((current) => ({ ...current, overrides: without(current.overrides, [key]) }));
    },
    shareUrl() {
      const query = encoded === '' ? '' : `?${encoded}`;
      return `${window.location.origin}${window.location.pathname}${query}`;
    },
  };

  // ---- The answer for screen readers ----
  // One persistent polite region (always rendered, also on the server) carries the headline,
  // e.g. "Buying pulls ahead after 2 years in Leeds", plus "Renting catches up again in year M."
  // when that applies (so a change that only moves that year is heard), or an error message. It is written
  // ANNOUNCE_DELAY after the last change, and only when the text changes, so a slider drag or
  // typing announces once, after it settles, not every step. A change and back again within the
  // delay announces nothing.
  let announcement = '';
  if (status === 'ready' && result && area) {
    const copy = answerCopy(answerFacts(result, result.series.length - 1, area.name));
    announcement = copy.overtake ? `${copy.headline}. ${copy.overtake}` : copy.headline;
  } else if (status === 'error') {
    announcement = messageText(status, calc.problem);
  }
  // The answer the page loaded with is part of the page, not a change, so it is not announced
  // (phase 6: an area page used to read its headline out once hydrated). `spoken` is the last
  // text treated as heard; the region itself starts empty.
  const spoken = useRef(announcement);
  const [announced, setAnnounced] = useState('');

  // Arriving from another area page's picker: focus goes back to the Area field, where it was,
  // and this page's answer is announced once, as a pick on the home page would be.
  useEffect(() => {
    if (!initialArea) return;
    let picked: string | null;
    try {
      picked = window.sessionStorage.getItem(PICKED_KEY);
      window.sessionStorage.removeItem(PICKED_KEY);
    } catch {
      return;
    }
    if (picked !== initialArea.slug) return;
    spoken.current = '';
    document.getElementById('calc-area')?.focus();
  }, []);

  useEffect(() => {
    if (announcement === spoken.current) return undefined;
    const timer = window.setTimeout(() => {
      spoken.current = announcement;
      setAnnounced(announcement);
    }, ANNOUNCE_DELAY);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  // Until there is an answer the card holds an invisible copy of its structure (CardGhost.tsx).
  // It reserves the answer's size only for a link that names an area (layout.css); a plain
  // visit's empty card stays compact.
  const waiting = status !== 'ready' || calc.result === null || calc.area === null;
  let cardClass = 'card calc-card';
  if (waiting) cardClass += ' calc-card--waiting';
  if (status === 'empty') cardClass += ' calc-card--empty';

  return (
    <div
      class="calculator calc-layout"
      data-testid="calculator"
      data-status={status}
      data-hydrated={hydrated ? 'true' : 'false'}
    >
      <div class="calc-layout__primary fields">
        <div class="fields__grid">
          <AreaPicker calc={calc} />
          <InputsPanel calc={calc} part="primary" />
        </div>
      </div>

      <div class="calc-layout__answer">
        <section class={cardClass} aria-labelledby="calc-answer-title" data-testid="answer-card">
          <h2 class="visually-hidden" id="calc-answer-title">
            Answer
          </h2>
          <p class="visually-hidden" role="status" aria-atomic="true" data-testid="answer-live">
            {announced}
          </p>
          <AnswerCard calc={calc} />
          {status === 'ready' && result !== null && <LaterChart calc={calc} />}
          <KeyNumbers calc={calc} />
          {waiting && <LaterCardGhost calc={calc} />}
        </section>
        <LaterShareLink calc={calc} />
      </div>

      <div class="calc-layout__rest fields">
        <div class="fields__grid">
          <InputsPanel calc={calc} part="rest" />
          <LaterAdvancedPanel calc={calc} />
        </div>
      </div>

      <LaterMore calc={calc} />
    </div>
  );
}
