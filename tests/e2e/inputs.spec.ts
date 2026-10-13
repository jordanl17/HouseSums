import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll } from './helpers';
import { expectStatus, gotoCalculator, input, params, pickArea } from './calculator-helpers';

/**
 * Input behaviours (inputs teammate): the area combobox, provenance tags, Reset links, money
 * parsing, calm validation, sliders, Outlook "Custom", the advanced panel, the tax rules
 * override and the Scotland-only Home Report. Hooks are listed in docs/phases.md, phase 4.
 */

const field = (page: Page, key: string) => page.getByTestId(`field-calc-${key}`);
const note = (page: Page, key: string) => page.locator(`#calc-${key}-note`);

async function openAdvanced(page: Page): Promise<void> {
  const advanced = page.getByTestId('advanced');
  if ((await advanced.getAttribute('open')) === null) {
    await advanced.locator('summary').click();
  }
  await expect(advanced).toHaveAttribute('open', '');
}

/** Type into a field as a person would (select all, type), then leave it. */
async function enter(page: Page, key: string, text: string): Promise<void> {
  const box = input(page, key);
  await box.click();
  await box.press('ControlOrMeta+a');
  await box.pressSequentially(text);
  await box.blur();
}

test.describe('area picker', () => {
  test('is a combobox that filters as you type, ignoring case and accents', async ({ page }) => {
    await gotoCalculator(page);
    const picker = page.getByRole('combobox', { name: 'Area' });
    await expect(picker).toHaveAttribute('aria-expanded', 'false');
    await expect(picker).toHaveAttribute('aria-autocomplete', 'list');

    await picker.click();
    await picker.pressSequentially('LÉEDS');
    await expect(picker).toHaveAttribute('aria-expanded', 'true');
    const listbox = page.getByRole('listbox', { name: 'Places' });
    await expect(listbox).toBeVisible();
    await expect(picker).toHaveAttribute('aria-controls', (await listbox.getAttribute('id')) ?? '');

    // The best match is highlighted, and it shows the nation as secondary text.
    const first = listbox.getByRole('option').first();
    await expect(first).toHaveAccessibleName('Leeds, England');
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await expect(picker).toHaveAttribute(
      'aria-activedescendant',
      (await first.getAttribute('id')) ?? '',
    );

    await picker.press('Enter');
    await expectStatus(page, 'ready');
    await expect(picker).toHaveValue('Leeds');
    await expect(picker).toHaveAttribute('aria-expanded', 'false');
    await expect(picker).toBeFocused();
    await expect(field(page, 'area')).toContainText('Stamp duty (SDLT) applies');
    await expect.poll(() => params(page).get('a')).toBe('leeds');
  });

  test('offers all 361 local authorities and moves with the arrow keys', async ({ page }) => {
    await gotoCalculator(page);
    const picker = page.locator('#calc-area');
    await picker.focus();
    await picker.press('ArrowDown');
    const options = page.getByRole('listbox', { name: 'Places' }).getByRole('option');
    await expect(options).toHaveCount(361);
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await picker.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await picker.press('ArrowUp');
    await picker.press('ArrowUp');
    await expect(options.nth(360)).toHaveAttribute('aria-selected', 'true');
    await expect(options.nth(360)).toBeInViewport();
  });

  test('Escape closes the list, then puts back the picked name', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    const picker = page.locator('#calc-area');
    await picker.click();
    await picker.pressSequentially('Car');
    await expect(picker).toHaveAttribute('aria-expanded', 'true');
    await picker.press('Escape');
    await expect(picker).toHaveAttribute('aria-expanded', 'false');
    await expect(picker).toHaveValue('Car');
    await picker.press('Escape');
    await expect(picker).toHaveValue('Leeds');
    await expect.poll(() => params(page).get('a')).toBe('leeds');
  });

  test('leaving the field picks a name typed in full, or restores the old one', async ({
    page,
  }) => {
    await gotoCalculator(page);
    const picker = page.locator('#calc-area');
    await picker.click();
    await picker.pressSequentially('cardiff');
    await picker.blur();
    await expectStatus(page, 'ready');
    await expect(picker).toHaveValue('Cardiff');

    await picker.click();
    await picker.pressSequentially('Nowhere');
    await expect(page.locator('.combo__message')).toHaveText(
      "No place called ‘Nowhere’. Try the council's name.",
    );
    await picker.blur();
    await expect(picker).toHaveValue('Cardiff');
  });

  test('says so plainly when the list fails to load, and can try again', async ({ page }) => {
    await page.route('**/data/area-list.json', (route) => route.abort());
    await gotoCalculator(page);
    const picker = page.locator('#calc-area');
    await picker.click();
    await expect(field(page, 'area')).toContainText("Couldn't load places");
    await expect(page.locator('.combo__message')).toHaveText("Couldn't load the list of places.");
    await picker.press('Escape');

    await page.unroute('**/data/area-list.json');
    await field(page, 'area').getByRole('button', { name: 'Try again' }).click();
    await pickArea(page, 'Leeds');
  });
});

test.describe('fields', () => {
  test('before an area is picked the fields show typical figures', async ({ page }) => {
    await gotoCalculator(page);
    for (const key of ['price', 'rent', 'houseGrowth', 'deposit', 'mortgageRate']) {
      await expect(page.getByTestId(`tag-${key}`)).toHaveText(/^Typical figure/);
    }
  });

  test('picking an area fills the local figures, each tagged with its source', async ({ page }) => {
    await gotoCalculator(page);
    await pickArea(page, 'Leeds');
    await expect(input(page, 'price')).toHaveValue('247,695');
    for (const key of ['price', 'rent', 'houseGrowth']) {
      await expect(page.getByTestId(`tag-${key}`)).toHaveText(/^Local figure/);
    }
    await openAdvanced(page);
    await expect(page.getByTestId('tag-rentGrowth')).toHaveText(/^Local figure/);

    // The toggletip opens by keyboard and by tap, names the source and month, and closes.
    const tag = page.getByTestId('tag-price');
    await tag.focus();
    await tag.press('Enter');
    await expect(tag).toHaveAttribute('aria-expanded', 'true');
    const bubble = page.locator('#calc-price-source');
    await expect(bubble).toHaveText(/^UK House Price Index, [A-Z][a-z]{2} \d{4}$/);
    await tag.press('Escape');
    await expect(bubble).toBeHidden();
  });

  test('money accepts "£300k", formats on blur and gets a Reset link', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    await enter(page, 'price', '£300k');
    await expect(input(page, 'price')).toHaveValue('300,000');
    await expect.poll(() => params(page).get('p')).toBe('300000');
    await expect(page.getByTestId('tag-price')).toHaveCount(0);

    await page.getByTestId('reset-price').click();
    await expect(input(page, 'price')).toHaveValue('247,695');
    await expect(input(page, 'price')).toBeFocused();
    await expect(page.getByTestId('reset-price')).toHaveCount(0);
    await expect(page.getByTestId('tag-price')).toBeVisible();
    await expect.poll(() => params(page).get('p')).toBeNull();
  });

  test('every changed input gets a Reset link that restores it', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    await openAdvanced(page);
    const values: Record<string, string> = {
      rent: '1,300',
      mortgageRate: '4.5',
      houseGrowth: '2',
      termYears: '25',
      productFee: '0',
      inflation: '3',
      years: '10',
    };
    for (const [key, text] of Object.entries(values)) {
      const before = await input(page, key).inputValue();
      await enter(page, key, text);
      const reset = page.getByTestId(`reset-${key}`);
      await expect(reset).toBeVisible();
      await reset.click();
      await expect(input(page, key)).toHaveValue(before);
      await expect(reset).toHaveCount(0);
    }
    await expect.poll(() => params(page).toString()).toBe('a=leeds');
  });

  test('out-of-range values are kept to the limit with a plain note', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    await enter(page, 'price', '5');
    await expect(input(page, 'price')).toHaveValue('10,000');
    await expect(note(page, 'price')).toHaveText('The lowest this takes is £10,000');

    await enter(page, 'price', '250000');
    await expect(note(page, 'price')).toBeHidden();

    await enter(page, 'price', 'lots');
    await expect(input(page, 'price')).toHaveValue('250,000');
    await expect(note(page, 'price')).toHaveText("That isn't a number, so it's unchanged");

    await openAdvanced(page);
    await enter(page, 'years', '60');
    await expect(input(page, 'years')).toHaveValue('40');
    await expect(note(page, 'years')).toHaveText('The highest this takes is 40 years');
  });

  test('the deposit shows its share, explains loan-to-value and stays within the price', async ({
    page,
  }) => {
    await gotoCalculator(page, 'a=leeds&p=300000');
    await expectStatus(page, 'ready');
    await expect(field(page, 'deposit')).toContainText(
      "10% of the price, so 90% loan-to-value (how much of the price you're borrowing)",
    );

    await enter(page, 'deposit', '400,000');
    await expect(input(page, 'deposit')).toHaveValue('300,000');
    await expect(note(page, 'deposit')).toHaveText("Deposit can't be more than the price");
    await expect(field(page, 'deposit')).toContainText('All of the price, so no mortgage');
    await expect.poll(() => params(page).get('d')).toBe('300000');

    await enter(page, 'deposit', '10000');
    await expect(note(page, 'deposit')).toHaveText(
      'Few lenders offer loans above 95% loan-to-value',
    );
  });

  test('the four key inputs have sliders that change the value', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    for (const key of ['price', 'rent', 'mortgageRate', 'houseGrowth']) {
      await expect(page.locator(`#calc-${key}-slider`)).toBeVisible();
    }
    const slider = page.locator('#calc-mortgageRate-slider');
    await expect(slider).toHaveAccessibleName('Mortgage rate, 5-year fix');
    const before = await input(page, 'mortgageRate').inputValue();
    await slider.focus();
    await slider.press('ArrowRight');
    // One step up (snapped to the slider's 0.05-point grid).
    await expect
      .poll(async () => Number(await input(page, 'mortgageRate').inputValue()))
      .toBeGreaterThan(Number(before));
    await expect(slider).toHaveAttribute('aria-valuetext', /%$/);
    await expect(page.getByTestId('reset-mortgageRate')).toBeVisible();
  });

  test('the outlook shows Custom once one of its assumptions changes', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    const outlook = page.getByTestId('outlook');
    await expect(outlook.getByRole('radio', { name: 'Typical' })).toBeChecked();

    await enter(page, 'houseGrowth', '5');
    await expect(outlook).toContainText("Custom: you've changed house price growth");
    for (const name of ['Cautious', 'Typical', 'Optimistic']) {
      await expect(outlook.getByRole('radio', { name })).not.toBeChecked();
    }

    await outlook.getByRole('radio', { name: 'Cautious' }).check();
    await expect(outlook.getByRole('radio', { name: 'Cautious' })).toBeChecked();
    await expect(outlook).not.toContainText('Custom');
    await expect.poll(() => params(page).get('g')).toBeNull();
    await expect.poll(() => params(page).get('o')).toBe('cautious');
  });

  test('buyer type is a segmented control with plain words', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    const buyer = page.getByTestId('buyer');
    await buyer.getByRole('radio', { name: 'Additional property' }).check();
    await expect(buyer.getByRole('radio', { name: 'Additional property' })).toBeChecked();
    await expect(buyer).toContainText('higher rates of tax apply');
    await expect.poll(() => params(page).get('b')).toBe('additional');
  });
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a tap opens a tag source and a tap elsewhere closes it', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    const tag = page.getByTestId('tag-rent');
    await tag.tap();
    const bubble = page.locator('#calc-rent-source');
    await expect(bubble).toContainText('Price Index of Private Rents');
    await page.locator('h1').tap();
    await expect(bubble).toBeHidden();
  });
});

test.describe('advanced panel', () => {
  test('holds every other input, counted, with plain hints', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds');
    await expectStatus(page, 'ready');
    const advanced = page.getByTestId('advanced');
    await expect(advanced.locator('summary')).toHaveText('Adjust every assumption (17)');
    await openAdvanced(page);
    const keys = [
      'termYears',
      'fixYears',
      'rateAfterFix',
      'productFee',
      'legalBuying',
      'survey',
      'moving',
      'maintenanceRate',
      'insurance',
      'serviceCharge',
      'rentGrowth',
      'investmentReturn',
      'inflation',
      'agentFeeRate',
      'legalSelling',
      'years',
    ];
    for (const key of keys) await expect(input(page, key)).toBeVisible();
    await expect(page.locator('#calc-nation')).toBeVisible();
    await expect(advanced.locator('input, select')).toHaveCount(17);
    await expect(field(page, 'homeReport')).toHaveCount(0);
    await expect(field(page, 'serviceCharge')).toContainText('Flats usually have a service charge');
    await expect(field(page, 'investmentReturn')).toContainText(
      'If you invested in a global index fund in an ISA',
    );

    // The mortgage rate's label follows the fix length.
    await enter(page, 'fixYears', '2');
    await expect(input(page, 'mortgageRate')).toHaveAccessibleName('Mortgage rate, 2-year fix');
    await expectNoHorizontalScroll(page);
  });

  test('Scotland shows the Home Report; the tax rules can be overridden', async ({ page }) => {
    await gotoCalculator(page, 'a=city-of-edinburgh');
    await expectStatus(page, 'ready');
    await expect(field(page, 'area')).toContainText('Scottish stamp duty (LBTT) applies');
    const advanced = page.getByTestId('advanced');
    await expect(advanced.locator('summary')).toHaveText('Adjust every assumption (18)');
    await openAdvanced(page);
    await expect(input(page, 'homeReport')).toHaveValue('600');
    await expect(input(page, 'survey')).toHaveValue('0');

    // Override to Wales: the Home Report goes, and the link carries the override.
    const nation = page.locator('#calc-nation');
    await nation.selectOption('wal');
    await expect(field(page, 'homeReport')).toHaveCount(0);
    await expect(advanced.locator('summary')).toHaveText('Adjust every assumption (17)');
    await expect(field(page, 'area')).toContainText('Welsh stamp duty (LTT) applies');
    await expect.poll(() => params(page).get('n')).toBe('wal');

    await page.getByTestId('reset-nation').click();
    await expect(nation).toHaveValue('sco');
    await expect(nation).toBeFocused();
    await expect.poll(() => params(page).get('n')).toBeNull();
  });

  test('a Leeds link with Scottish rules shows the Home Report', async ({ page }) => {
    await gotoCalculator(page, 'a=leeds&n=sco');
    await expectStatus(page, 'ready');
    await openAdvanced(page);
    await expect(page.locator('#calc-nation')).toHaveValue('sco');
    await expect(input(page, 'homeReport')).toBeVisible();
    await expect(field(page, 'nation')).toContainText('Leeds is in England');
  });
});

test('the area and price fields keep their height as values change', async ({ page }) => {
  await gotoCalculator(page);
  const heights = async () => ({
    area: (await field(page, 'area').boundingBox())?.height,
    price: (await field(page, 'price').boundingBox())?.height,
  });
  const empty = await heights();
  await pickArea(page, 'City of Edinburgh');
  expect(await heights()).toEqual(empty);
  await enter(page, 'price', '5');
  await expect(note(page, 'price')).toBeVisible();
  expect(await heights()).toEqual(empty);
  await pickArea(page, 'Leeds');
  expect(await heights()).toEqual(empty);
});
