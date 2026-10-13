/**
 * "How this works": a short plain-English paragraph on the method and where the figures come
 * from, with a link to /how-it-works/ (calc.links.howItWorks), which phase 5 fills.
 * Owner: results teammate. data-testid: how-this-works.
 */
import { formatMonth } from './ui';
import type { CalcProps } from './types';

export default function HowThisWorks({ calc }: CalcProps) {
  const { areasMeta, rates } = calc.data;
  // The picked area's own months where it has them (Northern Ireland's figures are a month or
  // two older than the file's), so this line agrees with the fields' source tooltips.
  const priceMonth = calc.area?.asOf?.price ?? areasMeta.asOf.price;
  const rentMonth = calc.area?.asOf?.rent ?? areasMeta.asOf.rent;
  return (
    <section class="calc-section" data-testid="how-this-works" aria-labelledby="calc-how-title">
      <h2 id="calc-how-title">How this works</h2>
      <p>
        The calculator follows two households, month by month. One buys with a mortgage and pays the
        running costs. The other rents a similar home and invests the deposit, the upfront costs and
        any monthly difference in a global index fund in an ISA. The break-even year is the first
        year-end when selling up would leave the buyer with more.
      </p>
      <p class="calc-section__small">
        Local prices from the UK House Price Index ({formatMonth(priceMonth)}), rents from the ONS
        Price Index of Private Rents ({formatMonth(rentMonth)}), mortgage rates from the Bank of
        England ({formatMonth(rates.asOf)}). This is a model, not financial advice.{' '}
        <a href={calc.links.howItWorks}>The method, assumptions and formulas</a>
      </p>
    </section>
  );
}
