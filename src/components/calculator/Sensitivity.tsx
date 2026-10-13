/**
 * "What moves the answer". Owner: results teammate.
 *
 * Two compact tables from the model's sensitivity rows: the break-even year at 0-5% house price
 * growth (plus the current growth when it is not one of those), and at the mortgage rate 1 point
 * lower, as entered and 1 point higher. The current setting is marked by weight, a "(now)" text
 * marker and aria-current (DataTable currentRow), never by colour alone.
 *
 * Fires the 'sensitivity-viewed' analytics event once, the first time the tables scroll into
 * view (IntersectionObserver). No values are sent.
 */
import { useEffect, useRef } from 'preact/hooks';
import { track } from '../../lib/analytics';
import { growthTable, rateTable } from '../../lib/copy-details';
import { DataTable } from './ui/DataTable';
import type { CalcProps } from './types';

export default function Sensitivity({ calc }: CalcProps) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(false);
  const ready = calc.status === 'ready' && calc.result !== null;

  useEffect(() => {
    const element = ref.current;
    if (!ready || seen.current || !element || typeof IntersectionObserver !== 'function') {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (seen.current || !entries.some((entry) => entry.isIntersecting)) return;
        seen.current = true;
        observer.disconnect();
        track('sensitivity-viewed');
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);

  const { result, inputs } = calc;
  if (!ready || !result) return null;

  const growth = growthTable(result, inputs);
  const rate = rateTable(result, inputs);
  const answerColumn = { key: 'answer', label: 'Buying pulls ahead after', numeric: true };

  return (
    <section
      class="calc-section sensitivity"
      data-testid="sensitivity"
      aria-labelledby="calc-sensitivity-title"
    >
      <h2 id="calc-sensitivity-title">What moves the answer</h2>
      <p class="calc-section__intro">
        The break-even year with one assumption changed and everything else as it is now.
      </p>
      <div class="sensitivity__tables" ref={ref}>
        <DataTable
          caption="House price growth"
          columns={[{ key: 'setting', label: 'If prices grow' }, answerColumn]}
          rows={growth.rows}
          rowHeader
          currentRow={growth.current}
          testId="sensitivity-growth"
        />
        <DataTable
          caption="Mortgage rate"
          columns={[{ key: 'setting', label: 'If the rate is' }, answerColumn]}
          rows={rate.rows}
          rowHeader
          currentRow={rate.current}
          testId="sensitivity-rate"
        />
      </div>
      <p class="calc-section__small">The rate after the fix moves by the same amount.</p>
    </section>
  );
}
