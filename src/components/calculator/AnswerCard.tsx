/**
 * The answer at the top of the card. STUB by the phase lead. Owner: results teammate (every
 * copy case via pure functions in src/lib/copy.ts: break-even, year 1 singular, no break-even
 * with a "what would flip it" hint from re-running the model, renting catches up again,
 * deposit equals price; empty, loading and error states; reserved space so nothing jumps).
 *
 * Contract: render inside the answer card (the lead renders the <section class="card">).
 * data-testid hooks: "answer" (wrapper), "answer-headline" (the sentence), "answer-numeral"
 * (from AnswerNumeral), "answer-note", "answer-overtake", "answer-flip", "answer-empty".
 */
import { AnswerNumeral } from './ui';
import type { CalcProps } from './types';

export default function AnswerCard({ calc }: CalcProps) {
  const { result, area } = calc;
  if (calc.status !== 'ready' || !result || !area) {
    return (
      <div class="answer" data-testid="answer">
        <p class="answer__lead" data-testid="answer-empty">
          {calc.status === 'loading'
            ? 'Bringing the local numbers for this link.'
            : "Pick a place. We'll bring the local numbers."}
        </p>
      </div>
    );
  }
  if (result.breakEvenYear === null) {
    return (
      <AnswerNumeral
        lead={`Renting comes out ahead for all ${calc.inputs.years} years`}
        testId="answer"
      />
    );
  }
  return (
    <AnswerNumeral
      lead="Buying pulls ahead after"
      value={String(result.breakEvenYear)}
      unit={result.breakEvenYear === 1 ? `year in ${area.name}` : `years in ${area.name}`}
      testId="answer"
    />
  );
}
