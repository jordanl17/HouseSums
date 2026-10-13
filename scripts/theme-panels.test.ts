import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readTokens, resolveToken } from './lib/read-tokens.mjs';

/**
 * Guards the primitives' additions to tokens.css:
 * - the fixed --theme-light-* / --theme-dark-* copies used by the /styleguide/ panels
 *   match the real tokens of each theme, and the panels override every one of them;
 * - --color-control-edge (input and segmented edges) reaches 3:1 against concrete
 *   and surface in both themes (WCAG 1.4.11).
 */

const PANEL_COLOURS = [
  'concrete',
  'surface',
  'ink',
  'muted',
  'hi-vis',
  'on-hi-vis',
  'tag-alt',
  'buy',
  'rent',
  'buy-fill',
  'control-edge',
] as const;

const STYLEGUIDE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/pages/styleguide.astro',
);

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) throw new Error(`expected #rrggbb, got ${hex}`);
  const value = match[1];
  const channel = (i: number) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('styleguide theme panels', () => {
  it('copies each theme exactly', async () => {
    const { light, dark } = await readTokens();
    for (const name of PANEL_COLOURS) {
      expect(resolveToken(light, `--theme-light-${name}`), `light ${name}`).toBe(
        resolveToken(light, `--color-${name}`),
      );
      expect(resolveToken(light, `--theme-dark-${name}`), `dark ${name}`).toBe(
        resolveToken(dark, `--color-${name}`),
      );
    }
  });

  it('overrides every copied colour in both panels', async () => {
    const source = await readFile(STYLEGUIDE, 'utf8');
    for (const theme of ['light', 'dark']) {
      for (const name of PANEL_COLOURS) {
        expect(source, `${theme} panel sets --color-${name}`).toContain(
          `--color-${name}: var(--theme-${theme}-${name});`,
        );
      }
    }
  });
});

describe('--color-control-edge', () => {
  it('reaches 3:1 against concrete and surface in both themes', async () => {
    const tokens = await readTokens();
    for (const theme of ['light', 'dark'] as const) {
      const t = tokens[theme];
      const edge = resolveToken(t, '--color-control-edge');
      for (const background of ['--color-concrete', '--color-surface']) {
        const ratio = contrast(edge, resolveToken(t, background));
        expect(ratio, `${theme} edge on ${background}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
