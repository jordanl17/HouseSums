/**
 * Preact port of AnswerNumeral.astro. With `value`, renders lead / giant numeral / unit; without
 * it, the lead alone (for "Renting comes out ahead for all 25 years"). Children are the one
 * explaining sentence(s) in .answer__note.
 */
import type { ComponentChildren } from 'preact';

export interface AnswerNumeralProps {
  lead: ComponentChildren;
  value?: string;
  unit?: ComponentChildren;
  children?: ComponentChildren;
  class?: string;
  testId?: string;
}

export function AnswerNumeral(props: AnswerNumeralProps) {
  return (
    <div class={props.class ? `answer ${props.class}` : 'answer'} data-testid={props.testId}>
      <p class="answer__sentence">
        <span class="answer__lead">{props.lead}</span>
        {props.value !== undefined && (
          <>
            <span class="answer__numeral" data-testid="answer-numeral">
              {props.value}
            </span>
            <span class="answer__unit">{props.unit}</span>
          </>
        )}
      </p>
      {props.children !== undefined && props.children !== null && (
        <div class="answer__note">{props.children}</div>
      )}
    </div>
  );
}
