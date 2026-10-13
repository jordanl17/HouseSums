/**
 * Key numbers under the chart. Owner: results teammate.
 *
 *   Cash needed               deposit + upfront costs        "£34,099 upfront"
 *   First month               owning cost / rent             "£1,615 / £1,250 own / rent"
 *   After 10 years            buy minus rent, signed         "+£93,335 buying ahead"
 *                             (After N years when the horizon is shorter; a true minus when
 *                             renting is ahead)
 *
 * Renders nothing before there is a result (the empty state is the answer's message alone).
 * data-testid hooks: key-numbers, key-cash, key-first-month, key-after.
 */
import { keyNumbersCopy } from '../../lib/copy';
import { KeyNumber } from './ui';
import type { CalcProps } from './types';

export default function KeyNumbers({ calc }: CalcProps) {
  const { result } = calc;
  if (!result || calc.status !== 'ready') return null;
  const copy = keyNumbersCopy(result);
  return (
    <dl class="key-numbers" data-testid="key-numbers">
      <KeyNumber label="Cash needed" value={copy.cash} unit="upfront" testId="key-cash" />
      <KeyNumber
        label="First month"
        value={copy.firstMonth}
        unit="own / rent"
        testId="key-first-month"
      />
      <KeyNumber
        label={copy.afterLabel}
        value={copy.after}
        unit={copy.afterUnit}
        testId="key-after"
      />
    </dl>
  );
}
