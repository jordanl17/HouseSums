/**
 * "How this works": a short plain paragraph and a link to /how-it-works/ (calc.links.howItWorks).
 * STUB by the phase lead. Owner: results teammate.
 * Contract: root <section data-testid="how-this-works">.
 */
import type { CalcProps } from './types';

export default function HowThisWorks({ calc }: CalcProps) {
  return (
    <section class="calc-section" data-testid="how-this-works" aria-labelledby="calc-how-title">
      <h2 id="calc-how-title">How this works</h2>
      <p>
        The calculator compares buying with renting the same home and investing the difference.{' '}
        <a href={calc.links.howItWorks}>Read the method</a>
      </p>
    </section>
  );
}
