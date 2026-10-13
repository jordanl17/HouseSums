/**
 * "What moves the answer". STUB by the phase lead. Owner: results teammate (compact DataTable,
 * current setting marked by text and weight, the 'sensitivity-viewed' event once via
 * IntersectionObserver).
 * Contract: root <section data-testid="sensitivity" aria-labelledby=...> with an h2.
 */
import type { CalcProps } from './types';

export default function Sensitivity({ calc }: CalcProps) {
  if (!calc.result) return null;
  return (
    <section
      class="calc-section"
      data-testid="sensitivity"
      aria-labelledby="calc-sensitivity-title"
    >
      <h2 id="calc-sensitivity-title">What moves the answer</h2>
    </section>
  );
}
