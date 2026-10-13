import { describe, expect, it } from 'vitest';
import { QUOTED_RATE_SERIES, descriptionMatches, iadbUrl, parseIadbCsv } from './boe.ts';
import { parseCsv, parseCsvObjects } from './csv.ts';
import { IADB_TT, HPI_SERIES, hpiCsv, makeZip, piprRows, serial } from './fixtures.ts';
import { latestLadService, parseLadQuery } from './geography.ts';
import { parseHpiAveragePrices, priceFigures, quarterlyMonth } from './hpi.ts';
import { parsePiprRows, rentAreaKey, rentFigures, seriesKey } from './pipr.ts';
import { serviceMonth } from './sources.ts';
import { addMonths, monthsBetween, slugify, toMonth, toNumber } from './util.ts';
import { columnIndex, parseSheetXml, readXlsxSheet } from './xlsx.ts';

describe('csv', () => {
  it('handles quotes, doubled quotes, commas and newlines in fields, CRLF and a BOM', () => {
    const text = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line\nbreak",\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['2', 'line\nbreak', ''],
    ]);
  });

  it('maps rows to objects by header', () => {
    expect(parseCsvObjects('Date,Price\n2026-07-01,100\n')).toEqual([
      { Date: '2026-07-01', Price: '100' },
    ]);
  });
});

describe('util', () => {
  it('reads months from every shape the sources use', () => {
    expect(toMonth(serial('2026-08'))).toBe('2026-08');
    expect(toMonth('46235')).toBe('2026-08');
    expect(toMonth('2026-07-01')).toBe('2026-07');
    expect(toMonth('2026-07')).toBe('2026-07');
    expect(toMonth('30 Sep 2026')).toBe('2026-09');
    expect(toMonth('September 2026')).toBe('2026-09');
    expect(toMonth('Time period')).toBeNull();
    expect(toMonth('2026-13-01')).toBeNull();
  });

  it('reads numbers and treats the ONS missing-value markers as null', () => {
    expect(toNumber('3.8146710000000001')).toBeCloseTo(3.814671);
    expect(toNumber('1,234')).toBe(1234);
    expect(toNumber('-0.5')).toBe(-0.5);
    for (const missing of ['[x]', '[z]', '[c]', '', '..', '-', 'n/a', undefined]) {
      expect(toNumber(missing)).toBeNull();
    }
  });

  it('adds and counts months across years', () => {
    expect(addMonths('2026-07', -120)).toBe('2016-07');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2025-12', '2026-08')).toBe(8);
  });

  it('slugs follow ONS names, lowercased and hyphenated', () => {
    expect(slugify('Leeds')).toBe('leeds');
    expect(slugify('Glasgow City')).toBe('glasgow-city');
    expect(slugify('Kingston upon Hull, City of')).toBe('kingston-upon-hull-city-of');
    expect(slugify("King's Lynn and West Norfolk")).toBe('kings-lynn-and-west-norfolk');
    expect(slugify('St. Helens')).toBe('st-helens');
    expect(slugify('Na h-Eileanan Siar')).toBe('na-h-eileanan-siar');
    expect(slugify('Armagh City, Banbridge and Craigavon')).toBe(
      'armagh-city-banbridge-and-craigavon',
    );
    expect(slugify('Ynys Môn')).toBe('ynys-mon');
    expect(slugify('  Bournemouth, Christchurch and Poole ')).toBe(
      'bournemouth-christchurch-and-poole',
    );
  });
});

describe('xlsx', () => {
  const workbook = `<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="Cover sheet" sheetId="1" r:id="rId1"/><sheet name="Table 1" sheetId="2" r:id="rId2"/></sheets></workbook>`;
  const rels = `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`;
  const shared = `<sst><si><t>Time period</t></si><si><r><t>Area </t></r><r><t>name</t></r></si><si><t>Leeds &amp; Bradford</t></si></sst>`;
  const sheet = `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>46235</v></c><c r="B2" t="inlineStr"><is><t>E08000035</t></is></c><c r="C2" t="s"><v>2</v></c><c r="D2"/><c r="Z2"><v>9</v></c></row></sheetData></worksheet>`;

  it('reads a named sheet with shared, rich and inline strings and gaps', () => {
    const file = makeZip({
      'xl/workbook.xml': workbook,
      'xl/_rels/workbook.xml.rels': rels,
      'xl/sharedStrings.xml': shared,
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData/></worksheet>',
      'xl/worksheets/sheet2.xml': sheet,
    });
    expect(readXlsxSheet(file, 'Table 1', 8)).toEqual([
      ['Time period', '', 'Area name'],
      ['46235', 'E08000035', 'Leeds & Bradford', ''],
    ]);
    expect(() => readXlsxSheet(file, 'Table 9')).toThrow(/sheet "Table 9" not found/);
  });

  it('rejects files that are not zips', () => {
    expect(() => readXlsxSheet(Buffer.from('not a zip at all, just text'), 'Table 1')).toThrow(
      /not a zip/,
    );
  });

  it('converts column letters', () => {
    expect(columnIndex('A')).toBe(0);
    expect(columnIndex('Z')).toBe(25);
    expect(columnIndex('AA')).toBe(26);
    expect(columnIndex('AN')).toBe(39);
    expect(parseSheetXml('<row><c r="B1"><v>1</v></c></row>', [])).toEqual([['', '1']]);
  });
});

describe('UK HPI', () => {
  const prices = parseHpiAveragePrices(hpiCsv(HPI_SERIES));

  it('parses every area by code', () => {
    expect(prices.size).toBe(HPI_SERIES.length);
    expect(prices.get('E08000035')?.prices.get('2026-07')).toBe(250000);
  });

  it('takes the latest price and the 10-year compound growth', () => {
    const leeds = priceFigures(prices.get('E08000035')!, false);
    expect(leeds).toEqual({ price: 250000, growth10y: expect.closeTo(0.04, 4), month: '2026-07' });
  });

  it('dates Northern Ireland to the quarter its figure belongs to', () => {
    const belfast = prices.get('N09000003')!;
    expect(quarterlyMonth(belfast, '2026-07')).toBe('2026-06');
    const figures = priceFigures(belfast, true);
    expect(figures?.month).toBe('2026-06');
    expect(figures?.price).toBe(180000);
    expect(figures?.growth10y).toBeCloseTo(0.03, 4);
  });

  it('gives null growth when the price 10 years earlier is missing', () => {
    const short = parseHpiAveragePrices(
      'Date,Region_Name,Area_Code,Average_Price\n2025-07-01,X,E06000099,100000\n2026-07-01,X,E06000099,110000\n',
    );
    expect(priceFigures(short.get('E06000099')!, false)).toEqual({
      price: 110000,
      growth10y: null,
      month: '2026-07',
    });
  });

  it('fails loudly when a column is renamed', () => {
    expect(() => parseHpiAveragePrices('Date,Name,Code,Price\n')).toThrow(/missing columns/);
  });
});

describe('ONS private rents', () => {
  const rows = piprRows([
    { code: 'E08000035', name: 'Leeds', rent: 1150, annual: 4.2 },
    { code: 'S33000009', name: 'Greater Glasgow', rent: 1270, annual: 1.25 },
    { code: '[z]', name: 'Belfast BRMA', rent: 1130, annual: 2.9, month: '2026-06' },
    {
      code: '[z]',
      name: 'South East Northern Ireland BRMA',
      rent: 950,
      annual: 1,
      month: '2026-06',
    },
    { code: 'N92000002', name: 'Northern Ireland', rent: null, annual: null },
  ]);
  // NI rows for the two months after June are "[x]", as in the real file.
  rows.push([
    serial('2026-07'),
    '[z]',
    'Belfast BRMA',
    'Northern Ireland',
    '[x]',
    '[x]',
    '[x]',
    '[x]',
  ]);
  const rents = parsePiprRows(rows);

  it('keys by code, and by name where ONS gives no code (NI BRMAs)', () => {
    expect([...rents.keys()].sort()).toEqual(
      [
        'E08000035',
        'N92000002',
        'S33000009',
        'name:belfast',
        'name:south east northern ireland',
      ].sort(),
    );
    expect(seriesKey(null, 'Belfast BRMA')).toBe('name:belfast');
    expect(rentAreaKey('Renfrewshire/Inverclyde')).toBe('renfrewshire/inverclyde');
  });

  it('takes the latest month with both a rent and an annual change, as a decimal', () => {
    expect(rentFigures(rents.get('E08000035')!)).toEqual({
      rent: 1150,
      rentGrowth: 0.042,
      month: '2026-08',
    });
    expect(rentFigures(rents.get('name:belfast')!)).toEqual({
      rent: 1130,
      rentGrowth: 0.029,
      month: '2026-06',
    });
    expect(rentFigures(rents.get('N92000002')!)).toBeNull();
  });

  it('fails loudly when the header row is missing or renamed', () => {
    expect(() => parsePiprRows([['Something else']])).toThrow(/Time period/);
    expect(() => parsePiprRows([['Time period', 'Area code', 'Area name']])).toThrow(
      /missing columns/,
    );
  });
});

describe('Bank of England IADB', () => {
  const data = parseIadbCsv(IADB_TT);

  it('reads descriptions and observations as decimals', () => {
    expect(data.descriptions.size).toBe(9);
    expect(data.observations.get('IUMBV34')).toEqual([
      { month: '2026-08', value: 0.042 },
      { month: '2026-09', value: 0.041 },
    ]);
  });

  it('checks each configured series against its description', () => {
    for (const s of QUOTED_RATE_SERIES) {
      expect(descriptionMatches(data.descriptions.get(s.code)!, s), s.code).toBe(true);
    }
    const btl =
      'Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 2 year (75% LTV) buy to let fixed rate mortgage to households';
    expect(descriptionMatches(btl, { code: 'X', fixYears: 2, ltv: 0.75 })).toBe(false);
    expect(
      descriptionMatches(data.descriptions.get('IUMBV34')!, { code: 'X', fixYears: 5, ltv: 0.75 }),
    ).toBe(false);
  });

  it('configures 2-year fixes at every LTV band and the 5-year bands the Bank publishes', () => {
    expect(QUOTED_RATE_SERIES.filter((s) => s.fixYears === 2).map((s) => s.ltv)).toEqual([
      0.6, 0.75, 0.85, 0.9, 0.95,
    ]);
    expect(QUOTED_RATE_SERIES.filter((s) => s.fixYears === 5).map((s) => s.ltv)).toEqual([
      0.6, 0.75, 0.9, 0.95,
    ]);
  });

  it('builds the CSV URL with the codes and start month', () => {
    const url = iadbUrl(['IUMBV34', 'IUMBV42'], new Date(Date.UTC(2025, 8, 1)));
    expect(url).toContain('SeriesCodes=IUMBV34%2CIUMBV42');
    expect(url).toContain('Datefrom=01%2FSep%2F2025');
    expect(url).toContain('CSVF=TT');
  });

  it('rejects an HTML error page', () => {
    expect(() => parseIadbCsv('<!DOCTYPE html><html><body>Error</body></html>')).toThrow(
      /HTML page/,
    );
  });
});

describe('ONS geography', () => {
  it('picks the newest names-and-codes service', () => {
    expect(
      latestLadService([
        'LAD_DEC_2024_UK_NC',
        'LAD_APR_2023_UK_NC',
        'LAD_APR_2025_UK_NC_v2',
        'LAD_MAY_2025_UK_BFC_V2',
        'LAD_DEC_2022_UK_NC',
      ]),
    ).toBe('LAD_APR_2025_UK_NC_v2');
    expect(latestLadService(['nothing'])).toBeNull();
    expect(serviceMonth('LAD_APR_2025_UK_NC_v2')).toBe('2025-04');
  });

  it('reads LAD codes and names whatever the year suffix, keeping only local authorities', () => {
    const json = {
      features: [
        { attributes: { LAD25CD: 'E08000035', LAD25NM: 'Leeds', ObjectId: 1 } },
        { attributes: { LAD25CD: 'N09000003', LAD25NM: 'Belfast ', ObjectId: 2 } },
        { attributes: { LAD25CD: 'E92000001', LAD25NM: 'England', ObjectId: 3 } },
      ],
    };
    expect(parseLadQuery(json)).toEqual([
      { code: 'E08000035', name: 'Leeds' },
      { code: 'N09000003', name: 'Belfast' },
    ]);
    expect(() => parseLadQuery({ features: [], exceededTransferLimit: true })).toThrow(/truncated/);
  });
});
