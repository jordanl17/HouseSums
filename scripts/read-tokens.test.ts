import { describe, expect, it } from 'vitest';
import { parseTokens, readTokens, resolveToken } from './lib/read-tokens.mjs';

describe('parseTokens', () => {
  const css = `
    /* a comment with --fake: #000; */
    :root {
      --color-ink: #1a1a1a;
      --color-focus: var(--color-ink);
      --gap: 1rem;
    }
    @media (min-width: 48rem) { :root { --gap: 2rem; } }
    @media (prefers-color-scheme: dark) {
      :root { --color-ink: #eceae5; }
    }
  `;

  it('reads light and dark, ignoring other media blocks and comments', () => {
    const { light, dark } = parseTokens(css);
    expect(light).toEqual({
      '--color-ink': '#1a1a1a',
      '--color-focus': 'var(--color-ink)',
      '--gap': '1rem',
    });
    expect(dark['--color-ink']).toBe('#eceae5');
    expect(dark['--gap']).toBe('1rem');
  });

  it('resolves var() references per theme', () => {
    const { light, dark } = parseTokens(css);
    expect(resolveToken(light, '--color-focus')).toBe('#1a1a1a');
    expect(resolveToken(dark, '--color-focus')).toBe('#eceae5');
    expect(() => resolveToken(light, '--missing')).toThrow();
  });
});

describe('src/styles/tokens.css', () => {
  it('defines every brief colour token in both themes with the brief values', async () => {
    const { light, dark } = await readTokens();
    const brief: Record<string, [string, string]> = {
      '--color-concrete': ['#d8d6d1', '#1c1c1b'],
      '--color-surface': ['#e9e7e2', '#262624'],
      '--color-ink': ['#1a1a1a', '#eceae5'],
      '--color-muted': ['#4e4e4e', '#b3b1ab'],
      '--color-hi-vis': ['#d4ff00', '#d4ff00'],
      '--color-on-hi-vis': ['#1a1a1a', '#1a1a1a'],
      '--color-tag-alt': ['#ffffff', '#3a3a37'],
      '--color-buy': ['#1f5aa6', '#5b8fe0'],
      '--color-rent': ['#e85a0c', '#db5e14'],
    };
    for (const [name, [lightValue, darkValue]] of Object.entries(brief)) {
      expect(resolveToken(light, name).toLowerCase(), `${name} light`).toBe(lightValue);
      expect(resolveToken(dark, name).toLowerCase(), `${name} dark`).toBe(darkValue);
    }
  });

  it('draws the contour background with circles, never ellipses', async () => {
    const { light } = await readTokens();
    const contour = light['--contour-background'] ?? '';
    expect(contour).toMatch(/^repeating-radial-gradient\(\s*circle at 85% 12%/);
    expect(contour).not.toMatch(/ellipse/);
    expect(contour).toContain('transparent 0 26px');
    expect(contour).toContain('26px 27.5px');
  });

  it('sets the card radius to 26px and pills to 999px', async () => {
    const { light } = await readTokens();
    expect(light['--radius-card']).toBe('26px');
    expect(light['--radius-pill']).toBe('999px');
  });
});
