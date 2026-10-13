/**
 * Progressive hydration for the calculator island (phase 6, perf).
 *
 * Two things can be missing when the island starts in the browser: the shared data
 * (island-data.ts) and the deferred chunk (later.ts: the chart, the share row, the advanced
 * panel, the waiting card's reserved space and the sections under the card). Neither is needed to show the answer, which is
 * already in the server-rendered HTML, so the island does not wait for them to arrive before
 * the page is usable; instead the part that needs them waits on its own.
 *
 * The mechanism is Preact's own: a component that throws a promise while it is being hydrated
 * keeps its server-rendered DOM node, and hydration resumes on that node when the nearest error
 * boundary renders it again. Hold is that boundary. While it waits it ignores updates from its
 * parent (shouldComponentUpdate), so the server-rendered DOM stays exactly as it was.
 *
 * When the wait is over:
 * - if nothing changed in the meantime, Hold hydrates the server-rendered DOM in place;
 * - if its parent re-rendered meanwhile (the calculator moved on), hydrating would keep stale
 *   attributes, so Hold renders the part afresh in the same spot (a new key). The markup is the
 *   same either way, and the swap happens in one commit, so nothing visibly moves.
 *
 * Every deferred part renders exactly one root element whenever it is on the page (the
 * calculator renders the chart only when there is an answer), because a paused part keeps
 * exactly one DOM node.
 */
import { Component, type ComponentChildren, type ComponentType } from 'preact';
import type { CalcProps } from './types';

interface Thenable {
  then(onFulfilled: () => void, onRejected?: () => void): unknown;
}

const isThenable = (value: unknown): value is Thenable =>
  typeof value === 'object' && value !== null && typeof (value as Thenable).then === 'function';

interface HoldState {
  /** Bumped when a part resumes after its parent moved on: renders it afresh. */
  generation: number;
}

/**
 * Error boundary that pauses its children while they throw a promise (see the top of the file).
 * Any other error goes on up, as before.
 */
export class Hold extends Component<{ children: ComponentChildren }, HoldState> {
  override state: HoldState = { generation: 0 };
  /** True between catching a promise and its settling. */
  private waiting = false;
  /** True when the parent re-rendered while waiting. */
  private moved = false;

  override componentDidCatch(error: unknown): void {
    if (!isThenable(error)) throw error;
    if (!this.waiting) {
      this.waiting = true;
      this.moved = false;
      const resume = () => {
        this.waiting = false;
        if (this.moved) this.setState(({ generation }) => ({ generation: generation + 1 }));
        else this.forceUpdate();
      };
      error.then(resume, () => {
        // A failed load keeps the server-rendered DOM. The loaders retry on their own.
      });
    }
    // Marks this boundary as having handled the error (Preact checks it is dirty).
    this.setState({});
  }

  override shouldComponentUpdate(nextProps: { children: ComponentChildren }): boolean {
    if (this.waiting) {
      if (nextProps !== this.props) this.moved = true;
      return false;
    }
    return true;
  }

  override render() {
    const { children } = this.props;
    // A fragment keyed by generation: a new generation replaces the part instead of hydrating.
    return <Fresh key={this.state.generation}>{children}</Fresh>;
  }
}

/** A keyable pass-through, so Hold can render its children afresh. */
function Fresh({ children }: { children: ComponentChildren }) {
  return <>{children}</>;
}

// ---------------------------------------------------------------------------------------------
// The deferred chunk
// ---------------------------------------------------------------------------------------------

type LaterModule = typeof import('./later');
type PartName = 'AdvancedPanel' | 'CardGhost' | 'Chart' | 'More' | 'ShareLink';

let later: LaterModule | null = null;
let laterRequest: Promise<LaterModule> | null = null;

/**
 * Starts loading the deferred chunk (once). The island calls this as soon as its own module runs
 * in the browser, so the chunk is on its way while the data loads and the island hydrates.
 */
export function loadLater(): Promise<LaterModule> {
  if (!laterRequest) {
    laterRequest = import('./later').then((module) => {
      later = module;
      return module;
    });
    // A failed load is handled by whoever waits on it (the parts stay static); never unhandled.
    laterRequest.catch(() => {});
  }
  return laterRequest;
}

/** True once the deferred chunk has loaded. */
export function laterLoaded(): boolean {
  return later !== null;
}

function part(name: PartName): ComponentType<CalcProps> {
  function Part(props: CalcProps) {
    if (later) {
      const Loaded = later[name];
      return <Loaded {...props} />;
    }
    throw loadLater();
  }
  Part.displayName = `Deferred(${name})`;
  function Deferred(props: CalcProps) {
    return (
      <Hold>
        <Part {...props} />
      </Hold>
    );
  }
  return Deferred;
}

/** Parts of the island that hydrate when the deferred chunk arrives. */
export const LaterCardGhost = part('CardGhost');
export const LaterChart = part('Chart');
export const LaterShareLink = part('ShareLink');
export const LaterAdvancedPanel = part('AdvancedPanel');
export const LaterMore = part('More');

// The server render loads the chunk straight away, so the first page rendered rarely has to wait.
if (import.meta.env.SSR) void loadLater();
