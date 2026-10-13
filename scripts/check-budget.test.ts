import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_ISLAND_BYTES,
  dynamicImports,
  islandChunks,
  islandEntries,
  staticImports,
} from './check-budget.mjs';

describe('import scanning in built chunks', () => {
  it('finds static imports, re-exports and bare imports, not dynamic ones', () => {
    const code =
      'import{o as e,r as t}from"./preact.abc.js";import"./side.js";export{a as b}from"./re.js";' +
      'var x=()=>import(`./later.def.js`);import{q}from"../up.js"';
    expect(staticImports(code).sort()).toEqual([
      '../up.js',
      './preact.abc.js',
      './re.js',
      './side.js',
    ]);
    expect(dynamicImports(code)).toEqual(['./later.def.js']);
  });

  it('reads dynamic imports in any quote style', () => {
    expect(dynamicImports('import("./a.js");import(\'./b.js\');import(`./c.js`)')).toEqual([
      './a.js',
      './b.js',
      './c.js',
    ]);
  });
});

describe('islandChunks', () => {
  const chunks: Record<string, string> = {
    '_astro/Island.1.js': 'import{a}from"./Main.2.js";import{p}from"./preact.3.js";',
    '_astro/Main.2.js':
      'import{t}from"./types.4.js";import{h}from"./preload-helper.5.js";h(()=>import(`./later.6.js`));',
    '_astro/types.4.js': '',
    '_astro/preact.3.js': '',
    '_astro/preload-helper.5.js': 'import{p}from"./preact.3.js";',
    '_astro/later.6.js': 'import{a}from"./Main.2.js";import{x}from"./only-later.7.js";',
    '_astro/only-later.7.js': '',
  };
  const read = (file: string) => chunks[file];

  it('counts the entry and its static imports, and sets framework and deferred chunks apart', () => {
    const result = islandChunks('_astro/Island.1.js', read);
    expect(result.island.sort()).toEqual([
      '_astro/Island.1.js',
      '_astro/Main.2.js',
      '_astro/types.4.js',
    ]);
    expect(result.framework.sort()).toEqual(['_astro/preact.3.js', '_astro/preload-helper.5.js']);
    expect(result.deferred.sort()).toEqual(['_astro/later.6.js', '_astro/only-later.7.js']);
  });

  it('counts a deferred chunk as island code once something imports it statically', () => {
    const result = islandChunks('_astro/Island.1.js', (file) =>
      file === '_astro/Main.2.js' ? 'import"./later.6.js";' : read(file),
    );
    expect(result.island).toContain('_astro/later.6.js');
    expect(result.deferred).toEqual([]);
  });
});

describe('islandEntries', () => {
  it('reads component-url under the base path', () => {
    const html =
      '<astro-island uid="a" component-url="/HouseSums/_astro/CalculatorIsland.x.js" renderer-url="/HouseSums/_astro/client.y.js">' +
      '<astro-island component-url="/HouseSums/_astro/CalculatorIsland.x.js">';
    expect(islandEntries(html, '/HouseSums/')).toEqual(['_astro/CalculatorIsland.x.js']);
    expect(islandEntries('<astro-island component-url="/_astro/I.js">', '/')).toEqual([
      '_astro/I.js',
    ]);
  });

  it('holds the island to 45KB', () => {
    expect(DEFAULT_MAX_ISLAND_BYTES).toBe(46080);
  });
});
