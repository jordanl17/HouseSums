import { expect, test, type Page } from '@playwright/test';
import { answerBox, expectStatus, gotoCalculator, input, pickArea } from './calculator-helpers';

/**
 * No layout jump (followups teammate). A CLS-style check that is stricter than the browser's own
 * metric: Chromium leaves shifts within 500ms of an input out of CLS, but the brief wants none at
 * all. So the page records the answer card's box in document coordinates on every animation
 * frame while a long run of input changes happens, and every frame must match the first. The
 * area and price fields, which sit above the card at 360px, are recorded too: they must not
 * change height as values change.
 */

interface Frame {
  card: [number, number, number, number];
  area: number;
  price: number;
}

declare global {
  interface Window {
    __frames?: Frame[];
    __recording?: boolean;
  }
}

/** Start recording boxes every animation frame. */
async function startRecording(page: Page): Promise<void> {
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="answer-card"]');
    const area = document.querySelector('[data-testid="field-calc-area"]');
    const price = document.querySelector('[data-testid="field-calc-price"]');
    if (!card || !area || !price) throw new Error('calculator regions missing');
    window.__frames = [];
    window.__recording = true;
    const tick = () => {
      if (!window.__recording) return;
      const r = card.getBoundingClientRect();
      window.__frames!.push({
        card: [r.left + scrollX, r.top + scrollY, r.width, r.height],
        area: area.getBoundingClientRect().height,
        price: price.getBoundingClientRect().height,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Stop recording (after two more frames) and return what was seen. */
async function stopRecording(page: Page): Promise<Frame[]> {
  return page.evaluate(
    () =>
      new Promise<Frame[]>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            window.__recording = false;
            resolve(window.__frames ?? []);
          }),
        );
      }),
  );
}

/** Every distinct value (to 0.5px) of one measurement across the frames. */
function distinct(frames: Frame[], pick: (frame: Frame) => number): number[] {
  return [...new Set(frames.map((f) => Math.round(pick(f) * 2) / 2))];
}

function expectStable(frames: Frame[]): void {
  expect(frames.length).toBeGreaterThan(10);
  expect(
    distinct(frames, (f) => f.card[0]),
    'card left',
  ).toHaveLength(1);
  expect(
    distinct(frames, (f) => f.card[1]),
    'card top',
  ).toHaveLength(1);
  expect(
    distinct(frames, (f) => f.card[2]),
    'card width',
  ).toHaveLength(1);
  expect(
    distinct(frames, (f) => f.card[3]),
    'card height',
  ).toHaveLength(1);
  expect(
    distinct(frames, (f) => f.area),
    'area field height',
  ).toHaveLength(1);
  expect(
    distinct(frames, (f) => f.price),
    'price field height',
  ).toHaveLength(1);
}

/** Type like a person, one key at a time, then leave the field. */
async function typeInto(page: Page, key: string, text: string): Promise<void> {
  const field = input(page, key);
  await field.click();
  await field.press('ControlOrMeta+a');
  await field.pressSequentially(text);
  await field.blur();
}

test('the answer card never moves or resizes while inputs change', async ({ page }) => {
  await gotoCalculator(page, 'a=leeds');
  await expectStatus(page, 'ready');
  const start = await answerBox(page);
  await startRecording(page);

  // Price: typed, out of range (clamped with a note), then reset.
  await typeInto(page, 'price', '320000');
  await typeInto(page, 'price', '5');
  await page.getByTestId('reset-price').click();

  // Deposit: more than the price (calm error), under 5% (the lender note), equal to the price
  // (no mortgage), then reset.
  await typeInto(page, 'deposit', '9000000');
  await typeInto(page, 'deposit', '1000');
  const price = await input(page, 'price').inputValue();
  await typeInto(page, 'deposit', price);
  await page.getByTestId('reset-deposit').click();

  // Rent and growth to the extremes: no break-even at all, then break-even in year 1.
  await typeInto(page, 'rent', '300');
  await typeInto(page, 'houseGrowth', '-5');
  await typeInto(page, 'rent', '5000');
  await typeInto(page, 'houseGrowth', '10');
  await page.getByTestId('reset-rent').click();
  await page.getByTestId('reset-houseGrowth').click();

  // Sliders, by keyboard: a burst of changes.
  const rate = page.locator('#calc-mortgageRate-slider');
  await rate.focus();
  for (let i = 0; i < 8; i += 1) await rate.press('ArrowRight');
  for (let i = 0; i < 8; i += 1) await rate.press('ArrowLeft');

  // Buyer type and outlook.
  await page.getByTestId('buyer').getByLabel('Additional property').check();
  await page.getByTestId('outlook').getByLabel('Optimistic').check();
  await page.getByTestId('buyer').getByLabel('First-time').check();
  await page.getByTestId('outlook').getByLabel('Typical').check();

  // The advanced panel, and the horizon at both ends.
  await page.getByTestId('advanced').locator('summary').click();
  await typeInto(page, 'years', '1');
  await typeInto(page, 'years', '40');
  await page.getByTestId('reset-years').click();

  // Another area, through the picker (its list must overlay, not push the card down).
  await pickArea(page, 'Westminster');
  await expect(page.getByTestId('answer-headline')).toContainText('Westminster');

  const frames = await stopRecording(page);
  expectStable(frames);
  expect(await answerBox(page)).toEqual(start);
});

test('the answer card keeps its size from the empty state to the first answer', async ({
  page,
}) => {
  await gotoCalculator(page);
  await expectStatus(page, 'empty');
  const empty = await answerBox(page);
  await startRecording(page);
  await pickArea(page, 'Leeds');
  await expect(page.getByTestId('answer-numeral')).toBeVisible();
  const frames = await stopRecording(page);
  expectStable(frames);
  expect(await answerBox(page)).toEqual(empty);
});
