import { expect, test, type Locator, type Page } from '@playwright/test';
import { formatFieldValue } from '../../src/components/calculator/ui/units';
import { formatMoney } from '../../src/lib/format';
import { NUMERIC_INPUT_KEYS } from '../../src/lib/types';
import { REFERENCE_QUERY, expectStatus, gotoCalculator, input } from './calculator-helpers';
import { defaults, expectedFor } from './oracle';

/**
 * The brief's reference scenario, set by link: the figures on screen are exactly runModel's
 * output for the same inputs (followups teammate). The oracle runs the engine in the test
 * process on the data files the site was built from.
 */

const expected = expectedFor(REFERENCE_QUERY);
const { result, derived } = expected;

/** A table row whose first cell is this year ("10" or "Year 10"). */
function yearRow(table: Locator, page: Page, year: number): Locator {
  return table.locator('tr').filter({
    has: page.locator(':is(th, td):first-child', {
      hasText: new RegExp(`^\\s*(Year\\s+)?${year}\\s*$`),
    }),
  });
}

test('the oracle reproduces the brief (so the data and engine are the ones under test)', () => {
  expect(expected.area?.slug).toBe('leeds');
  expect(result.firstMonth.mortgage).toBeCloseTo(1336.15, 2);
  expect(result.firstMonth.owning).toBeCloseTo(1615.32, 2);
  expect(result.upfront.costs).toBe(4099);
  expect(result.breakEvenYear).toBe(2);
  expect(result.series[10]?.buyWealth).toBeCloseTo(181200, -1);
  expect(result.series[10]?.rentWealth).toBeCloseTo(87864, -1);
  expect(result.sensitivity.filter((r) => r.kind === 'growth').map((r) => r.breakEvenYear)).toEqual(
    [11, 5, 3, 2, 1, 1],
  );
});

test.describe('reference scenario on screen', () => {
  test.beforeEach(async ({ page }) => {
    await gotoCalculator(page, REFERENCE_QUERY);
    await expectStatus(page, 'ready');
  });

  test('every input shows the value the engine used', async ({ page }) => {
    for (const key of NUMERIC_INPUT_KEYS) {
      const field = input(page, key);
      if (key === 'homeReport') {
        // England: the Home Report field is not rendered.
        await expect(field).toHaveCount(0);
        continue;
      }
      await expect(field, key).toHaveValue(
        formatFieldValue(derived.inputs[key], defaults.fields[key]),
      );
    }
  });

  test('the answer is the break-even year runModel gives, in Leeds', async ({ page }) => {
    await expect(page.getByTestId('answer-numeral')).toHaveText(String(result.breakEvenYear));
    await expect(page.getByTestId('answer-headline')).toContainText('Leeds');
  });

  test('the key numbers equal runModel output', async ({ page }) => {
    await expect(page.getByTestId('key-cash')).toContainText(
      formatMoney(result.upfront.cashNeeded),
    );
    const firstMonth = page.getByTestId('key-first-month');
    await expect(firstMonth).toContainText(formatMoney(result.firstMonth.owning));
    await expect(firstMonth).toContainText(formatMoney(result.firstMonth.rent));
    const ten = result.series[10]!;
    await expect(page.getByTestId('key-after')).toContainText(
      formatMoney(ten.buyWealth - ten.rentWealth, { signed: true }),
    );
  });

  test('the breakdown and year-by-year table equal runModel output', async ({ page }) => {
    const upfront = page.getByTestId('breakdown-upfront');
    await expect(upfront).toContainText(formatMoney(result.upfront.legal));
    await expect(upfront).toContainText(formatMoney(result.upfront.survey));
    await expect(upfront).toContainText(formatMoney(result.upfront.moving));
    await expect(upfront).toContainText(formatMoney(result.upfront.productFee));
    await expect(page.getByTestId('breakdown-tax')).toContainText('Stamp duty (SDLT)');

    const selling = page.getByTestId('breakdown-selling');
    await expect(selling).toContainText(formatMoney(result.selling.agentFee));
    await expect(selling).toContainText(formatMoney(result.selling.legal));

    const row = yearRow(page.getByTestId('year-table'), page, 10);
    await expect(row).toHaveCount(1);
    const ten = result.series[10]!;
    for (const value of [
      ten.homeValue,
      ten.mortgageBalance,
      ten.buyWealth,
      ten.rentWealth,
      ten.buyWealth - ten.rentWealth,
    ]) {
      await expect(row).toContainText(formatMoney(Math.abs(value)));
    }
  });

  test('the chart table carries the same yearly figures', async ({ page }) => {
    const row = yearRow(page.getByTestId('chart-table'), page, 10);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(formatMoney(result.series[10]!.buyWealth));
    await expect(row).toContainText(formatMoney(result.series[10]!.rentWealth));
  });

  test('what moves the answer lists the break-even year at each growth rate', async ({ page }) => {
    const table = page.getByTestId('sensitivity');
    for (const row of result.sensitivity.filter((r) => r.kind === 'growth')) {
      const percent = Math.round(row.value * 100);
      const line = table.locator('tr').filter({
        hasText: new RegExp(`(^|[^\\d.])${percent}(\\.0+)?%`),
      });
      await expect(line.first(), `${percent}% growth`).toContainText(
        new RegExp(`(^|\\D)${row.breakEvenYear}(\\D|$)`),
      );
    }
  });
});
