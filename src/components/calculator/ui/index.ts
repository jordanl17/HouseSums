/**
 * The calculator's Preact primitives. Same markup and classes as src/components/ui/*.astro.
 *
 * DataTable is imported from './ui/DataTable' directly (phase 6, perf): only the island's
 * deferred chunk uses it, and listing it here would put it in the island chunk.
 */
export { AnswerNumeral, type AnswerNumeralProps } from './AnswerNumeral';
export { Disclosure, type DisclosureProps } from './Disclosure';
export { Field, ResetButton, type FieldProps } from './Field';
export { KeyNumber, type KeyNumberProps } from './KeyNumber';
export { MoneyField, type MoneyFieldProps } from './MoneyField';
export { NumberField, type NumberFieldProps } from './NumberField';
export { PercentField, type PercentFieldProps } from './PercentField';
export { Segmented, type SegmentedOption, type SegmentedProps } from './Segmented';
export { Slider, type SliderProps } from './Slider';
export { Tag, type TagProps } from './Tag';
export * from './units';
