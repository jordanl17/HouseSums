/**
 * The component pages render for the calculator (phase 6, perf):
 *
 *   <CalculatorIsland client:load links={calculatorLinks()} initialArea={...} />
 *
 * It is Calculator.tsx plus how its shared data arrives (island-data.ts): read at build time on
 * the server, so the HTML carries the whole answer, and fetched from data/calculator.json in the
 * browser, so the defaults, tax rules, rates and nation figures are no longer serialised into
 * every page. Until the file is in, Hold (deferred.tsx) keeps the server-rendered calculator as
 * it is; then the calculator hydrates in place.
 *
 * The deferred chunk (later.ts) starts loading as soon as this module runs, alongside the data.
 */
import Calculator from './Calculator';
import { Hold, loadLater } from './deferred';
import { islandData } from './island-data';
import type { CalculatorIslandProps } from './types';

function WithData(props: CalculatorIslandProps) {
  return <Calculator {...props} data={islandData(props.links.data)} />;
}

export default function CalculatorIsland(props: CalculatorIslandProps) {
  return (
    <Hold>
      <WithData {...props} />
    </Hold>
  );
}

if (!import.meta.env.SSR) void loadLater();
