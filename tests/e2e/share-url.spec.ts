import { expect, test, type Page } from '@playwright/test';
import { calculator, expectStatus, gotoCalculator, input, params } from './calculator-helpers';

/**
 * "Copy link to these figures" and the URL round trip (followups teammate): a link copied from
 * one browser reproduces the exact result in a fresh browser context with no shared state.
 */

/** Everything a reader sees that depends on the state: answer, key numbers, every input. */
async function snapshot(page: Page) {
  // One more frame, so the result (computed once per animation frame) has caught up.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const inputs = await page
    .locator('[data-testid="calculator"] input[id^="calc-"]')
    .evaluateAll((elements) =>
      Object.fromEntries(
        elements.map((el) => {
          const node = el as HTMLInputElement;
          return [node.id, node.type === 'radio' ? String(node.checked) : node.value];
        }),
      ),
    );
  const checked = await page
    .locator('[data-testid="calculator"] input[type="radio"]:checked')
    .evaluateAll((elements) =>
      elements.map((el) => `${(el as HTMLInputElement).name}=${(el as HTMLInputElement).value}`),
    );
  return {
    status: await calculator(page).getAttribute('data-status'),
    answer: (await page.getByTestId('answer').innerText()).trim(),
    keyNumbers: (await page.getByTestId('key-numbers').innerText()).trim(),
    breakdown: (await page.getByTestId('breakdown').textContent())?.replace(/\s+/g, ' ').trim(),
    inputs,
    checked,
  };
}

/** Set a field the way a person does: type, then leave it. */
async function enter(page: Page, key: string, text: string): Promise<void> {
  const field = input(page, key);
  await field.fill(text);
  await field.blur();
}

test.describe('share link', () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(baseURL ?? 'http://127.0.0.1').origin,
    });
  });

  test('copies an absolute link to the current figures and says so calmly', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds&p=280000');
    await expectStatus(page, 'ready');
    const button = page.getByTestId('share-link');
    await expect(button).toHaveText('Copy link to these figures');
    await expect(button).toHaveClass(/button--secondary/);
    await expect(page.getByTestId('share-status')).toHaveText('');

    await button.click();
    const status = page.getByTestId('share-status');
    await expect(status).toHaveText('Link copied. Anyone who opens it sees these figures.');
    await expect(status).toHaveAttribute('role', 'status');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(page.url());
    expect(new URL(copied).searchParams.get('p')).toBe('280000');

    // Once a figure changes the copied link is out of date, so the confirmation goes.
    await enter(page, 'price', '290000');
    await expect(status).toHaveText('');
  });

  test('when the browser refuses to copy, the link is shown ready to copy by hand', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
      });
    });
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    await page.getByTestId('share-link').click();
    await expect(page.getByTestId('share-status')).toHaveText(
      "Your browser didn't let us copy it. The link is below, ready to copy.",
    );
    const field = page.getByTestId('share-url');
    await expect(field).toHaveValue(page.url());
    await expect(field).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Link to these figures')).toBeVisible();
    // Selected, so Ctrl+C or the long-press menu copies it straight away.
    await expect
      .poll(() => field.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!))
      .toBe(page.url().length);
  });

  test('without the Clipboard API at all, the fallback still appears', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    });
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    await page.getByTestId('share-link').click();
    await expect(page.getByTestId('share-url')).toHaveValue(page.url());
  });
});

test('a copied link reproduces the exact result in a fresh browser', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(baseURL ?? 'http://127.0.0.1').origin,
  });
  await gotoCalculator(page, 'a=leeds');
  await expectStatus(page, 'ready');

  // Change a spread of inputs through the UI: selection, simple and advanced fields.
  await page.getByTestId('buyer').getByLabel('Moving').check();
  await page.getByTestId('outlook').getByLabel('Cautious').check();
  await enter(page, 'price', '285000');
  await enter(page, 'rent', '1,105');
  await enter(page, 'deposit', '40000');
  await page.getByTestId('advanced').locator('summary').click();
  await enter(page, 'years', '30');
  await enter(page, 'agentFeeRate', '1.2');
  await enter(page, 'serviceCharge', '1,200');
  await expect.poll(() => params(page).get('sc')).toBe('1200');

  const query = params(page);
  expect(Object.fromEntries(query)).toMatchObject({
    a: 'leeds',
    b: 'moving',
    o: 'cautious',
    p: '285000',
    r: '1105',
    d: '40000',
    y: '30',
    ag: '1.2',
    sc: '1200',
  });

  await page.getByTestId('share-link').click();
  await expect(page.getByTestId('share-status')).toContainText('Link copied');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe(page.url());
  const before = await snapshot(page);
  expect(before.status).toBe('ready');

  // A new context shares no storage, cookies or history with the first.
  const fresh = await browser.newContext({ viewport: page.viewportSize() });
  try {
    const other = await fresh.newPage();
    await other.goto(link);
    await expect(calculator(other)).toHaveAttribute('data-hydrated', 'true');
    await expectStatus(other, 'ready');
    // The receiving page keeps the link as it is: nothing added, nothing dropped.
    await expect.poll(() => other.url()).toBe(link);
    expect(await snapshot(other)).toEqual(before);
  } finally {
    await fresh.close();
  }
});

test('a link with only defaults stays short', async ({ page }) => {
  await gotoCalculator(page, 'a=leeds');
  await expectStatus(page, 'ready');
  await enter(page, 'price', '300000');
  await expect.poll(() => params(page).get('p')).toBe('300000');
  // Reset takes it back out of the link.
  await page.getByTestId('reset-price').click();
  await expect.poll(() => params(page).toString()).toBe('a=leeds');
});
