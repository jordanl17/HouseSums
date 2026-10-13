import { describe, expect, it } from 'vitest';
import {
  CONTRAST_PAIRS,
  checkContrast,
  contrastRatio,
  findForbiddenTextColours,
  parseColour,
  scanRepoForForbiddenTextColours,
  toCssRgb,
} from './check-contrast.mjs';
import { readTokens } from './lib/read-tokens.mjs';

describe('parseColour', () => {
  it('reads 3, 6 and 8 digit hex', () => {
    expect(parseColour('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour('#1C1C1B')).toEqual({ r: 28, g: 28, b: 27, a: 1 });
    expect(parseColour('#00000080').a).toBeCloseTo(0.502, 3);
  });

  it('reads rgb() in modern and legacy syntax, with alpha', () => {
    expect(parseColour('rgb(26 26 26 / 0.09)')).toEqual({ r: 26, g: 26, b: 26, a: 0.09 });
    expect(parseColour('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColour('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
  });

  it('refuses values it cannot measure', () => {
    expect(() => parseColour('var(--color-ink)')).toThrow();
    expect(() => parseColour('red')).toThrow();
  });
});

describe('toCssRgb', () => {
  it('formats a colour the way getComputedStyle does', () => {
    expect(toCssRgb('#1c1c1b')).toBe('rgb(28, 28, 27)');
    expect(toCssRgb('#D8D6D1')).toBe('rgb(216, 214, 209)');
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    // #767676 is the classic lightest grey that passes 4.5:1 on white.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#1f5aa6', '#e9e7e2')).toBeCloseTo(
      contrastRatio('#e9e7e2', '#1f5aa6'),
      10,
    );
  });

  it('composites a translucent foreground over the background first', () => {
    // Fully transparent ink on white is just white.
    expect(contrastRatio('rgb(0 0 0 / 0)', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('rgb(0 0 0 / 0.5)', '#ffffff')).toBeLessThan(
      contrastRatio('#000000', '#ffffff'),
    );
  });
});

describe('CONTRAST_PAIRS', () => {
  const has = (fg: string, bg: string, theme: 'light' | 'dark', min: number) =>
    CONTRAST_PAIRS.some(
      (p) => p.fg === fg && p.bg === bg && p.min === min && p.themes.includes(theme),
    );

  it('covers every text pair the site uses, in both themes, at 4.5:1', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(has('--color-ink', '--color-concrete', theme, 4.5)).toBe(true);
      expect(has('--color-ink', '--color-surface', theme, 4.5)).toBe(true);
      expect(has('--color-muted', '--color-concrete', theme, 4.5)).toBe(true);
      expect(has('--color-muted', '--color-surface', theme, 4.5)).toBe(true);
      expect(has('--color-on-hi-vis', '--color-hi-vis', theme, 4.5)).toBe(true);
      expect(has('--color-ink', '--color-tag-alt', theme, 4.5)).toBe(true);
    }
  });

  it('covers the answer numeral and buy series at 3:1', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(has('--color-buy', '--color-surface', theme, 3)).toBe(true);
      expect(has('--color-buy', '--color-concrete', theme, 3)).toBe(true);
    }
  });

  it('covers the focus ring pairs at 3:1', () => {
    expect(has('--color-focus-edge', '--color-concrete', 'light', 3)).toBe(true);
    expect(has('--color-focus-edge', '--color-surface', 'light', 3)).toBe(true);
    expect(has('--color-focus-ring', '--color-focus-edge', 'light', 3)).toBe(true);
    expect(has('--color-focus-ring', '--color-focus-edge', 'dark', 3)).toBe(true);
    expect(has('--color-focus-ring', '--color-concrete', 'dark', 3)).toBe(true);
    expect(has('--color-focus-ring', '--color-surface', 'dark', 3)).toBe(true);
  });
});

describe('checkContrast against src/styles/tokens.css', () => {
  it('passes every pair in both themes', async () => {
    const tokens = await readTokens();
    const results = checkContrast(tokens);
    const failures = results.filter((r) => !r.pass);
    expect(
      failures,
      failures.map((f) => `${f.theme} ${f.fg} on ${f.bg}: ${f.ratio.toFixed(2)}`).join('\n'),
    ).toEqual([]);
    expect(results.length).toBeGreaterThan(20);
  });

  it('fails a pair that is too close, so the check has teeth', () => {
    const light = { '--a': '#d4ff00', '--b': '#d8d6d1' };
    const results = checkContrast({ light, dark: light }, [
      { fg: '--a', bg: '--b', min: 3, themes: ['light'], use: 'hi-vis on concrete' },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]?.pass).toBe(false);
    expect(results[0]?.ratio).toBeLessThan(1.5);
  });
});

describe('findForbiddenTextColours', () => {
  const words = (source: string, file = 'x.css') =>
    findForbiddenTextColours(source, file).map((f) => f.token);

  it('flags rent and hi-vis used as a text colour', () => {
    expect(words('.a { color: var(--color-rent); }')).toEqual(['--color-rent']);
    expect(words('.a{color:var(--color-hi-vis)}')).toEqual(['--color-hi-vis']);
    expect(words('.a { -webkit-text-fill-color: var(--color-focus-ring); }')).toEqual([
      '--color-focus-ring',
    ]);
  });

  it('flags rent as the fill of chart text or labels', () => {
    expect(words('.chart__label--rent { fill: var(--color-rent); }')).toEqual(['--color-rent']);
    expect(words('.chart text { fill: var(--color-rent); }')).toEqual(['--color-rent']);
  });

  it('allows rent and hi-vis as graphics and backgrounds', () => {
    expect(words('.chart__line--rent { stroke: var(--color-rent); }')).toEqual([]);
    expect(words('.button--primary { background-color: var(--color-hi-vis); }')).toEqual([]);
    expect(
      words('.tag--local { background: var(--color-hi-vis); color: var(--color-on-hi-vis); }'),
    ).toEqual([]);
    expect(
      words('.marker { border-color: var(--color-hi-vis); fill: var(--color-hi-vis); }'),
    ).toEqual([]);
  });

  it('reads <style> blocks and style attributes in Astro files', () => {
    expect(words('<style>.a { color: var(--color-rent); }</style>', 'x.astro')).toEqual([
      '--color-rent',
    ]);
    expect(words('<span style="color: var(--color-hi-vis)">x</span>', 'x.astro')).toEqual([
      '--color-hi-vis',
    ]);
  });

  it('ignores comments', () => {
    expect(words('/* never color: var(--color-rent); */ .a { color: var(--color-ink); }')).toEqual(
      [],
    );
  });
});

describe('repository', () => {
  it('never uses rent or hi-vis as a text colour', async () => {
    const findings = await scanRepoForForbiddenTextColours();
    expect(findings.map((f) => `${f.file}:${f.line} ${f.token}`)).toEqual([]);
  });
});
