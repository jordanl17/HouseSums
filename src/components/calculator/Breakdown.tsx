/**
 * "Breakdown": upfront costs with the property tax named (SDLT, LBTT, LTT), selling costs, and
 * the year-by-year table in a Disclosure (collapsed). STUB by the phase lead. Owner: results.
 * Contract: root <section data-testid="breakdown">; hooks "breakdown-upfront",
 * "breakdown-selling", "breakdown-tax" (the tax row's name cell), "year-table".
 */
import type { CalcProps } from './types';

export default function Breakdown({ calc }: CalcProps) {
  if (!calc.result) return null;
  return (
    <section class="calc-section" data-testid="breakdown" aria-labelledby="calc-breakdown-title">
      <h2 id="calc-breakdown-title">Breakdown</h2>
    </section>
  );
}
