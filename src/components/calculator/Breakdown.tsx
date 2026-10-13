/**
 * "Breakdown". Owner: results teammate.
 *
 * - Upfront costs, itemised, with the property tax by name ("Stamp duty (SDLT)", "Land and
 *   Buildings Transaction Tax (LBTT)", "Land Transaction Tax (LTT)") and a note on first-time
 *   buyer relief or the additional-property surcharge.
 * - Selling costs at the end of the comparison, itemised (Home Report only in Scotland).
 * - The year-by-year table in a Disclosure, collapsed by default, in a region that scrolls
 *   sideways at 360px so the page never does.
 *
 * Labels come from data/defaults.json. data-testid hooks: breakdown, breakdown-upfront,
 * breakdown-selling, breakdown-tax (the tax row's name cell), year-table.
 */
import { years } from '../../lib/copy';
import { taxName, taxNote } from '../../lib/copy-details';
import { formatMoney, formatPercent } from '../../lib/format';
import { Disclosure } from './ui';
import { DataTable } from './ui/DataTable';
import type { CalcProps } from './types';

const ITEM_COLUMNS = [
  { key: 'item', label: 'Item' },
  { key: 'amount', label: 'Amount', numeric: true },
];

export default function Breakdown({ calc }: CalcProps) {
  const { result, inputs } = calc;
  if (!result || calc.status !== 'ready') return null;

  const { fields } = calc.data.defaults;
  const { upfront, selling, tax } = result;
  const regime = calc.data.taxRules.regimes[tax.regime];
  const note = taxNote(tax, regime, inputs.buyerType, inputs.price);
  const noLoan = (result.series[0]?.mortgageBalance ?? 0) <= 0;
  const horizon = result.series.length - 1;

  const upfrontRows = [
    { item: fields.deposit.label, amount: formatMoney(upfront.deposit) },
    {
      item: (
        <span data-testid="breakdown-tax">
          {taxName(regime)}
          {note !== null && <span class="breakdown__note">{note}</span>}
        </span>
      ),
      amount: formatMoney(upfront.tax),
    },
    { item: fields.legalBuying.label, amount: formatMoney(upfront.legal) },
    { item: fields.survey.label, amount: formatMoney(upfront.survey) },
    { item: fields.moving.label, amount: formatMoney(upfront.moving) },
    {
      item: (
        <>
          {fields.productFee.label}
          <span class="breakdown__note">
            {noLoan ? 'None: there is no mortgage' : "The lender's arrangement fee"}
          </span>
        </>
      ),
      amount: formatMoney(upfront.productFee),
    },
    { item: 'Costs on top of the deposit', amount: <strong>{formatMoney(upfront.costs)}</strong> },
    {
      item: <strong>Cash needed upfront</strong>,
      amount: <strong>{formatMoney(upfront.cashNeeded)}</strong>,
    },
  ];

  const sellingRows = [
    {
      item: (
        <>
          {fields.agentFeeRate.label}
          <span class="breakdown__note">
            {formatPercent(inputs.agentFeeRate)} of {formatMoney(selling.value)}, the home's value
            then
          </span>
        </>
      ),
      amount: formatMoney(selling.agentFee),
    },
    { item: fields.legalSelling.label, amount: formatMoney(selling.legal) },
    ...(calc.nation === 'sco'
      ? [{ item: fields.homeReport.label, amount: formatMoney(selling.homeReport) }]
      : []),
    { item: <strong>Selling costs</strong>, amount: <strong>{formatMoney(selling.total)}</strong> },
  ];

  const yearRows = result.series.map((point) => ({
    year: point.year === 0 ? 'Now' : String(point.year),
    value: formatMoney(point.homeValue),
    balance: formatMoney(point.mortgageBalance),
    buy: formatMoney(point.buyWealth),
    rent: formatMoney(point.rentWealth),
    difference: formatMoney(point.buyWealth - point.rentWealth, { signed: true }),
  }));

  return (
    <section
      class="calc-section breakdown"
      data-testid="breakdown"
      aria-labelledby="calc-breakdown-title"
    >
      <h2 id="calc-breakdown-title">Breakdown</h2>
      <div class="breakdown__tables">
        <DataTable
          caption="Upfront costs"
          columns={ITEM_COLUMNS}
          rows={upfrontRows}
          rowHeader
          class="breakdown__table"
          testId="breakdown-upfront"
        />
        <DataTable
          caption={`Selling costs after ${years(selling.year)}`}
          columns={ITEM_COLUMNS}
          rows={sellingRows}
          rowHeader
          class="breakdown__table"
          testId="breakdown-selling"
        />
      </div>
      <Disclosure summary={`Year-by-year figures (${years(horizon)})`} testId="year-table">
        <p class="calc-section__small">
          Figures at each year-end. If you buy: what you'd walk away with after selling costs and
          paying off the mortgage, plus any savings. If you rent: the deposit and upfront costs
          invested, plus any monthly difference.
        </p>
        <DataTable
          caption="Year by year"
          captionHidden
          columns={[
            { key: 'year', label: 'Year' },
            { key: 'value', label: 'Home value', numeric: true },
            { key: 'balance', label: 'Mortgage balance', numeric: true },
            { key: 'buy', label: 'If you buy', numeric: true },
            { key: 'rent', label: 'If you rent', numeric: true },
            { key: 'difference', label: 'Difference', numeric: true },
          ]}
          rows={yearRows}
          rowHeader
          scroll="Year-by-year figures"
        />
      </Disclosure>
    </section>
  );
}
