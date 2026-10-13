/**
 * Key numbers under the chart. STUB by the phase lead. Owner: results teammate.
 * Contract: one <dl class="key-numbers" data-testid="key-numbers"> with KeyNumber testIds
 * "key-cash", "key-first-month", "key-after". Render nothing (or a same-size placeholder) when
 * calc.result is null.
 */
import { formatMoney } from '../../lib/format';
import { KeyNumber } from './ui';
import type { CalcProps } from './types';

export default function KeyNumbers({ calc }: CalcProps) {
  const { result } = calc;
  if (!result) return null;
  const year = Math.min(10, result.series.length - 1);
  const point = result.series[year];
  return (
    <dl class="key-numbers" data-testid="key-numbers">
      <KeyNumber
        label="Cash needed"
        value={formatMoney(result.upfront.cashNeeded)}
        unit="upfront"
        testId="key-cash"
      />
      <KeyNumber
        label="First month"
        value={`${formatMoney(result.firstMonth.owning)} / ${formatMoney(result.firstMonth.rent)}`}
        unit="own / rent"
        testId="key-first-month"
      />
      <KeyNumber
        label={`After ${year} years`}
        value={point ? formatMoney(point.buyWealth - point.rentWealth, { signed: true }) : ''}
        testId="key-after"
      />
    </dl>
  );
}
