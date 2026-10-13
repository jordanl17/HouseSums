import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  choiceDefaultRows,
  defaultRows,
  formatDateLong,
  formatMonthLong,
  presetTable,
  regimeSummaries,
  sourceEntries,
} from '../../src/lib/content';
import { parseSourcesFile } from '../../src/lib/schema';
import { areas, defaults, rates, taxRules } from './oracle';

/**
 * The content pages (phase 5, content teammate): each renders its key sections and the tables
 * built from data/*.json, with the figures the data files hold. Relative paths only, so the
 * suite also runs against the live site. Runs at 360 and 1280.
 */

const sources = parseSourcesFile(
  JSON.parse(readFileSync(new URL('../../data/sources.json', import.meta.url), 'utf8')),
);

test.describe('/how-it-works/', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('how-it-works/');
  });

  test('has every section, reachable from the contents list', async ({ page }) => {
    const sections = [
      'The method',
      'The formulas',
      'A worked example',
      'Starting figures',
      'Outlook presets',
      'Property tax',
      'Assumptions',
      'Known limits',
      'Not advice',
    ];
    for (const name of sections) {
      await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
    }
    const toc = page.getByRole('navigation', { name: 'On this page' });
    await expect(toc.getByRole('link')).toHaveText(sections);
    await toc.getByRole('link', { name: 'Property tax' }).click();
    await expect(page).toHaveURL(/#property-tax$/);
  });

  test('sets the formulas in HTML, not images', async ({ page }) => {
    const formulas = page.locator('.formula');
    await expect(formulas).toHaveCount(7);
    await expect(page.locator('#formula-payment .formula__expr')).toHaveText(
      'M = L × r ÷ (1 − (1 + r)to the power of −n)',
    );
    await expect(page.locator('#formulas img, #formulas svg')).toHaveCount(0);
  });

  test('lists every input with the default and reason from defaults.json', async ({ page }) => {
    const { simple, advanced } = defaultRows(defaults);
    for (const [testid, rows] of [
      ['defaults-simple', [...choiceDefaultRows(defaults), ...simple]],
      ['defaults-advanced', advanced],
    ] as const) {
      const body = page.getByTestId(testid).locator('tbody tr');
      await expect(body).toHaveCount(rows.length);
      for (const [index, row] of rows.entries()) {
        const cells = body.nth(index);
        await expect(cells.locator('th')).toHaveText(row.label);
        await expect(cells.locator('td').nth(0)).toHaveText(row.value);
        await expect(cells.locator('td').nth(1)).toHaveText(row.reason);
      }
    }
    // Spot checks against the raw file, so a wording bug in the helpers can't hide a wrong figure.
    await expect(page.getByTestId('defaults-advanced')).toContainText('£999');
    await expect(page.getByTestId('defaults-advanced')).toContainText(
      `${defaults.fields.years.default} years`,
    );
  });

  test('shows the Outlook presets from defaults.json', async ({ page }) => {
    const { rows } = presetTable(defaults);
    const body = page.getByTestId('presets').locator('tbody tr');
    await expect(body).toHaveCount(rows.length);
    for (const [index, row] of rows.entries()) {
      await expect(body.nth(index).locator('th')).toHaveText(row.assumption);
      await expect(body.nth(index).locator('td')).toHaveText([
        row.values.cautious,
        row.values.typical,
        row.values.optimistic,
      ]);
    }
  });

  test('shows the tax bands and effective date from taxRules.json', async ({ page }) => {
    const section = page.locator('#property-tax');
    await expect(section).toContainText(taxRules.taxYear);
    await expect(section).toContainText(formatDateLong(taxRules.effectiveFrom));
    for (const regime of regimeSummaries(taxRules)) {
      const block = section.locator('.tax-regime').filter({
        has: page.getByRole('heading', { level: 3, name: regime.name }),
      });
      const main = block.locator('table').filter({ hasText: 'Main rates' });
      await expect(main.locator('tbody tr')).toHaveCount(regime.main.length);
      for (const [index, band] of regime.main.entries()) {
        await expect(main.locator('tbody tr').nth(index).locator('td')).toHaveText([
          band.range,
          band.rate,
        ]);
      }
      await expect(block).toContainText(regime.additional.note);
    }
    await expect(section).toContainText('Up to £125,000');
    await expect(section).toContainText('Home Report');
  });

  test('works the example through the engine', async ({ page }) => {
    const example = page.getByTestId('worked-example');
    await expect(example).toContainText(
      `£${areas.nations[defaults.defaultNation].price.toLocaleString('en-GB')}`,
    );
    await expect(example.locator('tbody tr').last()).toContainText(/Year \d+|None in \d+ years/);
  });

  test('states the assumptions, the left-out tax cases and the disclaimer', async ({ page }) => {
    const assumptions = page.locator('#assumptions');
    for (const text of [
      'free of capital gains tax',
      'ISA',
      'paid from income',
      'standard variable rate (SVR)',
      'Lifetime ISA',
      '2% stamp duty surcharge',
      'companies and trusts',
      'Shared ownership',
      'refund of the higher rates',
    ]) {
      await expect(assumptions).toContainText(text);
    }
    await expect(page.locator('#not-advice')).toContainText(
      'This is a model, not financial advice.',
    );
  });
});

test.describe('/sources/', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('sources/');
  });

  test('lists every dataset with publisher, links, licence, use and month', async ({ page }) => {
    const entries = sourceEntries(sources);
    const items = page.getByTestId('source');
    await expect(items).toHaveCount(entries.length);
    for (const [index, entry] of entries.entries()) {
      const item = items.nth(index);
      await expect(item.getByRole('heading', { level: 3 })).toHaveText(entry.source.dataset);
      await expect(item).toContainText(entry.source.publisher);
      await expect(item.getByRole('link').first()).toHaveAttribute('href', entry.source.url);
      const licence = item.getByRole('link', { name: entry.source.licence });
      if (entry.source.licenceUrl) {
        await expect(licence).toHaveAttribute('href', entry.source.licenceUrl);
      }
      await expect(item.getByTestId('source-as-of')).toHaveText(formatMonthLong(entry.source.asOf));
      if (entry.usedFor) await expect(item).toContainText(entry.usedFor);
      if (entry.attribution) await expect(item).toContainText(entry.attribution);
    }
  });

  test('shows every Bank of England series with its rate', async ({ page }) => {
    const rows = page.getByTestId('boe-series').locator('tbody tr');
    await expect(rows).toHaveCount(rates.rates.length);
    for (const rate of rates.rates) {
      await expect(page.getByTestId('boe-series')).toContainText(rate.series);
    }
    const boe = sources.sources.find((source) => source.id === 'boe-quoted-rates');
    const first = boe?.series?.[0];
    if (first) {
      await page.getByText('What each series code means').click();
      await expect(page.getByText(first.description).first()).toBeVisible();
    }
  });

  test('explains the rental areas, the refresh and the last refresh date', async ({ page }) => {
    await expect(page.getByTestId('last-refresh')).toHaveText(formatDateLong(sources.generatedAt));
    const withRentArea = areas.areas.filter((area) => area.rentArea !== undefined);
    await expect(page.getByTestId('rental-areas').locator('tbody tr')).toHaveCount(
      withRentArea.length,
    );
    const refresh = page.locator('#refresh');
    await expect(refresh).toContainText('GitHub Action');
    await expect(refresh).toContainText('pull request');
    await expect(refresh).toContainText('20th of each month');
    const fallbacks = areas.areas.filter((area) => area.fallbacks.length > 0);
    await expect(page.getByTestId('fallback-areas').getByRole('listitem')).toHaveCount(
      fallbacks.length,
    );
  });

  test('carries the licence attribution statements', async ({ page }) => {
    const list = page.getByTestId('attributions');
    await expect(list).toContainText('Contains HM Land Registry data © Crown copyright');
    await expect(list).toContainText('Office for National Statistics');
    await expect(list).toContainText('Contains OS data © Crown copyright');
  });
});

test.describe('/about/', () => {
  test('says who is behind it, the privacy facts, not advice and how to report', async ({
    page,
  }) => {
    await page.goto('about/');
    const main = page.getByRole('main');
    await expect(main).toContainText('independent project by Jordan Lawrence');
    await expect(main).toContainText('No adverts');
    await expect(main).toContainText('no personal data collected');
    await expect(main).toContainText('worked out in your browser');
    await expect(main).toContainText('no cookies');
    await expect(main).toContainText('This is a model, not financial advice.');
    await expect(page.getByTestId('issues-link')).toHaveAttribute(
      'href',
      'https://github.com/jordanl17/HouseSums/issues',
    );
  });
});
