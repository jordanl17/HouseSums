import { describe, expect, it } from 'vitest';
import { findColourLiterals, isChecked } from './check-tokens.mjs';

const matches = (source: string, file: string) =>
  findColourLiterals(source, file).map((f) => f.match);

describe('findColourLiterals', () => {
  it('flags hex colours in CSS', () => {
    expect(matches('.a { color: #fff; border-color: #1A1A1A80; }', 'x.css')).toEqual([
      '#fff',
      '#1A1A1A80',
    ]);
  });

  it('flags colour functions', () => {
    expect(matches('.a { color: rgb(0 0 0); background: hsl(0 0% 0% / 0.5); }', 'x.css')).toEqual([
      'rgb()',
      'hsl()',
    ]);
    expect(matches('.a { color: oklch(0.5 0.1 200); }', 'x.css')).toEqual(['oklch()']);
  });

  it('flags named colours in CSS declarations', () => {
    expect(matches('.a { border: 1px solid black; color: White; }', 'x.css')).toEqual([
      'black',
      'White',
    ]);
  });

  it('allows tokens, transparent, currentColor, inherit and system colours', () => {
    const css = [
      '.a { color: var(--color-ink); background: transparent; fill: currentColor; }',
      '.b { color: inherit; outline-color: CanvasText; }',
      '.c { background-color: color-mix(in srgb, var(--color-buy) 14%, transparent); }',
    ].join('\n');
    expect(matches(css, 'x.css')).toEqual([]);
  });

  it('ignores selectors, font names, grid areas and comments', () => {
    const css = [
      '/* #fff and red in a comment */',
      '.tag--red:hover { font-family: var(--font-sans); }',
      ".g { grid-template-areas: 'tan' 'answer'; }",
      '@media (min-width: 48rem) { .x { gap: 1rem; } }',
    ].join('\n');
    expect(matches(css, 'x.css')).toEqual([]);
  });

  it('flags literals in Astro style blocks, style attributes and SVG attributes', () => {
    const astro = [
      '---',
      "const x = 'red';",
      '---',
      '<svg><path fill="#D4FF00" stroke="black" /></svg>',
      '<p style="color: red">Hi</p>',
      '<style>',
      '  .a { color: navy; }',
      '</style>',
    ].join('\n');
    const found = findColourLiterals(astro, 'x.astro');
    expect(found.map((f) => [f.line, f.match])).toEqual([
      [4, '#D4FF00'],
      [4, 'black'],
      [5, 'red'],
      [7, 'navy'],
    ]);
  });

  it('does not flag plain words or fragment links in markup', () => {
    const astro = [
      '<a href="#main">Skip to main content</a>',
      '<a href="#add">Add</a>',
      '<p>Red-brick terraces and white vans.</p>',
      '<path fill="currentColor" class="logo__sun" />',
    ].join('\n');
    expect(matches(astro, 'x.astro')).toEqual([]);
  });

  it('flags colour-ish keys in TSX style objects but not other keys', () => {
    const tsx = [
      "const a = { backgroundColor: 'white', label: 'red' };",
      'const b = <rect fill={"orange"} />;',
    ].join('\n');
    expect(matches(tsx, 'x.tsx')).toEqual(['white', 'orange']);
  });

  it('skips lines marked check-tokens-ignore', () => {
    expect(matches('.a { color: #fff; } /* check-tokens-ignore: test */', 'x.css')).toEqual([]);
  });

  it('reports line and column', () => {
    expect(findColourLiterals('.a {\n  color: #abc;\n}', 'x.css')).toEqual([
      { line: 2, column: 10, match: '#abc', kind: 'hex' },
    ]);
  });
});

describe('isChecked', () => {
  it('covers CSS, Astro, TSX anywhere and scripts under src', () => {
    expect(isChecked('src/styles/base.css')).toBe(true);
    expect(isChecked('src/components/Logo.astro')).toBe(true);
    expect(isChecked('src/components/Hello.tsx')).toBe(true);
    expect(isChecked('src/lib/format.ts')).toBe(true);
  });

  it('skips tokens.css, tests, scripts and docs', () => {
    expect(isChecked('src/styles/tokens.css')).toBe(false);
    expect(isChecked('tests/e2e/smoke.spec.ts')).toBe(false);
    expect(isChecked('scripts/check-contrast.mjs')).toBe(false);
    expect(isChecked('docs/brief.md')).toBe(false);
    expect(isChecked('public/favicon.svg')).toBe(false);
  });
});
