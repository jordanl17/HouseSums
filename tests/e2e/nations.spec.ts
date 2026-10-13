import { expect, test } from '@playwright/test';
import { formatFieldValue } from '../../src/components/calculator/ui/units';
import { formatMoney } from '../../src/lib/format';
import { expectStatus, gotoCalculator, input, pickArea } from './calculator-helpers';
import { defaults, expectedFor } from './oracle';

/**
 * Property tax and the Home Report follow the area's nation, and the nation can be overridden
 * (followups teammate). Tax amounts come from the engine run in the test process (oracle.ts).
 */

const TAX_NAMES = {
  eng: 'Stamp duty (SDLT)',
  sco: 'Land and Buildings Transaction Tax (LBTT)',
  wal: 'Land Transaction Tax (LTT)',
} as const;

test('a Scottish area uses LBTT and shows the Home Report', async ({ page }) => {
  await gotoCalculator(page);
  await pickArea(page, 'Glasgow City');
  const { result, derived } = expectedFor('a=glasgow-city');

  await expect(page.getByTestId('breakdown-tax')).toContainText(TAX_NAMES.sco);
  await expect(page.getByTestId('breakdown')).not.toContainText('SDLT');
  await expect(page.getByTestId('breakdown-upfront')).toContainText(formatMoney(result.tax.total));

  // The Home Report: an input in Scotland, and a selling cost the seller pays.
  const homeReport = input(page, 'homeReport');
  await expect(homeReport).toHaveCount(1);
  await expect(homeReport).toHaveValue(
    formatFieldValue(derived.inputs.homeReport, defaults.fields.homeReport),
  );
  expect(result.selling.homeReport).toBeGreaterThan(0);
  const selling = page.getByTestId('breakdown-selling');
  await expect(selling).toContainText('Home Report');
  await expect(selling).toContainText(formatMoney(result.selling.homeReport));

  // Scotland's survey default is £0 (the seller's Home Report covers it).
  await expect(input(page, 'survey')).toHaveValue(
    formatFieldValue(derived.inputs.survey, defaults.fields.survey),
  );
  expect(derived.inputs.survey).toBe(0);
});

test('a Scottish first-time buyer at £300,000 pays the brief case, £4,000 LBTT', async ({
  page,
}) => {
  await gotoCalculator(page, 'a=glasgow-city&p=300000');
  await expectStatus(page, 'ready');
  const { result } = expectedFor('a=glasgow-city&p=300000');
  expect(result.tax.total).toBe(4000);
  await expect(page.getByTestId('breakdown-tax')).toContainText(TAX_NAMES.sco);
  await expect(page.getByTestId('breakdown-upfront')).toContainText('£4,000');
});

test('a Welsh area uses LTT, with no Home Report', async ({ page }) => {
  await gotoCalculator(page, 'a=cardiff&p=300000&b=moving');
  await expectStatus(page, 'ready');
  const { result } = expectedFor('a=cardiff&p=300000&b=moving');
  expect(result.tax.total).toBe(4500); // the brief's case: Wales, £300,000

  await expect(page.getByTestId('breakdown-tax')).toContainText(TAX_NAMES.wal);
  await expect(page.getByTestId('breakdown')).not.toContainText('LBTT');
  await expect(page.getByTestId('breakdown-upfront')).toContainText('£4,500');
  await expect(input(page, 'homeReport')).toHaveCount(0);
  await expect(page.getByTestId('breakdown-selling')).not.toContainText('Home Report');
});

test('an English area uses SDLT, with no Home Report', async ({ page }) => {
  await gotoCalculator(page, 'a=leeds&p=300000&b=moving');
  await expectStatus(page, 'ready');
  await expect(page.getByTestId('breakdown-tax')).toContainText(TAX_NAMES.eng);
  await expect(page.getByTestId('breakdown-upfront')).toContainText('£5,000');
  await expect(input(page, 'homeReport')).toHaveCount(0);
});

test('overriding the nation switches the tax rules', async ({ page }) => {
  // Leeds, with Scotland's tax rules from the link: LBTT applies, as the engine says.
  await gotoCalculator(page, 'a=leeds&p=300000&b=moving&n=sco');
  await expectStatus(page, 'ready');
  const { result, derived } = expectedFor('a=leeds&p=300000&b=moving&n=sco');
  expect(derived.inputs.nation).toBe('sco');
  expect(result.tax.total).toBe(4600); // the brief's case: Scotland, moving, £300,000
  await expect(page.getByTestId('breakdown-tax')).toContainText(TAX_NAMES.sco);
  await expect(page.getByTestId('breakdown-upfront')).toContainText('£4,600');
});
