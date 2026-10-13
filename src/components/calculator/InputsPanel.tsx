/**
 * Simple inputs (owner: inputs teammate).
 *
 * part="primary": Property price only (Area is AreaPicker), above the answer at 360px.
 * part="rest": Buyer, Deposit, Monthly rent, Mortgage rate, House price growth and Outlook, each a
 * direct child of .fields__grid; the segmented controls get "fields__wide".
 *
 * FieldInput is the one field used for every numeric input, here and in AdvancedPanel:
 * - label, unit, bounds and step from data/defaults.json (via calc.field);
 * - under the pill: the slider (price, rent, rate, growth), then either the provenance tag
 *   ("Local figure" / "Typical figure", or "Floored at 0%" / "Capped at 6%" for a growth figure
 *   the brief's range held; its toggletip names the source and month) or, once the
 *   value is changed, the "Reset" link. One slot, so the field never changes height when a value
 *   is changed, and the tag never claims a figure the person typed;
 * - typed values apply live (clamped to the field's bounds; a deposit to the price) and the calm
 *   note saying so appears when the field is left, so nothing flickers mid-typing.
 */
import { useRef, useState } from 'preact/hooks';
import {
  clampToSpec,
  depositHint,
  depositNote,
  FIELD_HINTS,
  mortgageRateLabel,
  NOT_A_NUMBER_NOTE,
  provenanceInfo,
  provenanceTag,
  rangeNote,
  roundToStep,
  SLIDER_KEYS,
  sliderRange,
  surveyHint,
  yearsHint,
} from '../../lib/inputs';
import { PRESET_NAMES, type BuyerType, type NumericInputKey } from '../../lib/types';
import { OUTLOOK_KEYS } from './Calculator';
import {
  affixesFor,
  describeFieldValue,
  formatFieldValue,
  formatMonth,
  NumberField,
  parseFieldValue,
  ResetButton,
  Segmented,
  Slider,
  Tag,
} from './ui';
import type { CalcApi, InputsPanelProps } from './types';

export interface FieldInputProps {
  calc: CalcApi;
  name: NumericInputKey;
  /** Reserve the note line even when empty (fields above the answer card at 360px). */
  reserve?: boolean;
}

/** The hint under a field, if it has one. */
function hintFor(calc: CalcApi, name: NumericInputKey): string | undefined {
  if (name === 'deposit') return depositHint(calc.inputs.deposit, calc.inputs.price);
  if (name === 'survey') return surveyHint(calc.nation);
  if (name === 'years') return yearsHint(calc.data.defaults.fields.years);
  return FIELD_HINTS[name] ?? calc.data.defaults.fields[name].hint;
}

/** One numeric input of any unit, with its slider, tag or Reset link, hint and note. */
export function FieldInput({ calc, name, reserve = false }: FieldInputProps) {
  const model = calc.field(name);
  const { spec, provenance } = model;
  const id = `calc-${name}`;
  const input = useRef<HTMLInputElement>(null);
  /** Note from the last time the field was left (clamped, or not a number). UI state only. */
  const [note, setNote] = useState<string | null>(null);

  const label =
    name === 'mortgageRate' ? mortgageRateLabel(spec.label, calc.inputs.fixYears) : spec.label;

  /** Clamp to the field's bounds, and a deposit to the price. */
  const settle = (value: number): { value: number; note: string | null } => {
    const clamped = clampToSpec(value, spec);
    if (name === 'deposit' && clamped.value > calc.inputs.price) {
      return { value: calc.inputs.price, note: "Deposit can't be more than the price" };
    }
    return { value: clamped.value, note: clamped.hit ? rangeNote(clamped.hit, spec) : null };
  };

  const apply = (value: number) => {
    calc.setInput(name, settle(value).value);
    if (note !== null) setNote(null);
  };

  const commit = (parsed: number | null) => {
    if (parsed === null) {
      const typed = input.current?.value.trim() ?? '';
      setNote(typed === '' ? null : NOT_A_NUMBER_NOTE);
      return;
    }
    setNote(settle(parsed).note);
  };

  const tag = provenanceTag(provenance);
  const meta = model.changed ? (
    <ResetButton
      label={label}
      testId={`reset-${name}`}
      onReset={() => {
        calc.resetInput(name);
        setNote(null);
        // The Reset link goes away with the change, so keep focus in the field once the reset
        // value has rendered.
        requestAnimationFrame(() => input.current?.focus());
      }}
    />
  ) : (
    <Tag
      variant={tag.variant}
      info={provenanceInfo(provenance, formatMonth(provenance.month), spec)}
      about={label}
      id={`${id}-source`}
      testId={`tag-${name}`}
    >
      {tag.label}
    </Tag>
  );

  let slider = null;
  if (SLIDER_KEYS.includes(name)) {
    const range = sliderRange(name, model.base, spec);
    slider = (
      <Slider
        id={`${id}-slider`}
        label={label}
        min={range.min}
        max={range.max}
        step={range.step}
        value={Math.min(range.max, Math.max(range.min, model.value))}
        valuetext={describeFieldValue(model.value, spec)}
        onValue={(value) => apply(roundToStep(value, range.step))}
      />
    );
  }

  const stateNote = name === 'deposit' ? depositNote(calc.inputs.deposit, calc.inputs.price) : null;
  const { prefix, suffix } = affixesFor(spec.unit);

  return (
    <NumberField
      id={id}
      label={label}
      value={model.value}
      prefix={prefix}
      suffix={suffix}
      inputMode={spec.unit === 'years' ? 'numeric' : 'decimal'}
      hint={hintFor(calc, name)}
      note={note ?? stateNote ?? undefined}
      class={reserve ? 'calc-field calc-field--reserve' : 'calc-field'}
      bodyClass="calc-field__body"
      inputRef={input}
      format={(value) =>
        // A derived default such as 10% of £247,695 reads as whole pounds until it is changed.
        !model.changed && affixesFor(spec.unit).prefix === '£'
          ? formatFieldValue(Math.round(value), spec)
          : formatFieldValue(value, spec)
      }
      parse={(text) => parseFieldValue(text, spec)}
      onValue={apply}
      onCommit={commit}
    >
      {slider}
      <div class="calc-field__meta">{meta}</div>
    </NumberField>
  );
}

const BUYERS: { value: BuyerType; label: string; hint: string }[] = [
  { value: 'first', label: 'First-time', hint: "You've never owned a home, here or abroad" },
  { value: 'moving', label: 'Moving', hint: 'Selling your current home as you buy' },
  {
    value: 'additional',
    label: 'Additional property',
    hint: 'Keeping a home you own, so higher rates of tax apply',
  },
];

/** "Custom: you've changed house price growth and rent increases". */
function customStatus(calc: CalcApi): string {
  const names = OUTLOOK_KEYS.filter((key) => calc.field(key).changed).map((key) => {
    const label = calc.data.defaults.fields[key].label;
    return label.charAt(0).toLowerCase() + label.slice(1);
  });
  const last = names.pop();
  const list = names.length > 0 ? `${names.join(', ')} and ${last}` : last;
  return `Custom: you've changed ${list}`;
}

export default function InputsPanel({ calc, part }: InputsPanelProps) {
  if (part === 'primary') return <FieldInput calc={calc} name="price" reserve />;
  const { presets } = calc.data.defaults;
  const buyer = BUYERS.find((option) => option.value === calc.selection.buyerType);
  return (
    <>
      <Segmented
        class="fields__wide calc-segmented"
        name="calc-buyer"
        legend="Buyer"
        options={BUYERS}
        value={calc.selection.buyerType}
        onChange={calc.setBuyerType}
        status={buyer?.hint}
        testId="buyer"
      />
      <FieldInput calc={calc} name="deposit" />
      <FieldInput calc={calc} name="rent" />
      <FieldInput calc={calc} name="mortgageRate" />
      <FieldInput calc={calc} name="houseGrowth" />
      <Segmented
        class="fields__wide calc-segmented"
        name="calc-outlook"
        legend="Outlook"
        options={PRESET_NAMES.map((value) => ({ value, label: presets[value].label }))}
        value={calc.outlook}
        onChange={calc.setOutlook}
        status={calc.outlook === 'custom' ? customStatus(calc) : presets[calc.outlook].description}
        testId="outlook"
      />
    </>
  );
}
