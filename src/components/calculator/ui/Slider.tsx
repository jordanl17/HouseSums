/**
 * Preact port of Slider.astro: a native range input with the phase 2 `.slider` styles.
 * aria-label is the field's own label ("Property price"), never "... slider".
 */
export interface SliderProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Human value, e.g. "£245,000". */
  valuetext?: string;
  onValue: (value: number) => void;
  class?: string;
  testId?: string;
}

export function Slider(props: SliderProps) {
  return (
    <input
      class={props.class ? `slider ${props.class}` : 'slider'}
      type="range"
      id={props.id}
      aria-label={props.label}
      min={props.min}
      max={props.max}
      step={props.step}
      value={props.value}
      aria-valuetext={props.valuetext}
      data-testid={props.testId}
      onInput={(event) => {
        const value = Number(event.currentTarget.value);
        if (Number.isFinite(value)) props.onValue(value);
      }}
    />
  );
}
