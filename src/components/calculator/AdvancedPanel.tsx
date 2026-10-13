/**
 * "Adjust every assumption (N)". STUB by the phase lead. Owner: inputs teammate (every other
 * input from the brief's table, nation / tax rules override, Home Report only in Scotland, flats
 * hint for the service charge, investment return wording, the 'advanced-opened' event).
 *
 * Contract: render one Disclosure with class "fields__wide" and data-testid "advanced", whose
 * summary reads "Adjust every assumption (N)" with N the number of inputs inside it.
 */
import { track } from '../../lib/analytics';
import { NUMERIC_INPUT_KEYS } from '../../lib/types';
import { FieldInput } from './InputsPanel';
import { Disclosure } from './ui';
import type { CalcProps } from './types';

export default function AdvancedPanel({ calc }: CalcProps) {
  const keys = NUMERIC_INPUT_KEYS.filter(
    (key) => calc.data.defaults.fields[key].level === 'advanced',
  );
  return (
    <Disclosure
      class="fields__wide"
      testId="advanced"
      summary={`Adjust every assumption (${keys.length})`}
      onToggle={(open) => {
        if (open) track('advanced-opened');
      }}
    >
      <div class="fields">
        <div class="fields__grid">
          {keys.map((key) => (
            <FieldInput calc={calc} name={key} key={key} />
          ))}
        </div>
      </div>
    </Disclosure>
  );
}
