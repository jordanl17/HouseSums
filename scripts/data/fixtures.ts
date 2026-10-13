/**
 * Small, made-up source extracts for the pipeline's unit tests. The shapes copy the real files
 * (UK HPI Average-prices CSV, ONS PIPR Table 1, Bank of England IADB CSV, ONS ArcGIS LAD query);
 * the figures are invented round numbers and never reach data/.
 */
import { deflateRawSync } from 'node:zlib';
import type { AreasFile } from '../../src/lib/types.ts';
import type { BrmaMap } from './brma.ts';
import { addMonths } from './util.ts';

/** HPI rows for each code: a flat price history from 2016-01 to `latest`, growing by `growth` a year. */
export function hpiCsv(
  series: {
    code: string;
    name: string;
    latestPrice: number;
    growth?: number;
    quarterly?: boolean;
  }[],
  latest = '2026-07',
): string {
  const lines = [
    'Date,Region_Name,Area_Code,Average_Price,Monthly_Change,Annual_Change,Average_Price_SA',
  ];
  for (let m = '2016-01'; m <= latest; m = addMonths(m, 1)) {
    for (const s of series) {
      const growth = s.growth ?? 0.03;
      let month = m;
      if (s.quarterly) {
        // Quarter figure repeated for each month; the latest quarter (Apr-Jun) carried into July.
        const [y, mm] = m.split('-').map(Number) as [number, number];
        const qEnd = `${y}-${String(Math.ceil(mm / 3) * 3).padStart(2, '0')}`;
        month = qEnd > '2026-06' ? '2026-06' : qEnd;
      }
      const yearsBack = monthsBack(month, s.quarterly ? '2026-06' : latest) / 12;
      const price = Math.round(s.latestPrice / (1 + growth) ** yearsBack);
      const name = s.name.includes(',') ? `"${s.name}"` : s.name;
      lines.push(`${m}-01,${name},${s.code},${price},0.1,3.0,`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function monthsBack(month: string, latest: string): number {
  const [ay, am] = month.split('-').map(Number) as [number, number];
  const [by, bm] = latest.split('-').map(Number) as [number, number];
  return by * 12 + bm - (ay * 12 + am);
}

/** Excel serial for the first of a month. */
export function serial(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return String((Date.UTC(y, m - 1, 1) - Date.UTC(1899, 11, 30)) / 86400000);
}

export const PIPR_HEADER = [
  'Time period',
  'Area code',
  'Area name',
  'Region or country name',
  'Index',
  'Monthly change',
  'Annual change',
  'Rental price',
];

/** PIPR Table 1 rows: title rows, header, then two months per area. `rent: null` writes "[x]". */
export function piprRows(
  areas: {
    code: string;
    name: string;
    rent: number | null;
    annual: number | null;
    month?: string;
  }[],
): string[][] {
  const rows: string[][] = [
    ['Price Index of Private Rents, UK: monthly price statistics [note 1]'],
    ['This worksheet contains one table.'],
    PIPR_HEADER,
  ];
  for (const a of areas) {
    const latest = a.month ?? '2026-08';
    for (const month of [addMonths(latest, -1), latest]) {
      rows.push([
        serial(month),
        a.code,
        a.name,
        '[z]',
        '100.5',
        '0.3',
        a.annual === null ? '[x]' : String(a.annual),
        a.rent === null ? '[x]' : String(month === latest ? a.rent : a.rent - 5),
      ]);
    }
  }
  return rows;
}

export const IADB_TT = `SERIES,DESCRIPTION
IUMZICQ,Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 2 year (60% LTV) fixed rate mortgage to households (in percent) not seasonally adjusted
IUMBV34,Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 2 year (75% LTV) fixed rate mortgage to households (in percent) not seasonally adjusted
IUMZICR,Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 2 year (85% LTV) fixed rate mortgage to households (in percent) not seasonally adjusted
IUMB482,Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 2 year (90% LTV) fixed rate mortgage to households (in percent) not seasonally adjusted
IUM2WTL,Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 2 year (95% LTV) fixed rate mortgage to households (in percent) not seasonally adjusted
IUMZO27,Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 5 year (60% LTV) fixed rate mortgage to households (in percent) not seasonally adjusted
IUMBV42,Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 5 year (75% LTV) fixed rate mortgage to households (in percent) not seasonally adjusted
IUMZO28,Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 5 year (90% LTV) fixed rate mortgage to households (in percent) not seasonally adjusted
IUM5WTL,Monthly interest rate of UK monetary financial institutions (excl. Central Bank) sterling 5 year (95% LTV) fixed rate mortgage to households (in percent) not seasonally adjusted

DATE,IUMZICQ,IUMBV34,IUMZICR,IUMB482,IUM2WTL,IUMZO27,IUMBV42,IUMZO28,IUM5WTL
31 Aug 2026,4.1,4.2,4.3,4.4,4.5,4.1,4.2,4.4,4.5
30 Sep 2026,4,4.1,4.2,4.3,4.4,4,4.1,4.3,4.4
`;

export const LADS = [
  { code: 'E08000035', name: 'Leeds' },
  { code: 'E09000033', name: 'Westminster' },
  { code: 'E06000053', name: 'Isles of Scilly' },
  { code: 'W06000015', name: 'Cardiff' },
  { code: 'S12000049', name: 'Glasgow City' },
  { code: 'N09000003', name: 'Belfast' },
];

export const BRMA_MAP: BrmaMap = {
  schemaVersion: 1,
  description: 'test',
  method: 'test',
  source: { title: 'test', url: 'https://example.org/', checked: '2026-10-13' },
  areas: [
    {
      code: 'S12000049',
      name: 'Glasgow City',
      rentArea: 'Greater Glasgow',
      rentAreaCode: 'S33000009',
    },
    { code: 'N09000003', name: 'Belfast', rentArea: 'Belfast', rentAreaCode: null },
  ],
};

export const HPI_SERIES = [
  { code: 'E92000001', name: 'England', latestPrice: 300000 },
  { code: 'S92000003', name: 'Scotland', latestPrice: 200000 },
  { code: 'W92000004', name: 'Wales', latestPrice: 210000 },
  { code: 'N92000002', name: 'Northern Ireland', latestPrice: 190000, quarterly: true },
  { code: 'E08000035', name: 'Leeds', latestPrice: 250000, growth: 0.04 },
  { code: 'E09000033', name: 'City of Westminster', latestPrice: 900000, growth: 0.01 },
  { code: 'W06000015', name: 'Cardiff', latestPrice: 260000 },
  { code: 'S12000049', name: 'City of Glasgow', latestPrice: 190000 },
  { code: 'N09000003', name: 'Belfast', latestPrice: 180000, quarterly: true },
];

export const PIPR_AREAS = [
  { code: 'E92000001', name: 'England', rent: 1450, annual: 4 },
  { code: 'S92000003', name: 'Scotland', rent: 1000, annual: 1 },
  { code: 'W92000004', name: 'Wales', rent: 850, annual: 4.3 },
  { code: 'N92000002', name: 'Northern Ireland', rent: 870, annual: 1.6, month: '2026-06' },
  { code: 'E08000035', name: 'Leeds', rent: 1150, annual: 4.2 },
  { code: 'E09000033', name: 'Westminster', rent: 3200, annual: -0.6 },
  { code: 'W06000015', name: 'Cardiff', rent: 1180, annual: 3.5 },
  { code: 'S33000009', name: 'Greater Glasgow', rent: 1270, annual: 1.25 },
  { code: '[z]', name: 'Belfast BRMA', rent: 1130, annual: 2.9, month: '2026-06' },
];

/** A minimal valid AreasFile with two areas, for check tests. */
export function areasFile(overrides: Partial<AreasFile> = {}): AreasFile {
  return {
    schemaVersion: 1,
    generatedAt: '2026-10-20T06:20:00Z',
    asOf: { price: '2026-07', rent: '2026-08' },
    nations: {
      eng: { price: 300000, growth10y: 0.03, rent: 1450, rentGrowth: 0.04 },
      sco: { price: 200000, growth10y: 0.03, rent: 1000, rentGrowth: 0.01 },
      wal: { price: 210000, growth10y: 0.03, rent: 850, rentGrowth: 0.043 },
      ni: { price: 190000, growth10y: 0.05, rent: 870, rentGrowth: 0.016 },
    },
    areas: [
      {
        code: 'N09000003',
        slug: 'belfast',
        name: 'Belfast',
        nation: 'ni',
        price: 180000,
        growth10y: 0.05,
        rent: 1130,
        rentGrowth: 0.029,
        fallbacks: [],
        rentArea: 'Belfast',
      },
      {
        code: 'W06000015',
        slug: 'cardiff',
        name: 'Cardiff',
        nation: 'wal',
        price: 260000,
        growth10y: 0.03,
        rent: 1180,
        rentGrowth: 0.035,
        fallbacks: [],
      },
      {
        code: 'S12000049',
        slug: 'glasgow-city',
        name: 'Glasgow City',
        nation: 'sco',
        price: 190000,
        growth10y: 0.03,
        rent: 1270,
        rentGrowth: 0.0125,
        fallbacks: [],
        rentArea: 'Greater Glasgow',
      },
      {
        code: 'E08000035',
        slug: 'leeds',
        name: 'Leeds',
        nation: 'eng',
        price: 250000,
        growth10y: 0.04,
        rent: 1150,
        rentGrowth: 0.042,
        fallbacks: [],
      },
    ],
    ...overrides,
  };
}

/** Builds a zip (deflated entries, CRCs left at 0, which the reader does not check). */
export function makeZip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = deflateRawSync(Buffer.from(text, 'utf8'));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(text), 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(Buffer.byteLength(text), 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
