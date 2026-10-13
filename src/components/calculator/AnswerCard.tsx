/**
 * The answer at the top of the card. Owner: results teammate.
 *
 * Every copy case comes from src/lib/copy.ts (unit-tested): break-even after N years (singular
 * in year 1), renting catches up again, no break-even with a "what would flip it" hint found by
 * re-running the model, and no mortgage when the deposit covers the price. Before an answer:
 * the calm empty, loading and error states.
 *
 * Layout stability: every answer state has the same structure (lead, numeral, unit, then a note
 * block with a reserved number of lines, see results.css), so the card does not move or resize
 * when inputs change. When renting stays ahead the numeral is the horizon, in ink, not the buy
 * colour: "Renting comes out ahead for all / 25 / years in Leeds".
 *
 * data-testid hooks: answer, answer-headline, answer-numeral, answer-note, answer-overtake,
 * answer-flip, answer-empty.
 */
import { useMemo } from 'preact/hooks';
import { answerCopy, answerFacts, flipHint, hasNoMortgage, messageText } from '../../lib/copy';
import { runModel } from '../../lib/model';
import type { CalcProps } from './types';

function Message({ calc }: CalcProps) {
  // Not a live region itself: Calculator.tsx's persistent region announces errors and answers.
  const text = messageText(calc.status, calc.problem);
  return (
    <div class="answer answer--message" data-testid="answer">
      <p class="answer__lead" data-testid="answer-empty">
        {text}
      </p>
      {calc.status === 'empty' && (
        <p class="answer__hint">
          Start with the area and the price. Every other figure starts at a typical value you can
          change.
        </p>
      )}
      {calc.status === 'error' && calc.problem === 'list-failed' && (
        <p>
          <button type="button" class="button button--secondary" onClick={() => calc.loadAreas()}>
            Try loading the places again
          </button>
        </p>
      )}
    </div>
  );
}

export default function AnswerCard({ calc }: CalcProps) {
  const { result, area, inputs } = calc;
  const { taxRules } = calc.data;

  // The hint re-runs the model (a few dozen runs without sensitivity, well under a
  // millisecond), only when renting stays ahead, and only when the result changes.
  const flip = useMemo(() => {
    if (!result || result.breakEvenYear !== null) return null;
    return flipHint(
      inputs,
      (changed) => runModel(changed, taxRules, { sensitivity: false }).breakEvenYear,
      hasNoMortgage(result),
      {
        growthMax: calc.data.defaults.areaClamps.houseGrowth.max,
        yearsMax: calc.data.defaults.fields.years.max,
        decimals: {
          houseGrowth: calc.data.defaults.fields.houseGrowth.decimals,
          mortgageRate: calc.data.defaults.fields.mortgageRate.decimals,
        },
      },
    );
    // `inputs` is read at the moment `result` changes, which is the frame it was computed for.
  }, [result, taxRules]);

  if (calc.status !== 'ready' || !result || !area) return <Message calc={calc} />;

  const copy = answerCopy(answerFacts(result, result.series.length - 1, area.name));
  const rentAhead = copy.kind === 'no-break-even';

  return (
    <div
      class={rentAhead ? 'answer answer--rent' : 'answer'}
      data-testid="answer"
      data-kind={copy.kind}
    >
      {/* Spaces inside the spans keep the sentence's text content readable ("after 6 years"). */}
      <p class="answer__sentence" data-testid="answer-headline">
        <span class="answer__lead">{copy.lead} </span>
        <span class="answer__numeral" data-testid="answer-numeral">
          {copy.numeral}
        </span>
        <span class="answer__unit"> {copy.unit}</span>
      </p>
      <div class="answer__note">
        <p data-testid="answer-note">{copy.note}</p>
        {copy.overtake !== null && (
          <p class="answer__extra" data-testid="answer-overtake">
            {copy.overtake}
          </p>
        )}
        {flip !== null && (
          <p class="answer__extra" data-testid="answer-flip">
            {flip.text}
          </p>
        )}
      </div>
    </div>
  );
}
