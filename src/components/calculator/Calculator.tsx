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
import { findClientArea, parseAreaList } from '../../lib/area-list';
import { deriveInputs } from '../../lib/defaults';
import { runModel } from '../../lib/model';
import { decodeState, encodeNumber, encodeState, type CalculatorState } from '../../lib/state';
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
import AdvancedPanel from './AdvancedPanel';
import AnswerCard from './AnswerCard';
import AreaPicker from './AreaPicker';
import Breakdown from './Breakdown';
import CardGhost from './CardGhost';
import Chart from './Chart';
import HowThisWorks from './HowThisWorks';
import InputsPanel from './InputsPanel';
import KeyNumbers from './KeyNumbers';
import Sensitivity from './Sensitivity';
import ShareLink from './ShareLink';
import type {
  AreaListState,
  AreaProblem,
  CalcApi,
  CalcStatus,
  CalculatorProps,
  ClientArea,
  FieldModel,
} from './types';
import '../../styles/calculator.css';

/** The four inputs the Outlook preset sets. Overriding any of them shows "Custom". */
export const OUTLOOK_KEYS: readonly NumericInputKey[] = [
  'houseGrowth',
  'rentGrowth',
  'investmentReturn',
  'rateAfterFix',
];

/** Inputs that come from the area. Picking an area clears their overrides. */
export const AREA_KEYS: readonly NumericInputKey[] = ['price', 'rent', 'houseGrowth', 'rentGrowth'];

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
    return encodeState({ selection, overrides: state.overrides }, derived.base, defaults);
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
    fetch(links.areaList, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((json) => {
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
    setHydrated(true);
    if (syncUrl && window.location.search !== '') {
      const decoded = decodeState(window.location.search, defaults);
      const slug = decoded.selection.areaSlug ?? initialArea?.slug ?? null;
      setState({
        selection: { ...decoded.selection, areaSlug: slug },
        overrides: decoded.overrides,
      });
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
    if (areaList.status === 'ready') {
      const found = findClientArea(areaList.areas, pendingSlug);
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
  }, [pendingSlug, areaList.status]);

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
    selectArea(next) {
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
    setInput(key: NumericInputKey, value: number) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      const spec = defaults.fields[key];
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

  // Until there is an answer the card holds an invisible copy of its structure, so it is
  // already the answer's size (CardGhost.tsx).
  const waiting = status !== 'ready' || calc.result === null || calc.area === null;

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
        <section
          class={waiting ? 'card calc-card calc-card--waiting' : 'card calc-card'}
          aria-labelledby="calc-answer-title"
          data-testid="answer-card"
        >
          <h2 class="visually-hidden" id="calc-answer-title">
            Answer
          </h2>
          <AnswerCard calc={calc} />
          <Chart calc={calc} />
          <KeyNumbers calc={calc} />
          {waiting && <CardGhost />}
        </section>
        <ShareLink calc={calc} />
      </div>

      <div class="calc-layout__rest fields">
        <div class="fields__grid">
          <InputsPanel calc={calc} part="rest" />
          <AdvancedPanel calc={calc} />
        </div>
      </div>

      <div class="calc-layout__more">
        <Sensitivity calc={calc} />
        <Breakdown calc={calc} />
        <HowThisWorks calc={calc} />
      </div>
    </div>
  );
}
