import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Shared accessibility-scan helpers (phase 6). Owner: phase lead; the a11y-ux teammate may add
 * helpers at the end of this file (additive only) and owns tests/e2e/a11y.spec.ts, which uses
 * them. Paths stay relative to baseURL, so the scans also run against the live site.
 *
 * The bar (phase 6 acceptance criteria): no `serious` or `critical` axe violations on any page
 * type, in light and dark, at 360 and 1280 (the two Playwright projects). `moderate` and `minor`
 * results are reported in the test's attachments but do not fail it.
 */

/** WCAG 2.0, 2.1 and 2.2 A and AA rules, which is what the brief's "WCAG 2.2 AA" asks for. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

/** Impacts that fail a scan. */
export const FAILING_IMPACTS: readonly string[] = ['serious', 'critical'];

export type Theme = 'light' | 'dark';
export const THEMES: readonly Theme[] = ['light', 'dark'];

/**
 * Every page type the scans cover, with a path relative to baseURL. `query` pages are the home
 * page with an area picked through a link (the island then fetches the area list and renders
 * the answer); wait for `ready` before scanning those (see `waitForCalculator`).
 */
export const A11Y_PAGES: readonly { name: string; path: string; calculator?: boolean }[] = [
  { name: 'home, empty', path: './', calculator: true },
  { name: 'home, with an area', path: './?a=leeds', calculator: true },
  { name: 'area page', path: 'rent-vs-buy/leeds/', calculator: true },
  { name: 'nation page', path: 'rent-vs-buy/scotland/' },
  { name: 'rent v buy index', path: 'rent-vs-buy/' },
  { name: 'how it works', path: 'how-it-works/' },
  { name: 'sources', path: 'sources/' },
  { name: 'about', path: 'about/' },
  { name: '404', path: 'this-page-does-not-exist/' },
];

export interface AxeViolationSummary {
  id: string;
  impact: string | null | undefined;
  help: string;
  helpUrl: string;
  targets: string[];
}

/**
 * Wait for the calculator to hydrate and settle: `data-hydrated="true"` and a status other than
 * `loading`. Call before scanning a page with the island so the scan sees the live markup.
 */
export async function waitForCalculator(page: Page): Promise<void> {
  const calculator = page.getByTestId('calculator');
  await expect(calculator).toHaveAttribute('data-hydrated', 'true');
  await expect(calculator).not.toHaveAttribute('data-status', 'loading');
}

/**
 * Run axe on the page (or on `include` only) and return the violations, without asserting.
 * Every result is attached to the test as JSON, so moderate and minor findings are visible in
 * the HTML report.
 */
export async function axeViolations(
  page: Page,
  options: { include?: string; exclude?: string[]; label?: string } = {},
): Promise<AxeViolationSummary[]> {
  // label-content-name-mismatch (WCAG 2.5.3, Label in Name) is marked experimental in axe and
  // off by default; turned on here because Lighthouse reported it on the source tags (phase 6
  // integration).
  let builder = new AxeBuilder({ page })
    .withTags([...AXE_TAGS])
    .options({ rules: { 'label-content-name-mismatch': { enabled: true } } });
  if (options.include) builder = builder.include(options.include);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  const results = await builder.analyze();
  const violations = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));
  await test.info().attach(`axe ${options.label ?? page.url()}`, {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  });
  return violations;
}

/** Assert no serious or critical violations, listing any that are found by rule and element. */
export async function expectNoSeriousViolations(
  page: Page,
  options: { include?: string; exclude?: string[]; label?: string } = {},
): Promise<void> {
  const violations = await axeViolations(page, options);
  const failing = violations.filter((v) => FAILING_IMPACTS.includes(v.impact ?? ''));
  const message = failing
    .map((v) => `${v.impact} ${v.id}: ${v.help}\n    ${v.targets.slice(0, 5).join('\n    ')}`)
    .join('\n');
  expect(failing, `axe found serious or critical violations:\n${message}`).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// Added by the a11y-ux teammate (phase 6): calculator states the page scans don't open, shared by
// a11y.spec.ts and forced-colors.spec.ts. Each `open` leaves the state showing and returns the
// selector of the part it opened (for a focused scan or a screenshot).
// ---------------------------------------------------------------------------------------------

/** Open a <details> by its test id (if it is closed) and wait for it to be open. */
export async function openDisclosure(page: Page, testId: string): Promise<void> {
  const details = page.getByTestId(testId);
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  await expect(details).toHaveAttribute('open', '');
}

export interface CalculatorScene {
  name: string;
  /** Page to open first (relative to baseURL); the calculator is ready there. */
  path: string;
  open: (page: Page) => Promise<string>;
}

/** States inside the calculator: panels, a toggletip, the picker's list, the chart inspector. */
export const CALCULATOR_STATES: readonly CalculatorScene[] = [
  {
    name: 'advanced panel open',
    path: 'rent-vs-buy/leeds/',
    open: async (page) => {
      await openDisclosure(page, 'advanced');
      await expect(page.locator('#calc-termYears')).toBeVisible();
      return '[data-testid="advanced"]';
    },
  },
  {
    name: 'a source tooltip open',
    path: 'rent-vs-buy/leeds/',
    open: async (page) => {
      const tag = page.getByTestId('tag-price');
      await tag.focus();
      await tag.press('Enter');
      await expect(page.locator('#calc-price-source')).toContainText('UK House Price Index');
      return '[data-testid="field-calc-price"]';
    },
  },
  {
    name: 'year-by-year table open',
    path: 'rent-vs-buy/leeds/',
    open: async (page) => {
      await openDisclosure(page, 'year-table');
      await expect(page.getByTestId('year-table').locator('tbody tr').first()).toBeVisible();
      return '[data-testid="year-table"]';
    },
  },
  {
    name: 'area list open',
    path: './',
    open: async (page) => {
      const area = page.locator('#calc-area');
      await area.click();
      await area.fill('Le');
      await expect(page.getByRole('option', { name: /^Leeds,/ })).toBeVisible();
      return '[data-testid="field-calc-area"]';
    },
  },
  {
    name: 'chart year inspector',
    path: 'rent-vs-buy/leeds/',
    open: async (page) => {
      const plot = page.getByRole('slider', { name: 'Year shown on the chart' });
      await plot.focus();
      await plot.press('ArrowRight');
      await expect(page.getByTestId('chart-tooltip')).toBeVisible();
      return '[data-testid="chart"]';
    },
  },
  {
    name: 'link to an unknown area',
    path: './?a=nowhere-at-all',
    open: async (page) => {
      await expect(page.getByTestId('calculator')).toHaveAttribute('data-status', 'error');
      return '[data-testid="answer-card"]';
    },
  },
];
