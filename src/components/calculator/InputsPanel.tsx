/**
 * Simple inputs. STUB by the phase lead showing the intended pattern (FieldInput below).
 * Owner: inputs teammate (sliders on price, rent, rate and growth with sensible ranges, deposit
 * as % of price, mortgage rate labelled with the fix length, clamping notes, the deposit rules,
 * explained terms, Outlook with "Custom").
 *
 * part="primary": Property price only. part="rest": Buyer, Deposit, Monthly rent, Mortgage rate,
 * House price growth, Outlook. Each field is a direct child of .fields__grid; segmented controls
 * get class "fields__wide".
 */
import { PRESET_NAMES, type BuyerType, type NumericInputKey } from '../../lib/types';
import {
  MoneyField,
  PercentField,
  NumberField,
  ResetButton,
  Segmented,
  Tag,
  formatMonth,
  formatYearsValue,
  parseYears,
} from './ui';
import type { CalcApi, InputsPanelProps } from './types';

/** One input of any unit with its tag and Reset link. Exported for AdvancedPanel. */
export function FieldInput({ calc, name }: { calc: CalcApi; name: NumericInputKey }) {
  const model = calc.field(name);
  const { spec, provenance } = model;
  const id = `calc-${name}`;
  const month = formatMonth(provenance.month);
  const info = month ? `${provenance.source}, ${month}` : provenance.source;
  const tag = (
    <Tag
      variant={provenance.kind}
      info={info}
      about={spec.label}
      id={`${id}-source`}
      testId={`tag-${name}`}
    >
      {provenance.kind === 'local' ? 'Local figure' : 'Typical figure'}
    </Tag>
  );
  const action = model.changed ? (
    <ResetButton
      label={spec.label}
      onReset={() => calc.resetInput(name)}
      testId={`reset-${name}`}
    />
  ) : undefined;
  const common = {
    id,
    label: spec.label,
    value: model.value,
    hint: spec.hint,
    tag,
    action,
    onValue: (value: number) => calc.setInput(name, value),
  };
  if (spec.unit === 'percent' || spec.unit === 'percentPerYear') {
    return <PercentField {...common} step={spec.step} perYear={spec.unit === 'percentPerYear'} />;
  }
  if (spec.unit === 'years') {
    return (
      <NumberField
        {...common}
        suffix="years"
        inputMode="numeric"
        format={formatYearsValue}
        parse={parseYears}
      />
    );
  }
  return <MoneyField {...common} unit={spec.unit} />;
}

const BUYERS: { value: BuyerType; label: string }[] = [
  { value: 'first', label: 'First-time' },
  { value: 'moving', label: 'Moving' },
  { value: 'additional', label: 'Additional property' },
];

export default function InputsPanel({ calc, part }: InputsPanelProps) {
  if (part === 'primary') return <FieldInput calc={calc} name="price" />;
  const presets = calc.data.defaults.presets;
  return (
    <>
      <Segmented
        class="fields__wide"
        name="calc-buyer"
        legend="Buyer"
        options={BUYERS}
        value={calc.selection.buyerType}
        onChange={calc.setBuyerType}
        testId="buyer"
      />
      <FieldInput calc={calc} name="deposit" />
      <FieldInput calc={calc} name="rent" />
      <FieldInput calc={calc} name="mortgageRate" />
      <FieldInput calc={calc} name="houseGrowth" />
      <Segmented
        class="fields__wide"
        name="calc-outlook"
        legend="Outlook"
        options={PRESET_NAMES.map((value) => ({ value, label: presets[value].label }))}
        value={calc.outlook}
        onChange={calc.setOutlook}
        status={calc.outlook === 'custom' ? 'Custom' : undefined}
        testId="outlook"
      />
    </>
  );
}
