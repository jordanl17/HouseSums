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

interface Shift {
  value: number;
  hadRecentInput: boolean;
  sources: string[];
}

declare global {
  interface Window {
    __shifts?: Shift[];
  }
}

/** Collect layout-shift entries from now on (not buffered: earlier font swaps are left out). */
async function watchShifts(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
        sources?: { node?: Node | null }[];
      }[]) {
        window.__shifts!.push({
          value: entry.value,
          hadRecentInput: entry.hadRecentInput,
          sources: (entry.sources ?? []).map((source) => {
            const node = source.node;
            const element = node instanceof Element ? node : node?.parentElement;
            const name = element ? `${element.tagName}.${element.className}` : String(node);
            return node instanceof Element ? name : `text in ${name}: ${node?.textContent ?? ''}`;
          }),
        });
      }
    }).observe({ type: 'layout-shift' });
  });
}

test.describe('a shared link', () => {
  // Taller than the default viewport, so the sections under the card are on screen too.
  test.use({ viewport: { width: 1280, height: 1000 } });

  test('shows its answer without moving anything on the page', async ({ page }) => {
    // Hold the area list back until the page has settled and the observer is running, so the
    // arrival of the answer is what gets measured.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/data/area-list.json', async (route) => {
      await released;
      await route.continue();
    });
    await page.goto('./?a=leeds&p=320000');
    await expect(page.getByTestId('calculator')).toHaveAttribute('data-hydrated', 'true');
    await expectStatus(page, 'loading');
    await page.evaluate(() => document.fonts.ready);
    const before = await answerBox(page);
    const moreBefore = await page.locator('.calc-layout__more').boundingBox();
    await watchShifts(page);
    release();
    await expectStatus(page, 'ready');
    await expect(page.getByTestId('answer-numeral')).toBeVisible();
    await expect(page.getByTestId('share-link')).toBeVisible();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    // No shift without input. Chromium reports a sub-pixel text repaint of a tag that changes
    // from "Typical figure" to "Local figure" in place (same box before and after) as about
    // 0.00002; anything a person could see is orders of magnitude above the 0.001 allowed here
    // (Lighthouse shows CLS to three decimals; the bug this guards against was 0.05).
    const shifts = (await page.evaluate(() => window.__shifts ?? [])).filter(
      (shift) => !shift.hadRecentInput,
    );
    const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
    expect(total, JSON.stringify(shifts)).toBeLessThan(0.001);
    expect(await answerBox(page)).toEqual(before);
    // The sections under the card start where they did (they only grow downwards).
    const moreAfter = await page.locator('.calc-layout__more').boundingBox();
    expect(moreAfter?.x).toBe(moreBefore?.x);
    expect(moreAfter?.y).toBe(moreBefore?.y);
  });
});

test('before an area the card is compact; a link reserves the answer from the first paint', async ({
  page,
}) => {
  await gotoCalculator(page);
  await expectStatus(page, 'empty');
  const empty = await answerBox(page);
  // Two lines of copy, not an empty slab the size of the answer.
  expect(empty.height).toBeLessThan(320);
  await pickArea(page, 'Leeds');
  await expect(page.getByTestId('answer-numeral')).toBeVisible();
  const answered = await answerBox(page);
  expect(answered.height).toBeGreaterThan(empty.height);

  // A link: the server-rendered empty card is already the answer's height before any script
  // but the inline marker has run.
  await page.route('**/data/area-list.json', () => {
    // Never answer: the card must hold its reserved size while it waits.
  });
  await page.goto('./?a=leeds');
  const waiting = await answerBox(page);
  expect(Math.abs(waiting.height - answered.height)).toBeLessThan(1);
});
