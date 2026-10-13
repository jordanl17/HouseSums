/**
 * Cookieless analytics events (phase 4, followups teammate).
 *
 * Contract (do not change the names or the signature):
 * - track(event) takes only an event name. It never takes input values, areas, prices or any
 *   other figure, so nothing the user typed can reach analytics.
 * - It is a no-op unless PUBLIC_GOATCOUNTER_CODE was set at build time.
 * - It never throws and never blocks the UI.
 *
 * How: GoatCounter's documented count endpoint, https://{code}.goatcounter.com/count, with the
 * event name as the path and `e=true`. One fire-and-forget request (navigator.sendBeacon, or an
 * image request where sendBeacon is missing); no script is loaded, no cookie is set, and nothing
 * else is sent: no referrer, no screen size, no query string, no page URL. The request carries
 * exactly the keys in EVENT_PARAM_KEYS, which the unit test asserts for every event.
 *
 * PUBLIC_GOATCOUNTER_CODE is the site code only (the "housesums" in housesums.goatcounter.com).
 * Anything that is not a plain code (letters, digits and hyphens) is ignored, so a typo can never
 * point the request somewhere else.
 */
export type AnalyticsEvent =
  /** An area was picked in the area picker. */
  | 'area-selected'
  /** The "Adjust every assumption" panel was opened. */
  | 'advanced-opened'
  /** "Copy link to these figures" copied the link. */
  | 'share-copied'
  /** The "What moves the answer" table scrolled into view (once per page view). */
  | 'sensitivity-viewed';

export const ANALYTICS_EVENTS: readonly AnalyticsEvent[] = [
  'area-selected',
  'advanced-opened',
  'share-copied',
  'sensitivity-viewed',
];

/** The title GoatCounter shows for each event. Fixed text: never built from user input. */
export const EVENT_TITLES: Readonly<Record<AnalyticsEvent, string>> = {
  'area-selected': 'Area selected',
  'advanced-opened': 'Advanced panel opened',
  'share-copied': 'Share link copied',
  'sensitivity-viewed': 'Sensitivity row viewed',
};

/** Every query key an event request carries: path, title, the event flag and a cache buster. */
export const EVENT_PARAM_KEYS = ['p', 't', 'e', 'rnd'] as const;

const SITE_CODE = /^[a-z0-9][a-z0-9-]{0,62}$/i;

/** The GoatCounter site code, or null when analytics is off or the value is not a plain code. */
export function siteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim();
  return SITE_CODE.test(code) ? code.toLowerCase() : null;
}

/**
 * The count URL for one event, or null for an unknown event. `rnd` only defeats caches: it is a
 * random string, not an identifier, and changes on every request.
 */
export function eventUrl(code: string, event: AnalyticsEvent, rnd: string): string | null {
  if (!ANALYTICS_EVENTS.includes(event)) return null;
  const params = new URLSearchParams({
    p: event,
    t: EVENT_TITLES[event],
    e: 'true',
    rnd,
  });
  return `https://${code}.goatcounter.com/count?${params.toString()}`;
}

/** Sends one request. Returns nothing and must not throw (callers catch anyway). */
export type Send = (url: string) => void;

/** Fire-and-forget: sendBeacon where there is one, else an image request. */
export const browserSend: Send = (url) => {
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    if (navigator.sendBeacon(url)) return;
  }
  if (typeof Image !== 'undefined') new Image().src = url;
};

/** Pages served from these hosts (local preview, e2e) never send, as GoatCounter's own script. */
const LOCAL_HOSTS = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/;

export interface TrackerOptions {
  /** PUBLIC_GOATCOUNTER_CODE as read at build time. */
  code: unknown;
  send?: Send;
  /** location.hostname, or undefined during the server render. */
  hostname?: string | undefined;
  random?: () => string;
}

/** Builds a track() function. Exported for the unit test; the app uses `track` below. */
export function createTracker(options: TrackerOptions): (event: AnalyticsEvent) => void {
  const code = siteCode(options.code);
  if (code === null) return () => {};
  const send = options.send ?? browserSend;
  const random = options.random ?? (() => Math.random().toString(36).slice(2, 10));
  return (event) => {
    try {
      if (options.hostname === undefined || LOCAL_HOSTS.test(options.hostname)) return;
      const url = eventUrl(code, event, random());
      if (url) send(url);
    } catch {
      // Analytics must never break the calculator.
    }
  };
}

let tracker: ((event: AnalyticsEvent) => void) | null = null;

/**
 * PUBLIC_GOATCOUNTER_CODE as the build saw it. Phase 6 (perf): read once into a constant, so a
 * build without it reduces track() to an empty function and the bundler drops the rest of this
 * module from the island.
 */
const BUILD_CODE: string | undefined = import.meta.env.PUBLIC_GOATCOUNTER_CODE;

/** Record an event. A no-op unless PUBLIC_GOATCOUNTER_CODE was set at build time. */
export function track(event: AnalyticsEvent): void {
  if (!BUILD_CODE) return;
  try {
    tracker ??= createTracker({
      code: BUILD_CODE,
      hostname: typeof location === 'undefined' ? undefined : location.hostname,
    });
    tracker(event);
  } catch {
    // Never throws.
  }
}
