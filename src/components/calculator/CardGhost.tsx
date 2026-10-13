/**
 * The answer card's reserved space before there is an answer (integration, phase 4).
 *
 * Before an area is picked, while a link's area list loads, and on an error, the card shows one
 * calm sentence. Without this the card would be a single line tall and grow by the height of a
 * chart when the answer arrives, pushing everything under it down: on a phone that is the rest
 * of the inputs, and on a shared link it happens with no input at all (a real layout shift).
 *
 * So the waiting card also holds this invisible copy of the answer's structure, with the same
 * classes and text of typical length (answer, chart frame, key numbers), stacked in the same
 * grid cell as the message (see .calc-card--waiting in layout.css). The card is then exactly as
 * tall as the answer will be. It is aria-hidden and visibility: hidden, so it is never read,
 * focused or seen, and it carries no data-testid.
 */
import { KeyNumber } from './ui';

export default function CardGhost() {
  return (
    <div class="calc-card__ghost" aria-hidden="true">
      <div class="answer">
        <p class="answer__sentence">
          <span class="answer__lead">Buying pulls ahead after </span>
          <span class="answer__numeral">6</span>
          <span class="answer__unit"> years in Leeds</span>
        </p>
        <div class="answer__note">
          <p>If you sold in year 6 or later.</p>
        </div>
      </div>
      <figure class="chart chart--live">
        <figcaption class="chart__caption">
          What you'd walk away with if you sold, in £&nbsp;thousands
        </figcaption>
        <div class="chart__frame">
          <div class="chart__y-axis" />
          <div class="chart__plot" />
          <div class="chart__x-axis" />
        </div>
      </figure>
      <dl class="key-numbers">
        <KeyNumber label="Cash needed" value="£28,869" unit="upfront" />
        <KeyNumber label="First month" value="£1,456 / £1,145" unit="own / rent" />
        <KeyNumber label="After 10 years" value="+£116,344" unit="buying ahead" />
      </dl>
    </div>
  );
}
