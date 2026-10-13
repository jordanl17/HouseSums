/**
 * Buy v rent chart. STUB by the phase lead. Owner: results teammate (port of
 * src/components/ui/ExampleChart.astro: hand-rolled SVG, 14% buy fill, rent line, direct
 * labels, dashed hi-vis break-even marker with an ink "Year N" label, £k and year axes,
 * keyboard/touch tooltip, a table alternative). No charting library.
 * Contract: root <figure class="chart" data-testid="chart">; the table alternative has
 * data-testid "chart-table". Keep the plot's height fixed so the card never jumps.
 */
import type { CalcProps } from './types';

export default function Chart({ calc }: CalcProps) {
  if (!calc.result) return null;
  return <figure class="chart" data-testid="chart" />;
}
