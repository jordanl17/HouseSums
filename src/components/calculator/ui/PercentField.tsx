/**
 * Percentage input over an engine decimal: shows 0.043 as "4.30" with a "%" (or "% a year")
 * suffix; accepts "4.3", "4.3%", "3% a year" (parsePercent). Decimals follow the field's step.
 */
import { parsePercent } from '../../../lib/format';
import { NumberField, type NumberFieldProps } from './NumberField';
import { formatPercentValue, percentDecimals } from './units';

export interface PercentFieldProps extends Omit<NumberFieldProps, 'format' | 'parse'> {
  /** The field's step in engine units (0.0005 shows two decimals, 0.001 one). */
  step: number;
  /** Adds " a year" to the suffix. Default false. */
  perYear?: boolean;
}

export function PercentField({ step, perYear = false, ...props }: PercentFieldProps) {
  const decimals = percentDecimals(step);
  return (
    <NumberField
      suffix={perYear ? '% a year' : '%'}
      inputMode="decimal"
      {...props}
      format={(value) => formatPercentValue(value, decimals)}
      parse={parsePercent}
    />
  );
}
