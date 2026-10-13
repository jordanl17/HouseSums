import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared helpers for the calculator e2e tests (phase 4). Owner: phase lead. The inputs teammate
 * updates pickArea() when the combobox replaces the stub select; nobody else edits this file
 * (add your own helpers in your spec file, or ask the lead).
 *
 * Hooks are data-testid attributes, listed in docs/phases.md ("Phase 4 contracts"). Paths are
 * relative to baseURL so the tests also run against the live site.
 */

/** The brief's reference scenario as a link (rent growth 3.5%, as in model.test.ts). */
export const REFERENCE_QUERY = 'a=leeds&p=300000&d=30000&r=1250&mr=4.3&ra=4.3&g=3&rg=3.5';

export type CalcStatus = 'empty' | 'loading' | 'ready' | 'error';

export function calculator(page: Page): Locator {
  return page.getByTestId('calculator');
}

/** Open the home page with an optional query ("a=leeds&p=300000") and wait for hydration. */
export async function gotoCalculator(page: Page, query = ''): Promise<void> {
  await page.goto(query === '' ? './' : `./?${query.replace(/^\?/, '')}`);
  await expect(calculator(page)).toHaveAttribute('data-hydrated', 'true');
}

/** Wait until the island reports this status. */
export async function expectStatus(page: Page, status: CalcStatus): Promise<void> {
  await expect(calculator(page)).toHaveAttribute('data-status', status);
}

/** The input for a numeric field, by its key in NUMERIC_INPUT_KEYS ("price", "rent"...). */
export function input(page: Page, key: string): Locator {
  return page.locator(`#calc-${key}`);
}

/**
 * Pick an area by its display name ("Leeds") with the area picker, then wait for the answer.
 * Implementation follows the picker: the inputs teammate owns this function's body.
 */
export async function pickArea(page: Page, name: string): Promise<void> {
  const picker = page.locator('#calc-area');
  await picker.click();
  await picker.fill(name);
  // Options read "Leeds, England": match the name exactly, before the comma.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('option', { name: new RegExp(`^${escaped},`) }).click();
  await expect(picker).toHaveValue(name);
  await expectStatus(page, 'ready');
}

/** The answer card's bounding box, for layout-shift checks. */
export async function answerBox(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.getByTestId('answer-card').boundingBox();
  if (!box) throw new Error('answer card is not visible');
  return box;
}

/** The current URL's search params. */
export function params(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams;
}
