/**
 * Money input: "£" prefix (and "a month" / "a year" suffix from the unit), commas on blur,
 * accepts "£300k", "300,000", "1.2m" (parseMoney).
 */
import { parseMoney } from '../../../lib/format';
import type { FieldUnit } from '../../../lib/types';
import { NumberField, type NumberFieldProps } from './NumberField';
import { affixesFor, formatMoneyValue } from './units';

export interface MoneyFieldProps extends Omit<NumberFieldProps, 'format' | 'parse'> {
  /** Sets the affixes. Default 'gbp'. Explicit prefix/suffix props win. */
  unit?: Extract<FieldUnit, 'gbp' | 'gbpPerMonth' | 'gbpPerYear'>;
}

export function MoneyField({ unit = 'gbp', ...props }: MoneyFieldProps) {
  const affixes = affixesFor(unit);
  return (
    <NumberField
      prefix={affixes.prefix}
      suffix={affixes.suffix}
      inputMode="decimal"
      {...props}
      format={formatMoneyValue}
      parse={parseMoney}
    />
  );
}
