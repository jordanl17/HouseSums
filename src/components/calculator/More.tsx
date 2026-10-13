/**
 * The sections under the answer card (phase 6, perf: moved out of Calculator.tsx unchanged so
 * they can load in the deferred chunk, see later.ts): what moves the answer, the breakdown and
 * how this works. One root element, always rendered, as deferred parts must be. While the answer
 * is not there yet the wrapper holds them back (calc-layout__more--waiting, layout.css).
 */
import Breakdown from './Breakdown';
import HowThisWorks from './HowThisWorks';
import Sensitivity from './Sensitivity';
import type { CalcProps } from './types';

export default function More({ calc }: CalcProps) {
  // The same test as the card's `waiting` in Calculator.tsx: no answer yet, or no area.
  const waiting = calc.status !== 'ready' || calc.result === null || calc.area === null;
  return (
    <div class={waiting ? 'calc-layout__more calc-layout__more--waiting' : 'calc-layout__more'}>
      <Sensitivity calc={calc} />
      <Breakdown calc={calc} />
      <HowThisWorks calc={calc} />
    </div>
  );
}
