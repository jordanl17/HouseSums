/**
 * The calculator's deferred chunk (phase 6, perf): the parts that do not need to be live for the
 * page to answer the question. It is loaded with import() as soon as the island's own module
 * runs (deferred.tsx), so it arrives while the island hydrates, but the island chunk does not
 * carry it and the island does not wait for it.
 *
 * Only deferred.tsx may import this module, and only with import(): a static import anywhere in
 * the island would pull it back into the island chunk (scripts/check-budget.mjs would catch that
 * as the island growing over its limit).
 */
export { default as AdvancedPanel } from './AdvancedPanel';
export { default as CardGhost } from './CardGhost';
export { default as Chart } from './Chart';
export { default as More } from './More';
export { default as ShareLink } from './ShareLink';
