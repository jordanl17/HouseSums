import { describe, expect, it } from 'vitest';
import {
  assumptionsSentence,
  breakEvenCell,
  compareWords,
  comparisonSentence,
  figureRows,
  middleSentence,
  middleYear,
  monthLabel,
  nationNotes,
  nationSpread,
  possessive,
  priceToRentYears,
  quarterLabel,
  roundPercent,
  shortDataset,
  signedPercent,
  sourcesSentence,
  spreadSentence,
  summaryNotes,
  taxLabel,
  taxSummary,
  typicalDefinition,
  type AssumptionsInput,
  type SummaryInput,
} from './area-summary';
import type { TaxRegime } from './types';

const clamps = { houseGrowth: { min: 0, max: 0.06 }, rentGrowth: { min: 0.01, max: 0.06 } };

const leeds: SummaryInput = {
  name: 'Leeds',
  nation: 'eng',
  nationName: 'England',
  figures: { price: 247695, growth10y: 0.0419, rent: 1145, rentGrowth: 0.0423 },
  fallbacks: [],
  months: { price: '2026-07', rent: '2026-08' },
  nationFigures: {
    price: 293479,
    growth10y: 0.030192,
    rent: 1459,
    rentGrowth: 0.03995,
    months: { price: '2026-07', rent: '2026-08' },
  },
  used: { houseGrowth: 0.0419, rentGrowth: 0.0423 },
  clamps,
};

/** Every sentence must follow the brief's voice. */
function expectVoice(text: string) {
  expect(text).not.toMatch(/[—!]/);
  expect(text).not.toMatch(/\byou should\b/i);
  expect(text).not.toMatch(/ {2}/);
}

describe('formatters', () => {
  it('names months', () => {
    expect(monthLabel('2026-07')).toBe('July 2026');
    expect(monthLabel('2026-08', 'short')).toBe('Aug 2026');
    expect(monthLabel('nonsense')).toBe('nonsense');
    expect(monthLabel('2026-13')).toBe('2026-13');
  });

  it('names the quarter ending in a month', () => {
    expect(quarterLabel('2026-06')).toBe('April to June 2026');
    expect(quarterLabel('2026-03')).toBe('January to March 2026');
    expect(quarterLabel('2026-02')).toBe('December 2025 to February 2026');
  });

  it('formats percentages with a true minus and no trailing zeros where asked', () => {
    expect(signedPercent(0.0423)).toBe('+4.23%');
    expect(signedPercent(-0.005234)).toBe('−0.52%');
    expect(roundPercent(0.06)).toBe('6%');
    expect(roundPercent(0.045)).toBe('4.5%');
    expect(roundPercent(0.0517)).toBe('5.17%');
  });

  it('writes break-even cells', () => {
    expect(breakEvenCell(1, 25)).toBe('1 year');
    expect(breakEvenCell(6, 25)).toBe('6 years');
    expect(breakEvenCell(null, 25)).toBe('None in 25 years');
  });

  it('compares with the nation in whole per cent', () => {
    expect(compareWords(247695, 293479)).toBe('16% less than');
    expect(compareWords(1883, 1459)).toBe('29% more than');
    expect(compareWords(1000, 1003)).toBe('about the same as');
    expect(compareWords(1000, 0)).toBe('about the same as');
  });

  it('gives price as years of rent', () => {
    expect(priceToRentYears(247695, 1145)).toBe('18.0');
    expect(priceToRentYears(100, 0)).toBe('');
  });

  it('makes possessives', () => {
    expect(possessive('England')).toBe("England's");
    expect(possessive('Wales')).toBe("Wales's");
  });
});

describe('figure rows', () => {
  it('sets the area beside its nation with months', () => {
    const rows = figureRows(leeds);
    expect(rows.map((row) => [row.label, row.month, row.area.text, row.nation.text])).toEqual([
      ['Average price', 'Jul 2026', '£247,695', '£293,479'],
      ['Price growth a year, 10-year average', 'to Jul 2026', '4.19%', '3.02%'],
      ['Average monthly rent', 'Aug 2026', '£1,145', '£1,459'],
      ['Rent change over the year', 'to Aug 2026', '+4.23%', '+4.00%'],
      ['Price in years of rent', null, '18.0', '16.8'],
    ]);
    expect(rows.every((row) => !row.area.fallback && !row.nation.fallback)).toBe(true);
  });

  it('marks fallback figures as the nation figure', () => {
    const rows = figureRows({ ...leeds, fallbacks: ['rent', 'rentGrowth'] });
    // Price in years of rent is marked too: it is worked out using the nation's rent.
    expect(rows.filter((row) => row.area.fallback).map((row) => row.key)).toEqual([
      'rent',
      'rentGrowth',
      'priceToRent',
    ]);
  });

  it('shows the nation month in the cell when it differs from the area month', () => {
    const rows = figureRows({
      ...leeds,
      nationFigures: { ...leeds.nationFigures, months: { price: '2026-06', rent: '2026-08' } },
    });
    expect(rows[0]?.nation.text).toBe('£293,479 (Jun 2026)');
    expect(rows[2]?.nation.text).toBe('£1,459');
  });
});

describe('comparison sentence', () => {
  it('compares price and rent', () => {
    expect(comparisonSentence(leeds)).toBe(
      'An average home in Leeds costs 16% less than the England average, and rents for 22% less.',
    );
  });

  it('leaves out fallback figures', () => {
    expect(comparisonSentence({ ...leeds, fallbacks: ['rent', 'rentGrowth'] })).toBe(
      'An average home in Leeds costs 16% less than the England average.',
    );
    expect(comparisonSentence({ ...leeds, fallbacks: ['price', 'growth10y'] })).toBe(
      'An average rent in Leeds is 22% less than the England average.',
    );
    expect(
      comparisonSentence({ ...leeds, fallbacks: ['price', 'growth10y', 'rent', 'rentGrowth'] }),
    ).toBe('');
  });

  it('says when price and rent differ by the same margin', () => {
    const same = { ...leeds, figures: { ...leeds.figures, price: 293479, rent: 1459 } };
    expect(comparisonSentence(same)).toBe(
      'An average home in Leeds costs about the same as the England average, and rents for the same margin.',
    );
  });
});

describe('notes', () => {
  it('has none for an ordinary English area', () => {
    expect(summaryNotes(leeds)).toEqual([]);
  });

  it('says plainly when prices fell, and that the calculator floors growth at 0%', () => {
    const notes = summaryNotes({
      ...leeds,
      name: 'Aberdeen City',
      figures: { ...leeds.figures, growth10y: -0.039195 },
      used: { ...leeds.used, houseGrowth: 0 },
    });
    expect(notes).toEqual([
      'Average prices in Aberdeen City fell by 3.92% a year over the 10 years to July 2026. The calculator floors house price growth at 0%, so its answer assumes prices hold steady.',
    ]);
  });

  it('notes growth above the cap', () => {
    const notes = summaryNotes({
      ...leeds,
      figures: { ...leeds.figures, growth10y: 0.067785 },
      used: { ...leeds.used, houseGrowth: 0.06 },
    });
    expect(notes[0]).toBe(
      'Average prices in Leeds grew by 6.78% a year over the 10 years to July 2026. The calculator caps house price growth at 6% a year, so its answer uses 6%.',
    );
  });

  it('notes rent change outside the 1-6% range', () => {
    const fell = summaryNotes({
      ...leeds,
      figures: { ...leeds.figures, rentGrowth: -0.005234 },
      used: { ...leeds.used, rentGrowth: 0.01 },
    });
    expect(fell).toEqual([
      'Rents fell by 0.52% in the year to August 2026. The calculator assumes rent rises by at least 1% a year, so its answer uses 1%.',
    ]);
    const low = summaryNotes({
      ...leeds,
      figures: { ...leeds.figures, rentGrowth: 0.005 },
      used: { ...leeds.used, rentGrowth: 0.01 },
    });
    expect(low[0]).toMatch(/^Rents rose by 0\.50% in the year to August 2026\. .*at least 1%/);
    const high = summaryNotes({
      ...leeds,
      figures: { ...leeds.figures, rentGrowth: 0.133515 },
      used: { ...leeds.used, rentGrowth: 0.06 },
    });
    expect(high[0]).toBe(
      'Rents rose by 13.35% in the year to August 2026. The calculator caps rent increases at 6% a year, so its answer uses 6%.',
    );
  });

  it('labels fallbacks as the nation figure', () => {
    expect(
      summaryNotes({ ...leeds, name: 'City of London', fallbacks: ['rent', 'rentGrowth'] }),
    ).toEqual([
      "The source data has no local rent or rent change for City of London, so these are England's figures, marked in the table.",
    ]);
    expect(
      summaryNotes({
        ...leeds,
        name: 'Isles of Scilly',
        fallbacks: ['price', 'growth10y', 'rent', 'rentGrowth'],
      }),
    ).toEqual([
      "The source data has no local average price, 10-year price growth, rent or rent change for Isles of Scilly, so these are England's figures, marked in the table.",
    ]);
    expect(summaryNotes({ ...leeds, fallbacks: ['rent'] })[0]).toBe(
      "The source data has no local rent for Leeds, so this is England's figure, marked in the table.",
    );
  });

  it('explains Northern Ireland quarterly prices and Broad Rental Market Areas', () => {
    const notes = summaryNotes({
      ...leeds,
      name: 'Belfast',
      nation: 'ni',
      nationName: 'Northern Ireland',
      rentArea: 'Belfast',
      months: { price: '2026-06', rent: '2026-06' },
    });
    expect(notes).toEqual([
      'Northern Ireland prices are published each quarter, so the price is for April to June 2026.',
      'ONS publishes Northern Ireland rents for Broad Rental Market Areas (the areas used to set housing benefit), not councils. The rent here is for Belfast, the area ONS matches to Belfast.',
    ]);
  });

  it('gives the ONS name when the display name differs', () => {
    expect(summaryNotes({ ...leeds, name: 'Bristol', onsName: 'Bristol, City of' })).toEqual([
      'ONS lists Bristol as "Bristol, City of".',
    ]);
    expect(summaryNotes({ ...leeds, onsName: 'Leeds' })).toEqual([]);
  });
});

describe('nation notes', () => {
  it('explains quarterly prices and rents by Broad Rental Market Area', () => {
    expect(
      nationNotes({
        nation: 'eng',
        nationName: 'England',
        months: { price: '2026-07', rent: '2026-08' },
        rentsByArea: false,
      }),
    ).toEqual([]);
    expect(
      nationNotes({
        nation: 'ni',
        nationName: 'Northern Ireland',
        months: { price: '2026-06', rent: '2026-06' },
        rentsByArea: true,
      }),
    ).toEqual([
      'Northern Ireland prices are published each quarter, so these are for April to June 2026.',
      'ONS publishes Northern Ireland rents for Broad Rental Market Areas (the areas used to set housing benefit), not councils, so each area takes the rent for the one ONS matches to it.',
    ]);
  });
});

describe('assumptions sentence', () => {
  const base: AssumptionsInput = {
    buyerType: 'first',
    price: 247695,
    deposit: 24770,
    fixYears: 5,
    mortgageRate: 0.0517,
    rateMonth: '2026-09',
    houseGrowth: 0.0419,
    rentGrowth: 0.0423,
    investmentReturn: 0.05,
    years: 25,
  };

  it('spells out what typical means', () => {
    expect(assumptionsSentence(base)).toBe(
      'That is a first-time buyer with a 10% deposit of £24,770 and a 5-year fix at 5.17% (Bank of England, September 2026), with prices growing 4.19% a year, rent rising 4.23% a year and savings earning 5% a year, over 25 years.',
    );
  });

  it('covers steady prices and a cash purchase', () => {
    const text = assumptionsSentence({
      ...base,
      deposit: base.price,
      houseGrowth: 0,
      rateMonth: null,
    });
    expect(text).toContain('paying the whole £247,695 in cash');
    expect(text).toContain('prices holding steady');
    expect(text).not.toContain('catches up');
  });
});

describe('typical definition', () => {
  it('says what typical means on a nation page', () => {
    expect(
      typicalDefinition({
        buyerType: 'first',
        depositFraction: 0.1,
        fixYears: 5,
        investmentReturn: 0.05,
        years: 25,
      }),
    ).toBe(
      "Typical assumptions: a first-time buyer with a 10% deposit and a 5-year fix at the Bank of England's quoted rate for that loan-to-value, each area's own price growth and rent change within the calculator's limits, and savings earning 5% a year, over 25 years.",
    );
  });
});

describe('nation spread', () => {
  it('finds the middle year, counting no break-even as latest', () => {
    expect(middleYear([])).toBeNull();
    expect(middleYear([3, 1, 2])).toBe(2);
    expect(middleYear([4, 1, 2, 3])).toBe(2);
    expect(middleYear([null, 2, null])).toBeNull();
    expect(middleYear([null, 2, 5])).toBe(5);
  });

  it('describes the spread', () => {
    const spread = nationSpread([1, 2, 2, 3, 6, null], 25);
    expect(spread).toEqual({
      count: 6,
      middle: 2,
      withinCount: 4,
      within: 5,
      noneCount: 1,
      horizon: 25,
    });
    expect(spreadSentence(spread, 'Scotland')).toBe(
      "At typical assumptions, buying pulls ahead within 5 years in 4 of Scotland's 6 areas, and the middle answer is 2 years. Renting comes out ahead for all 25 years in 1 area.",
    );
    expect(spreadSentence(nationSpread([2, 2], 25), 'Wales')).toBe(
      "At typical assumptions, buying pulls ahead within 5 years in all 2 of Wales's areas, and the middle answer is 2 years.",
    );
    expect(middleSentence(spread, 'England')).toBe(
      "Across England's 6 areas, the middle answer at typical assumptions is 2 years.",
    );
    expect(middleSentence(nationSpread([null], 25), 'England')).toBe(
      "Across England's 1 area, the middle answer at typical assumptions is no break-even in 25 years.",
    );
  });
});

describe('sources sentence', () => {
  it('names each dataset and publisher', () => {
    expect(shortDataset('Price Index of Private Rents, UK: monthly price statistics')).toBe(
      'Price Index of Private Rents',
    );
    expect(shortDataset('Local authority district names and codes (LAD_APR_2025)')).toBe(
      'Local authority district names and codes',
    );
    expect(
      sourcesSentence([
        { dataset: 'UK House Price Index', publisher: 'HM Land Registry with ONS' },
        {
          dataset: 'Price Index of Private Rents, UK: monthly price statistics',
          publisher: 'Office for National Statistics',
        },
        { dataset: 'Quoted household interest rates', publisher: 'Bank of England' },
      ]),
    ).toBe(
      'Figures from the UK House Price Index (HM Land Registry with ONS), the Price Index of Private Rents (Office for National Statistics) and Quoted household interest rates (Bank of England).',
    );
    expect(sourcesSentence([])).toBe('');
  });
});

describe('tax summary', () => {
  const sdlt: TaxRegime = {
    name: 'Stamp Duty Land Tax',
    shortName: 'SDLT',
    plainName: 'stamp duty',
    bands: [
      { from: 0, to: 125000, rate: 0 },
      { from: 125000, to: null, rate: 0.05 },
    ],
    firstTimeBuyer: {
      bands: [
        { from: 0, to: 300000, rate: 0 },
        { from: 300000, to: null, rate: 0.05 },
      ],
      maxPrice: 500000,
    },
    additional: { kind: 'wholePriceSurcharge', rate: 0.05, minPrice: 40000 },
    sources: [],
  };

  it('labels the tax plain name first', () => {
    expect(taxLabel(sdlt)).toBe('Stamp duty (SDLT)');
    expect(
      taxLabel({
        name: 'Land and Buildings Transaction Tax',
        shortName: 'LBTT',
        plainName: 'land and buildings transaction tax',
      }),
    ).toBe('Land and Buildings Transaction Tax (LBTT)');
  });

  it('writes the rules from the data', () => {
    const lines = taxSummary({
      nationName: 'Northern Ireland',
      regime: sdlt,
      sharedWith: 'England',
      survey: 500,
      homeReport: 0,
      taxYear: '2026/27',
    });
    expect(lines).toEqual([
      "Stamp duty (SDLT) applies to homes bought in Northern Ireland, the same tax as in England. The buyer pays it once, at completion: each slice of the price is taxed at its band's rate.",
      'Nothing is due on the first £125,000, or the first £300,000 for a first-time buyer, on homes up to £500,000; above that there is no relief.',
      'Buying an additional home adds 5% of the whole price, from £40,000.',
      'Rates for the 2026/27 tax year.',
    ]);
    lines.forEach(expectVoice);
  });

  it('covers no relief, no price cap, a higher-rates table and the Home Report', () => {
    const wales = taxSummary({
      nationName: 'Wales',
      regime: {
        ...sdlt,
        name: 'Land Transaction Tax',
        shortName: 'LTT',
        plainName: 'land transaction tax',
        firstTimeBuyer: null,
        additional: { kind: 'higherRatesTable', bands: [], minPrice: 40000 },
      },
      sharedWith: null,
      survey: 500,
      homeReport: 0,
      taxYear: '2026/27',
    });
    expect(wales[1]).toBe(
      'Nothing is due on the first £125,000. There is no first-time buyer relief.',
    );
    expect(wales[2]).toBe(
      'An additional home is taxed on a higher-rates table instead, from £40,000.',
    );
    const scotland = taxSummary({
      nationName: 'Scotland',
      regime: {
        ...sdlt,
        name: 'Land and Buildings Transaction Tax',
        shortName: 'LBTT',
        plainName: 'land and buildings transaction tax',
        firstTimeBuyer: { bands: [{ from: 0, to: 175000, rate: 0 }], maxPrice: null },
        additional: { kind: 'wholePriceSurcharge', rate: 0.08, minPrice: 40000 },
      },
      sharedWith: null,
      survey: 0,
      homeReport: 600,
      taxYear: '2026/27',
    });
    expect(scotland).toContain(
      'Nothing is due on the first £125,000, or the first £175,000 for a first-time buyer, with no price limit.',
    );
    expect(scotland).toContain(
      'Buying an additional home adds 8% of the whole price (the Additional Dwelling Supplement), from £40,000.',
    );
    expect(scotland).toContain(
      "Sellers in Scotland pay for a Home Report (a survey and valuation), so the calculator sets the buyer's survey to £0 and adds £600 to the selling costs.",
    );
    [...wales, ...scotland].forEach(expectVoice);
  });
});
