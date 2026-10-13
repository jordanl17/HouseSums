import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHOTS, THEMES, WIDTHS, parseArgs, plan, shotFile } from './screenshots.mjs';

describe('screenshots: the slop-review set', () => {
  it('covers every page type the phase asks for', () => {
    expect(SHOTS.map((shot) => shot.name)).toEqual([
      'home-empty',
      'home-leeds',
      'area-leeds',
      'area-glasgow-city',
      'area-cardiff',
      'area-belfast',
      'area-westminster',
      'nation-scotland',
      'how-it-works',
      'sources',
      'about',
      '404',
    ]);
    expect(WIDTHS).toEqual([360, 1280]);
    expect(THEMES).toEqual(['light', 'dark']);
  });

  it('uses relative paths, so the same set works under any base path or a live URL', () => {
    for (const shot of SHOTS) expect(shot.path.startsWith('/')).toBe(false);
  });

  it('waits for an answer on every page that names an area', () => {
    const named = SHOTS.filter((shot) => shot.area).map((shot) => shot.name);
    expect(named).toEqual([
      'home-leeds',
      'area-leeds',
      'area-glasgow-city',
      'area-cardiff',
      'area-belfast',
      'area-westminster',
    ]);
  });

  it('plans every page at both widths in both themes, one unique file each', () => {
    const shots = plan();
    expect(shots).toHaveLength(SHOTS.length * WIDTHS.length * THEMES.length);
    expect(new Set(shots.map((shot) => shot.file)).size).toBe(shots.length);
    expect(shots.map((shot) => shot.file)).toContain('home-empty-360-light.png');
    expect(shots.map((shot) => shot.file)).toContain('404-1280-dark.png');
  });

  it('names files <name>-<width>-<theme>.png', () => {
    expect(shotFile('area-leeds', 1280, 'dark')).toBe('area-leeds-1280-dark.png');
  });

  it('can be limited to some pages', () => {
    const shots = plan(['about']);
    expect(shots.map((shot) => shot.file)).toEqual([
      'about-360-light.png',
      'about-360-dark.png',
      'about-1280-light.png',
      'about-1280-dark.png',
    ]);
  });
});

describe('screenshots: command line', () => {
  it('needs --out, resolved against the working folder', () => {
    expect(() => parseArgs([], '/work')).toThrow(/--out/);
    expect(parseArgs(['--out', 'shots'], '/work')).toEqual({
      out: path.resolve('/work', 'shots'),
      url: null,
      only: null,
    });
  });

  it('takes a live site root and adds the trailing slash', () => {
    expect(
      parseArgs(['--out', '/tmp/s', '--url', 'https://jordanl17.github.io/HouseSums']).url,
    ).toBe('https://jordanl17.github.io/HouseSums/');
  });

  it('refuses unknown flags, missing values and unknown pages', () => {
    expect(() => parseArgs(['--out', '/tmp/s', '--width', '360'])).toThrow(/Unknown argument/);
    expect(() => parseArgs(['--out'])).toThrow(/Missing value/);
    expect(() => parseArgs(['--out', '--url', 'x'])).toThrow(/Missing value/);
    expect(() => parseArgs(['--out', '/tmp/s', '--only', 'home,about'])).toThrow(/Unknown shot/);
    expect(parseArgs(['--out', '/tmp/s', '--only', 'home-empty,about']).only).toEqual([
      'home-empty',
      'about',
    ]);
  });
});
