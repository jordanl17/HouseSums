/**
 * Area picker. STUB by the phase lead: a native <select> so the island works end to end.
 * Owner: inputs teammate, who replaces it with the WAI-ARIA 1.2 combobox (type to filter with
 * case and diacritics ignored, arrows, Enter, Escape, nation as secondary text, calm copy when
 * the list fails to load).
 *
 * Contract: render one `.field` (input id "calc-area", data-testid "field-calc-area") inside
 * .fields__grid. Call calc.loadAreas() on focus. Pick with calc.selectArea(area).
 */
import type { CalcProps } from './types';

export default function AreaPicker({ calc }: CalcProps) {
  return (
    <div class="field" data-testid="field-calc-area">
      <div class="field__head">
        <label class="field__label" for="calc-area">
          Area
        </label>
      </div>
      <div class="field__control">
        <select
          class="field__input field__input--text"
          id="calc-area"
          value={calc.area?.slug ?? ''}
          onFocus={() => calc.loadAreas()}
          onChange={(event) => {
            const slug = event.currentTarget.value;
            calc.selectArea(calc.areaList.areas.find((area) => area.slug === slug) ?? null);
          }}
        >
          <option value="">{calc.area ? calc.area.name : 'Pick a place'}</option>
          {calc.areaList.areas.map((area) => (
            <option value={area.slug} key={area.slug}>
              {area.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
