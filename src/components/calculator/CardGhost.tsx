/**
 * The answer card's reserved space while a shared link's area loads (integration, phase 4).
 *
 * A link such as /?a=leeds is server-rendered as the empty state and only knows its area once
 * the list arrives. Without a reservation the card would grow by the height of a chart when the
 * answer lands, pushing everything under it down with no input at all (a real layout shift).
 * So the waiting card also holds this invisible copy of the answer's structure, with the same
 * classes, stacked in the same grid cell as the message (.calc-card--waiting in layout.css),
 * which makes the card exactly as tall as the answer will be.
 *
 * It is only laid out when the page was opened with an area in its link: a tiny inline script in
 * index.astro marks the root element before first paint, and layout.css shows the ghost only
 * then. A plain visit gets a compact empty card instead, and picking an area there is an input,
 * so the card growing then is expected.
 *
 * It holds no figures and no place name: every value is a run of figure spaces (U+2007, as wide
 * as a digit and never collapsed or broken), so the server-rendered HTML says nothing that isn't
 * true. It is aria-hidden and visibility: hidden, so it is never read, focused or seen, and it
 * carries no data-testid.
 */
import { KeyNumber } from './ui';

/** `count` figure spaces: digit-wide blank text. */
const blank = (count: number) => ' '.repeat(count);

export default function CardGhost() {
  return (
    <div class="calc-card__ghost" aria-hidden="true">
      <div class="answer">
        <p class="answer__sentence">
          <span class="answer__lead">{blank(1)}</span>
          <span class="answer__numeral">{blank(1)}</span>
          <span class="answer__unit">{blank(1)}</span>
        </p>
        <div class="answer__note">
          <p>{blank(1)}</p>
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
        {/* Same widths as "£28,869", "£1,456 / £1,145" and "+£116,344", so they wrap alike. */}
        <KeyNumber label="Cash needed" value={blank(7)} unit="upfront" />
        <KeyNumber label="First month" value={`${blank(6)} / ${blank(6)}`} unit="own / rent" />
        <KeyNumber label="After 10 years" value={blank(9)} unit="buying ahead" />
      </dl>
    </div>
  );
}
