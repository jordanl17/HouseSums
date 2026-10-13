import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bandRange,
  bandRows,
  choiceDefaultRows,
  defaultRows,
  fieldDefaultText,
  formatDateLong,
  formatFieldValue,
  formatMonthLong,
  formulaHtml,
  fallbackAreas,
  linkLabel,
  listText,
  missingSeries,
  OGL_ATTRIBUTION,
  presetAdjustText,
  presetTable,
  rateDeltaText,
  reasonText,
  REFRESH_SCHEDULE,
  regimeSummaries,
  seriesTerms,
  splitLinks,
  SOURCE_PROSE,
  sourceEntries,
  yearOf,
} from './content';
import { parseDefaults, parseRatesFile, parseSourcesFile, parseTaxRules } from './schema';
import { NUMERIC_INPUT_KEYS, type SourcesFile } from './types';

const read = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

const defaults = parseDefaults(read('data/defaults.json'));
const taxRules = parseTaxRules(read('data/taxRules.json'));
const sources = parseSourcesFile(read('data/sources.json'));
const rates = parseRatesFile(read('data/rates.json'));

describe('dates', () => {
  it('writes months and dates in full', () => {
    expect(formatMonthLong('2026-07')).toBe('July 2026');
    expect(formatMonthLong('2026-12')).toBe('December 2026');
    expect(formatMonthLong('2026-13')).toBe('2026-13');
    expect(formatMonthLong('soon')).toBe('soon');
    expect(formatDateLong('2026-10-13T15:23:47Z')).toBe('13 October 2026');
    expect(formatDateLong('2026-04-01')).toBe('1 April 2026');
    expect(formatDateLong('later')).toBe('later');
    expect(yearOf('2026-10-13T15:23:47Z')).toBe('2026');
  });
});

describe('formulaHtml', () => {
  const power = '<sup class="formula__power"><span class="visually-hidden">to the power of </span>';

  it('marks symbols, subscripts and powers', () => {
    expect(formulaHtml('{M} = {L} × {r}')).toBe('<var>M</var> = <var>L</var> × <var>r</var>');
    expect(formulaHtml('(1 + {r})^{−{n}}')).toBe(`(1 + <var>r</var>)${power}−<var>n</var></sup>`);
    expect(formulaHtml('{P}_{own,{y}}')).toBe('<var>P</var><sub>own,<var>y</var></sub>');
    expect(formulaHtml('(1 + g)^{1/12} − 1')).toBe(`(1 + g)${power}1/12</sup> − 1`);
  });

  it('escapes text and leaves unmatched marks alone', () => {
    expect(formulaHtml('a < b & "c"')).toBe('a &lt; b &amp; &quot;c&quot;');
    expect(formulaHtml('{x')).toBe('{x');
    expect(formulaHtml('x_y ^ 2')).toBe('x_y ^ 2');
    expect(formulaHtml('{<b>}')).toBe('<var>&lt;b&gt;</var>');
  });
});

describe('defaults', () => {
  it('formats a value in its unit', () => {
    expect(formatFieldValue(999, { unit: 'gbp' })).toBe('£999');
    expect(formatFieldValue(350, { unit: 'gbpPerYear' })).toBe('£350 a year');
    expect(formatFieldValue(1200, { unit: 'gbpPerMonth' })).toBe('£1,200 a month');
    expect(formatFieldValue(0.014, { unit: 'percent' })).toBe('1.4%');
    expect(formatFieldValue(0.025, { unit: 'percentPerYear' })).toBe('2.5% a year');
    expect(formatFieldValue(30, { unit: 'years' })).toBe('30 years');
    expect(formatFieldValue(1, { unit: 'years' })).toBe('1 year');
  });

  it('reads every default from defaults.json', () => {
    expect(fieldDefaultText('productFee', defaults)).toBe('£999');
    expect(fieldDefaultText('termYears', defaults)).toBe('30 years');
    expect(fieldDefaultText('maintenanceRate', defaults)).toBe('1% a year');
    expect(fieldDefaultText('agentFeeRate', defaults)).toBe('1.4%');
    expect(fieldDefaultText('survey', defaults)).toBe('£500 (Scotland £0)');
    expect(fieldDefaultText('homeReport', defaults)).toBe('£0 (Scotland £600)');
    expect(fieldDefaultText('deposit', defaults)).toBe('10% of the price');
    expect(fieldDefaultText('houseGrowth', defaults)).toBe(
      "Area's 10-year average, kept between 0% and 6%",
    );
    expect(fieldDefaultText('rentGrowth', defaults)).toBe(
      "Area's latest annual change, kept between 1% and 6%",
    );
    expect(fieldDefaultText('investmentReturn', defaults)).toBe('5% a year');
    expect(fieldDefaultText('rateAfterFix', defaults)).toBe('Same as the initial rate');
  });

  it('follows a change in the data', () => {
    const changed = structuredClone(defaults);
    changed.fields.productFee.default = 1499;
    changed.depositFraction = 0.15;
    changed.presets.typical.investmentReturn = 0.045;
    expect(fieldDefaultText('productFee', changed)).toBe('£1,499');
    expect(fieldDefaultText('deposit', changed)).toBe('15% of the price');
    expect(fieldDefaultText('investmentReturn', changed)).toBe('4.5% a year');
  });

  it('lists every field once, with its source note as the reason', () => {
    const { simple, advanced } = defaultRows(defaults);
    const keys = [...simple, ...advanced].map((row) => row.key);
    expect([...keys].sort()).toEqual([...NUMERIC_INPUT_KEYS].sort());
    expect(simple.map((row) => row.key)).toEqual([
      'price',
      'deposit',
      'rent',
      'mortgageRate',
      'houseGrowth',
    ]);
    for (const row of [...simple, ...advanced]) {
      expect(row.label).toBe(defaults.fields[row.key].label);
      expect(row.reason).toBe(reasonText(row.value, defaults.fields[row.key].source));
      expect(defaults.fields[row.key].source.toLowerCase()).toContain(
        row.reason.slice(1).toLowerCase(),
      );
      expect(row.value).not.toBe('');
      expect(row.value).not.toBe('Derived');
    }
  });
});

describe('presets', () => {
  it('words the preset adjustments', () => {
    expect(presetAdjustText({ add: 0, cap: null })).toBe("Area's figure");
    expect(presetAdjustText({ add: 0, cap: 0.015 })).toBe("Area's figure, at most 1.5%");
    expect(presetAdjustText({ add: 0.01, cap: 0.06 })).toBe("Area's figure + 1 point, at most 6%");
    expect(presetAdjustText({ add: -0.005, cap: null })).toBe("Area's figure − 0.5 points");
    expect(rateDeltaText(0)).toBe('Same as the initial rate');
    expect(rateDeltaText(0.005)).toBe('Initial rate + 0.5 points');
    expect(rateDeltaText(-0.005)).toBe('Initial rate − 0.5 points');
    expect(rateDeltaText(0.01)).toBe('Initial rate + 1 point');
  });

  it('builds the table from defaults.json, matching the decisions table', () => {
    const { columns, rows } = presetTable(defaults);
    expect(columns.map((c) => c.label)).toEqual(['Cautious', 'Typical', 'Optimistic']);
    expect(columns.find((c) => c.isDefault)?.name).toBe('typical');
    expect(rows.map((r) => r.assumption)).toEqual([
      'House price growth',
      'Rent increases',
      'Investment return',
      'Rate after the fix',
    ]);
    expect(rows[0]?.values).toEqual({
      cautious: "Area's figure, at most 1.5%",
      typical: "Area's figure",
      optimistic: "Area's figure + 1 point, at most 6%",
    });
    expect(rows[2]?.values).toEqual({
      cautious: '3.5% a year',
      typical: '5% a year',
      optimistic: '6.5% a year',
    });
    expect(rows[3]?.values.cautious).toBe('Initial rate + 0.5 points');
  });
});

describe('property tax', () => {
  it('words band ranges as GOV.UK does', () => {
    expect(bandRange({ from: 0, to: 125000, rate: 0 })).toBe('Up to £125,000');
    expect(bandRange({ from: 125000, to: 250000, rate: 0.02 })).toBe('£125,001 to £250,000');
    expect(bandRange({ from: 1500000, to: null, rate: 0.12 })).toBe('Above £1,500,000');
    expect(bandRange({ from: 0, to: null, rate: 0.05 })).toBe('The whole price');
    expect(bandRows([{ from: 400000, to: 750000, rate: 0.075 }])).toEqual([
      { range: '£400,001 to £750,000', rate: '7.5%' },
    ]);
  });

  it('summarises each regime from taxRules.json', () => {
    const [sdlt, lbtt, ltt] = regimeSummaries(taxRules);
    expect(sdlt?.name).toBe('Stamp Duty Land Tax (SDLT)');
    expect(sdlt?.nations).toEqual(['England', 'Northern Ireland']);
    expect(sdlt?.main[0]).toEqual({ range: 'Up to £125,000', rate: '0%' });
    expect(sdlt?.main).toHaveLength(taxRules.regimes.sdlt.bands.length);
    expect(sdlt?.firstTimeBuyer?.rows).toEqual([
      { range: 'Up to £300,000', rate: '0%' },
      { range: 'Above £300,000', rate: '5%' },
    ]);
    expect(sdlt?.firstTimeBuyer?.note).toContain('up to a price of £500,000');
    expect(sdlt?.additional.note).toBe(
      'On an additional property costing £40,000 or more, the higher rates for additional properties add 5% of the whole price on top of the main rates.',
    );

    expect(lbtt?.nations).toEqual(['Scotland']);
    expect(lbtt?.firstTimeBuyer?.note).toContain('at any price');
    expect(lbtt?.firstTimeBuyer?.rows[0]).toEqual({ range: 'Up to £175,000', rate: '0%' });
    expect(lbtt?.additional.note).toContain('Additional Dwelling Supplement (ADS) adds 8%');

    expect(ltt?.nations).toEqual(['Wales']);
    expect(ltt?.firstTimeBuyer).toBeNull();
    expect(ltt?.additional.rows?.at(-1)).toEqual({ range: 'Above £1,500,000', rate: '17%' });
    expect(ltt?.main[1]).toEqual({ range: '£225,001 to £400,000', rate: '6%' });
  });
});

describe('sources', () => {
  it('has plain words for every dataset in sources.json', () => {
    for (const source of sources.sources) {
      expect(SOURCE_PROSE[source.id], `SOURCE_PROSE is missing "${source.id}"`).toBeDefined();
    }
  });

  it('gives each dataset its month, use and attribution', () => {
    const entries = sourceEntries(sources);
    expect(entries.map((e) => e.source.id)).toEqual(sources.sources.map((s) => s.id));
    const hpi = entries.find((e) => e.source.id === 'uk-hpi');
    expect(hpi?.asOf).toBe(formatMonthLong(sources.sources[0]?.asOf ?? ''));
    expect(hpi?.attribution).toBe(
      `Contains HM Land Registry data © Crown copyright and database right ${yearOf(sources.generatedAt)}. This data is licensed under the Open Government Licence v3.0.`,
    );
    for (const entry of entries) {
      expect(entry.geography).toBeTruthy();
      expect(entry.usedFor).toBeTruthy();
      expect(entry.attribution).toBeTruthy();
    }
  });

  it('falls back to the OGL statement for a new OGL dataset, and to nothing otherwise', () => {
    const file: SourcesFile = {
      schemaVersion: 1,
      generatedAt: '2027-01-20T06:17:00Z',
      sources: [
        {
          id: 'new-ogl',
          dataset: 'New',
          publisher: 'ONS',
          url: 'https://example.org/',
          licence: 'Open Government Licence v3.0',
          asOf: '2026-12',
        },
        {
          id: 'other',
          dataset: 'Other',
          publisher: 'Someone',
          url: 'https://example.org/',
          licence: 'CC BY 4.0',
          asOf: '2026-12',
        },
      ],
    };
    const [ogl, other] = sourceEntries(file);
    expect(ogl?.attribution).toBe(OGL_ATTRIBUTION);
    expect(ogl?.geography).toBeNull();
    expect(other?.attribution).toBeNull();
    expect(other?.asOf).toBe('December 2026');
  });

  it('reads the fix and loan-to-value from every Bank of England series description', () => {
    const boe = sources.sources.find((s) => s.id === 'boe-quoted-rates');
    expect(boe?.series?.length).toBe(rates.rates.length);
    for (const series of boe?.series ?? []) {
      const terms = seriesTerms(series.description);
      const rate = rates.rates.find((r) => r.series === series.code);
      expect(terms, series.code).toEqual({ fixYears: rate?.fixYears, ltv: rate?.ltv });
    }
    expect(seriesTerms('something else')).toBeNull();
  });
});

describe('rates and areas for the Sources page', () => {
  it('finds the series the Bank does not publish and the band used instead', () => {
    expect(missingSeries(rates)).toEqual([{ fixYears: 5, ltv: 0.85, usesLtv: 0.9 }]);
    expect(
      missingSeries({
        rates: [
          { fixYears: 2, ltv: 0.6, rate: 0.05, series: 'A' },
          { fixYears: 2, ltv: 0.95, rate: 0.06, series: 'B' },
          { fixYears: 5, ltv: 0.6, rate: 0.05, series: 'C' },
        ],
      }),
    ).toEqual([{ fixYears: 5, ltv: 0.95, usesLtv: null }]);
  });

  it('lists the areas that use a nation figure', () => {
    expect(listText([])).toBe('');
    expect(listText(['a'])).toBe('a');
    expect(listText(['a', 'b', 'c'])).toBe('a, b and c');
    expect(
      fallbackAreas([
        { slug: 'leeds', name: 'Leeds', nation: 'eng', fallbacks: [] },
        {
          slug: 'isles-of-scilly',
          name: 'Isles of Scilly',
          nation: 'eng',
          fallbacks: ['rentGrowth', 'price', 'rent'],
        },
        {
          slug: 'city-of-london',
          name: 'City of London',
          nation: 'eng',
          fallbacks: ['rent', 'rentGrowth'],
        },
      ]),
    ).toEqual([
      {
        slug: 'city-of-london',
        name: 'City of London',
        nation: 'England',
        fields: 'average rent and annual rent change',
      },
      {
        slug: 'isles-of-scilly',
        name: 'Isles of Scilly',
        nation: 'England',
        fields: 'average price, average rent and annual rent change',
      },
    ]);
  });
});

describe('splitLinks', () => {
  it('turns https addresses into links and leaves the rest as text', () => {
    expect(splitLinks('File: https://example.org/a.csv. Done')).toEqual([
      { text: 'File: ' },
      { text: 'https://example.org/a.csv', href: 'https://example.org/a.csv' },
      { text: '. Done' },
    ]);
    expect(splitLinks('(see https://example.org/legal)')).toEqual([
      { text: '(see ' },
      { text: 'https://example.org/legal', href: 'https://example.org/legal' },
      { text: ')' },
    ]);
    expect(splitLinks('plain bankofengland.co.uk/legal')).toEqual([
      { text: 'plain bankofengland.co.uk/legal' },
    ]);
    expect(splitLinks('')).toEqual([]);
  });

  it('labels a file link with its file name', () => {
    expect(
      linkLabel(
        'https://publicdata.landregistry.gov.uk/market-trend-data/house-price-index-data/Average-prices-2026-07.csv',
      ),
    ).toBe('Average-prices-2026-07.csv');
    expect(linkLabel('https://www.ons.gov.uk/file?uri=/economy/x/16september2026/rents.xlsx')).toBe(
      'rents.xlsx',
    );
    expect(linkLabel('https://geoportal.statistics.gov.uk/')).toBe('geoportal.statistics.gov.uk');
    expect(linkLabel('not a url')).toBe('not a url');
  });
});

describe('refresh schedule', () => {
  it('matches the cron in the refresh workflow', () => {
    const workflow = readFileSync(
      new URL('../../.github/workflows/refresh-data.yml', import.meta.url),
      'utf8',
    );
    const crons = [...workflow.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(crons).toEqual([REFRESH_SCHEDULE.cron]);
    // Day-of-month field is what the page says.
    expect(REFRESH_SCHEDULE.cron.split(' ')[2]).toBe('20');
    expect(REFRESH_SCHEDULE.text).toContain('20th');
  });
});

describe('reasonText', () => {
  it('drops clauses that only repeat the starting figure', () => {
    expect(reasonText("Area's average", 'Area average, UK House Price Index, latest month')).toBe(
      'UK House Price Index, latest month',
    );
    expect(
      reasonText('10% of the price', '10% of the price, a typical first-time buyer loan-to-value'),
    ).toBe('A typical first-time buyer loan-to-value');
    expect(
      reasonText(
        'Bank of England quoted rate',
        'Bank of England quoted rates, matched to your loan-to-value band and fix length',
      ),
    ).toBe('Matched to your loan-to-value band and fix length');
    expect(
      reasonText(
        'Same as the initial rate',
        'Same as the initial rate: assumes you remortgage rather than pay the standard variable rate',
      ),
    ).toBe('Assumes you remortgage rather than pay the standard variable rate');
  });

  it('keeps a note that does not repeat, or would be emptied', () => {
    expect(reasonText('£999', 'A typical lender arrangement fee')).toBe(
      'A typical lender arrangement fee',
    );
    expect(reasonText('Same', 'Same')).toBe('Same');
  });
});

describe('choiceDefaultRows', () => {
  it('reads the buyer type and nation defaults from defaults.json', () => {
    const rows = choiceDefaultRows(defaults);
    expect(rows.map((row) => row.key)).toEqual(['nation', 'buyerType']);
    expect(rows[1]?.value).toBe('First-time buyer');
    expect(rows[0]?.value).toContain('England');
  });
});
