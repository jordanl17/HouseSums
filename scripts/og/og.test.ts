import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import taxRulesJson from '../../data/taxRules.json';
import { parseTaxRules } from '../../src/lib/schema';
import { OG_IMAGE_SIZE, ogImagePath } from '../../src/lib/seo';
import { NATIONS } from '../../src/lib/types';
import { findColourLiterals } from '../check-tokens.mjs';
import { OG_HEIGHT, OG_WIDTH, cardHtml, cards, escapeHtml, logoShapes } from './card';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const taxRules = parseTaxRules(taxRulesJson);
const logoSource = readFileSync(path.join(ROOT, 'src/components/Logo.astro'), 'utf8');

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(file);
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(buffer.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('OG cards', () => {
  it('has the site default and one card per nation, named as seo.ts expects', () => {
    expect(cards(taxRules).map((card) => `og/${card.name}.png`)).toEqual([
      ogImagePath(),
      ...NATIONS.map((nation) => ogImagePath(nation)),
    ]);
  });

  it('names each nation and its property tax from taxRules.json', () => {
    const byName = Object.fromEntries(cards(taxRules).map((card) => [card.name, card]));
    expect(byName['scotland']).toMatchObject({
      heading: 'Rent v buy in Scotland',
      tagAlt: 'Property tax: LBTT',
    });
    expect(byName['northern-ireland']?.tagAlt).toBe('Property tax: SDLT');
    expect(byName['wales']?.tagAlt).toBe('Property tax: LTT');
    expect(byName['default']?.tagAlt).toBe('SDLT, LBTT and LTT');
  });

  it('follows the copy rules: no em-dashes, no exclamation marks', () => {
    for (const card of cards(taxRules)) {
      const words = [card.heading, card.subheading, card.tag, card.tagAlt].join(' ');
      expect(words).not.toMatch(/[—!]/);
    }
  });

  it('draws the logo from Logo.astro and uses tokens, never colour literals', () => {
    const logo = logoShapes(logoSource);
    expect(logo).toContain('logo__sun');
    expect(logo).toContain('logo__horizon');
    const card = cards(taxRules)[1];
    if (!card) throw new Error('no cards');
    const html = cardHtml(card, ['file:///tokens.css'], logo);
    expect(findColourLiterals(html, 'card.css')).toEqual([]);
    expect(html).toContain(`width: ${OG_WIDTH}px`);
    expect(html).toContain('var(--contour-background)');
    expect(html).toContain('<link rel="stylesheet" href="file:///tokens.css">');
  });

  it('escapes text', () => {
    expect(escapeHtml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;');
  });

  it('matches the size seo.ts declares', () => {
    expect({ width: OG_WIDTH, height: OG_HEIGHT }).toEqual(OG_IMAGE_SIZE);
  });
});

describe('committed OG images', () => {
  for (const card of cards(taxRules)) {
    it(`public/og/${card.name}.png is a 1200x630 PNG`, () => {
      const file = path.join(ROOT, 'public/og', `${card.name}.png`);
      expect(pngSize(file)).toEqual(OG_IMAGE_SIZE);
      // A blank or broken render is a few KB; a real card is tens of KB.
      expect(readFileSync(file).length).toBeGreaterThan(20_000);
    });
  }
});
