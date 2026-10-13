/**
 * "Adjust every assumption (N)" (owner: inputs teammate). One Disclosure, closed by default,
 * with every input from the brief's table that isn't a simple one, in small labelled groups:
 * the tax rules (nation) override and years to compare, then mortgage, buying, running, renting
 * and investing, and selling costs. The Home Report appears only under Scotland's rules. N is
 * the number of inputs actually shown. Opening it sends the 'advanced-opened' event.
 */
import { track } from '../../lib/analytics';
import {
  ADVANCED_GROUPS,
  advancedCount,
  nationOptionLabel,
  NATION_NAMES,
  shownFor,
} from '../../lib/inputs';
import { NATIONS, type Nation } from '../../lib/types';
import { FieldInput } from './InputsPanel';
import { Disclosure, ResetButton } from './ui';
import type { CalcApi, CalcProps } from './types';

/** The tax rules control: a native select over the four nations, with Reset when overridden. */
function NationField({ calc }: CalcProps) {
  const id = 'calc-nation';
  const overridden = calc.selection.nationOverride !== null;
  const home: Nation = calc.area?.nation ?? calc.data.defaults.defaultNation;
  let hint = `${NATION_NAMES[home]} until you pick a place`;
  if (calc.area) {
    hint = overridden
      ? `${calc.area.name} is in ${NATION_NAMES[home]}`
      : `Follows the area: ${calc.area.name} is in ${NATION_NAMES[home]}`;
  }
  return (
    <div class="field calc-field" data-testid={`field-${id}`}>
      <div class="field__head">
        <label class="field__label" for={id}>
          Tax rules
        </label>
      </div>
      <div class="calc-field__body">
        <div class="field__control calc-select">
          <select
            class="field__input field__input--text calc-select__input"
            id={id}
            name={id}
            aria-describedby={`${id}-hint`}
            value={calc.nation}
            onChange={(event) => {
              const nation = event.currentTarget.value as Nation;
              calc.setNationOverride(nation === home ? null : nation);
            }}
          >
            {NATIONS.map((nation) => (
              <option value={nation} key={nation}>
                {nationOptionLabel(nation, calc.data.taxRules)}
              </option>
            ))}
          </select>
        </div>
        <div class="calc-field__meta">
          {overridden && (
            <ResetButton
              label="Tax rules"
              testId="reset-nation"
              onReset={() => {
                calc.setNationOverride(null);
                requestAnimationFrame(() => document.getElementById(id)?.focus());
              }}
            />
          )}
        </div>
        <p class="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      </div>
    </div>
  );
}

function Group({ calc, index }: { calc: CalcApi; index: number }) {
  const group = ADVANCED_GROUPS[index];
  if (!group) return null;
  const keys = group.keys.filter((key) => shownFor(key, calc.nation));
  return (
    <fieldset class="calc-group">
      <legend class="calc-group__title">{group.title}</legend>
      <div class="fields__grid">
        {group.nation && <NationField calc={calc} />}
        {keys.map((key) => (
          <FieldInput calc={calc} name={key} key={key} />
        ))}
      </div>
    </fieldset>
  );
}

export default function AdvancedPanel({ calc }: CalcProps) {
  return (
    <Disclosure
      class="fields__wide calc-advanced"
      testId="advanced"
      summary={`Adjust every assumption (${advancedCount(calc.nation, calc.data.defaults)})`}
      onToggle={(open) => {
        if (open) track('advanced-opened');
      }}
    >
      <div class="fields calc-advanced__groups">
        {ADVANCED_GROUPS.map((group, index) => (
          <Group calc={calc} index={index} key={group.title} />
        ))}
      </div>
    </Disclosure>
  );
}
