/**
 * Every area page's static answer equals an independent run of the engine at typical
 * assumptions: runModel(deriveInputs(...)) with the default buyer type and Outlook preset, no
 * overrides and no nation override, from the committed data read through the schema parsers.
 *
 * Checked on each page, in the HTML as built (before any JS): the island's answer numeral and
 * kind, the headline naming the area, the summary sentence and the meta description. The
 * expected words are written out here rather than taken from src/lib/areas.ts, so a change to
 * either side shows up.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import areasJson from '../../data/areas.json';
import defaultsJson from '../../data/defaults.json';
import ratesJson from '../../data/rates.json';
import taxRulesJson from '../../data/taxRules.json';
import { deriveInputs } from '../../src/lib/defaults';
import { runModel } from '../../src/lib/model';
import { parseAreasFile, parseDefaults, parseRatesFile, parseTaxRules } from '../../src/lib/schema';
import type { Area } from '../../src/lib/types';
import { elementByTestId, loadSite, textOf, type BuiltSite } from './site';

const areasFile = parseAreasFile(areasJson);
const defaults = parseDefaults(defaultsJson);
const rates = parseRatesFile(ratesJson);
const taxRules = parseTaxRules(taxRulesJson);

function typical(area: Area) {
  const derived = deriveInputs({
    area,
    areas: areasFile,
    rates,
    defaults,
    selection: {
      areaSlug: area.slug,
      buyerType: defaults.defaultBuyerType,
      outlook: defaults.defaultPreset,
      nationOverride: null,
    },
  });
  const result = runModel(derived.inputs, taxRules);
  return { breakEvenYear: result.breakEvenYear, years: derived.inputs.years };
}

const plural = (n: number) => (n === 1 ? '1 year' : `${n} years`);

function expectedSentence(name: string, breakEvenYear: number | null, years: number): string {
  if (breakEvenYear === null) {
    return `At typical assumptions, renting in ${name} comes out ahead ${years === 1 ? 'over 1 year' : `for all ${years} years`}.`;
  }
  return `At typical assumptions, buying in ${name} pulls ahead after ${plural(breakEvenYear)}.`;
}

const NATION_LABEL: Record<Area['nation'], string> = {
  eng: 'England',
  sco: 'Scotland',
  wal: 'Wales',
  ni: 'Northern Ireland',
};

const money = (value: number) => `£${Math.round(value).toLocaleString('en-GB')}`;

let site: BuiltSite;

beforeAll(async () => {
  site = await loadSite();
});

describe('area page answers at typical assumptions', () => {
  it('covers every area in data/areas.json', () => {
    expect(areasFile.areas.length).toBeGreaterThan(300);
  });

  it('match an independent runModel(deriveInputs(...)) on every page', () => {
    const problems: string[] = [];
    for (const area of areasFile.areas) {
      const { breakEvenYear, years } = typical(area);
      const page = site.page(`rent-vs-buy/${area.slug}/`);
      const html = page.html;
      const where = `rent-vs-buy/${area.slug}/`;

      const numeral = elementByTestId(html, 'answer-numeral');
      const wantNumeral = String(breakEvenYear ?? years);
      if (!numeral || textOf(numeral.inner) !== wantNumeral) {
        problems.push(
          `${where}: answer numeral "${numeral && textOf(numeral.inner)}", want "${wantNumeral}"`,
        );
      }

      const answer = elementByTestId(html, 'answer');
      const wantKind = breakEvenYear === null ? 'no-break-even' : 'break-even';
      if (!answer || !answer.attrs.includes(`data-kind="${wantKind}"`)) {
        problems.push(`${where}: answer kind, want ${wantKind}`);
      }

      const headline = elementByTestId(html, 'answer-headline');
      const headlineText = headline ? textOf(headline.inner) : '';
      if (!headlineText.includes(wantNumeral) || !headlineText.endsWith(`in ${area.name}`)) {
        problems.push(`${where}: headline "${headlineText}"`);
      }

      const sentence = expectedSentence(area.name, breakEvenYear, years);
      const summary = elementByTestId(html, 'area-summary-answer');
      if (!summary || textOf(summary.inner) !== sentence) {
        problems.push(
          `${where}: summary "${summary && textOf(summary.inner)}", want "${sentence}"`,
        );
      }

      const description = page.meta.get('description') ?? '';
      // Figures the area takes from its nation are labelled as the nation's, never as local.
      const nationFigure = ` (${NATION_LABEL[area.nation]} figure)`;
      const priceLabel = area.fallbacks.includes('price') ? nationFigure : '';
      const rentLabel = area.fallbacks.includes('rent') ? nationFigure : '';
      const wantDescription = `${sentence} Average price ${money(area.price)}${priceLabel}, rent ${money(area.rent)} a month${rentLabel}.`;
      if (!description.startsWith(wantDescription)) {
        problems.push(
          `${where}: description "${description}", want it to start "${wantDescription}"`,
        );
      }
    }
    expect(problems).toEqual([]);
  });
});
