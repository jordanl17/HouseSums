/**
 * The Sell later calculator: price, deposit, rate, term and when you sell, then what comes back
 * at a range of sale prices (table) and how that changes with every year held (chart).
 *
 * Starting figures come from data/ through the page (src/pages/sell-later.astro); the sums are
 * src/lib/sell-later.ts. Field behaviour (typing, clamping on blur, sliders) follows the Rent v
 * buy inputs, using the same primitives.
 */
import { useMemo, useState } from 'preact/hooks';
import { formatMoney, formatPercent } from '../../lib/format';
import { clampToSpec, roundToStep } from '../../lib/inputs';
import { gainSeries, sellLater, type SellLaterInputs } from '../../lib/sell-later';
import { DataTable } from '../calculator/ui/DataTable';
import {
  KeyNumber,
  MoneyField,
  NumberField,
  PercentField,
  ResetButton,
  Slider,
} from '../calculator/ui';
import { formatYearsValue, parseYears } from '../calculator/ui/units';
import { GainChart } from './GainChart';
import type { SellLaterField, SellLaterProps } from './types';

const changeLabel = (change: number) =>
  change === 0 ? 'Same price' : formatPercent(change, { decimals: 0, signed: true });

const years = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`;

export default function SellLater(props: SellLaterProps) {
  const { specs, sources, initial } = props;
  const [inputs, setInputs] = useState<SellLaterInputs>(initial);

  const set = (field: SellLaterField, raw: number) => {
    const spec = specs[field];
    let value = clampToSpec(raw, spec).value;
    if (field === 'deposit') value = Math.min(value, inputs.price);
    setInputs((current) => {
      const next = { ...current, [field]: value };
      // Selling after the term just means the mortgage is gone; keep the slider in range.
      if (field === 'termYears') next.yearsHeld = Math.min(next.yearsHeld, value);
      return next;
    });
  };

  const result = useMemo(() => sellLater(inputs, props.priceChanges), [inputs, props.priceChanges]);
  const series = useMemo(
    () => gainSeries(inputs, props.chartChanges, Math.round(inputs.termYears)),
    [inputs, props.chartChanges],
  );
  const flat = result.scenarios.find((s) => s.change === 0) ?? sellLater(inputs, [0]).scenarios[0]!;
  const held = Math.round(inputs.yearsHeld);

  const reset = (field: SellLaterField) =>
    inputs[field] === initial[field] ? undefined : (
      <ResetButton
        label={specs[field].label}
        testId={`reset-${field}`}
        onReset={() => setInputs((current) => ({ ...current, [field]: initial[field] }))}
      />
    );

  const common = (field: SellLaterField) => ({
    id: `sl-${field}`,
    label: specs[field].label,
    value: inputs[field],
    hint: sources[field],
    action: reset(field),
    onValue: (value: number) => set(field, value),
  });

  const lossOrGain = (gain: number) =>
    gain >= 0 ? `${formatMoney(gain)} more than` : `${formatMoney(-gain)} less than`;

  return (
    <div class="sell-later" data-testid="sell-later">
      <section class="sell-later__inputs card" aria-label="Your figures">
        <MoneyField {...common('price')} />
        <MoneyField
          {...common('deposit')}
          hint={`${formatPercent(inputs.price > 0 ? inputs.deposit / inputs.price : 0, { decimals: 0 })} of the price`}
        />
        <PercentField {...common('mortgageRate')} step={specs.mortgageRate.step} />
        <NumberField
          {...common('termYears')}
          suffix="years"
          inputMode="numeric"
          format={formatYearsValue}
          parse={parseYears}
        />
        <NumberField
          {...common('yearsHeld')}
          suffix="years"
          inputMode="numeric"
          format={formatYearsValue}
          parse={parseYears}
        >
          <Slider
            id="sl-yearsHeld-slider"
            label={specs.yearsHeld.label}
            min={specs.yearsHeld.min}
            max={Math.round(inputs.termYears)}
            step={1}
            value={held}
            valuetext={years(held)}
            onValue={(value) => set('yearsHeld', roundToStep(value, 1))}
          />
        </NumberField>
      </section>

      <section class="sell-later__results card" aria-label="What comes back">
        <p class="sell-later__lead" aria-live="polite" data-testid="sell-later-answer">
          Sell after {years(held)} at the price you paid and you walk away with{' '}
          <strong>{formatMoney(flat.cashBack)}</strong>, {lossOrGain(flat.gain)} you put in.
        </p>
        <p class="sell-later__lead" data-testid="sell-later-break-even">
          To get it all back, the home would need to sell for{' '}
          <strong>{formatPercent(result.breakEvenChange, { decimals: 1 })} more</strong> than you
          paid, about {formatPercent(result.breakEvenGrowth, { decimals: 1, perYear: true })}.
        </p>
        <dl class="key-numbers">
          <KeyNumber label="Put in" value={formatMoney(result.putIn)} unit="deposit and payments" />
          <KeyNumber
            label="Mortgage paid off"
            value={formatMoney(result.principalPaid)}
            unit={`of ${formatMoney(result.loan)}`}
          />
          <KeyNumber label="Interest paid" value={formatMoney(result.interestPaid)} unit="gone" />
          <KeyNumber label="Monthly payment" value={formatMoney(result.payment)} unit="a month" />
        </dl>

        <DataTable
          caption={`Selling after ${years(held)}, by sale price`}
          rowHeader
          scroll="Sale prices table"
          testId="sell-later-table"
          columns={[
            { key: 'change', label: 'Price change' },
            { key: 'sale', label: 'Sale price', numeric: true },
            { key: 'cash', label: 'Cash back', numeric: true },
            { key: 'gain', label: 'Gain or loss', numeric: true },
          ]}
          rows={result.scenarios.map((s) => ({
            change: changeLabel(s.change),
            sale: formatMoney(s.salePrice),
            cash: formatMoney(s.cashBack),
            gain: formatMoney(s.gain, { signed: true }),
          }))}
        />
        <p class="sell-later__note">
          Cash back is the sale price less selling costs (
          {formatPercent(inputs.agentFeeRate, { decimals: 1 })} estate agent fee and{' '}
          {formatMoney(inputs.legalSelling)} legal fees) and the {formatMoney(result.balance)}{' '}
          mortgage left. Gain or loss takes away your deposit and every payment. Buying costs and
          the rent you would have paid anyway are left out.
        </p>
      </section>

      <section class="sell-later__chart card" aria-labelledby="sl-chart-title">
        <h2 id="sl-chart-title">Gain or loss by the year you sell</h2>
        <p class="sell-later__note">
          Each line keeps the sale price the same against what you paid. Paying the mortgage down
          turns cash into equity, so it adds nothing; the interest is what pulls every line down.
          Only a price rising faster than that keeps you ahead.
        </p>
        <GainChart series={series} changes={props.chartChanges} marker={held} label={changeLabel} />
      </section>
    </div>
  );
}
