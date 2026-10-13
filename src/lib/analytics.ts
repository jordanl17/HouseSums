/**
 * Cookieless analytics events (phase 4). STUB written by the phase lead so the calculator can
 * call track() from day one; the followups teammate owns this file and implements it.
 *
 * Contract (do not change the names or the signature):
 * - track(event) takes only an event name. It never takes input values, areas, prices or any
 *   other figure, so nothing the user typed can reach analytics.
 * - It is a no-op unless PUBLIC_GOATCOUNTER_CODE was set at build time.
 * - It never throws and never blocks the UI.
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

/** Record an event. A no-op until the followups teammate implements it. */
export function track(event: AnalyticsEvent): void {
  void event;
}
