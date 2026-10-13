/** Builds data/sources.json: every dataset the pipeline used, with publisher, licence and month. */
import type { DataSource, Month, SourcesFile } from '../../src/lib/types.ts';
import { QUOTED_RATE_SERIES } from './boe.ts';

export const OGL = 'Open Government Licence v3.0';
export const OGL_URL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';

export interface SourcesInput {
  generatedAt: string;
  hpi: { url: string; asOf: Month };
  pipr: { url: string; edition: string; asOf: Month };
  boe: { asOf: Month; descriptions: ReadonlyMap<string, string> };
  geography: { service: string; asOf: Month };
}

export const PIPR_PAGE =
  'https://www.ons.gov.uk/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics';
export const HPI_PAGE = 'https://www.gov.uk/government/collections/uk-house-price-index-reports';
export const BOE_PAGE = 'https://www.bankofengland.co.uk/boeapps/database/';
export const GEOGRAPHY_PAGE = 'https://geoportal.statistics.gov.uk/';

export function buildSources(input: SourcesInput): SourcesFile {
  const sources: DataSource[] = [
    {
      id: 'uk-hpi',
      dataset: 'UK House Price Index',
      publisher: 'HM Land Registry with ONS',
      url: HPI_PAGE,
      licence: OGL,
      licenceUrl: OGL_URL,
      asOf: input.hpi.asOf,
      notes: `Average price, all property types, by local authority; 10-year growth from the same series. Northern Ireland figures are quarterly. File: ${input.hpi.url}`,
    },
    {
      id: 'ons-pipr',
      dataset: 'Price Index of Private Rents, UK: monthly price statistics',
      publisher: 'Office for National Statistics',
      url: PIPR_PAGE,
      licence: OGL,
      licenceUrl: OGL_URL,
      asOf: input.pipr.asOf,
      notes: `Average monthly rent and annual change, Table 1. Local authorities in England and Wales; Broad Rental Market Areas in Scotland and Northern Ireland, matched to councils in data/brma-map.json. Official statistics in development. Edition: ${input.pipr.edition}. File: ${input.pipr.url}`,
    },
    {
      id: 'boe-quoted-rates',
      dataset: 'Quoted household interest rates',
      publisher: 'Bank of England',
      url: BOE_PAGE,
      licence: OGL,
      licenceUrl: 'https://www.bankofengland.co.uk/legal',
      asOf: input.boe.asOf,
      notes:
        'Monthly average quoted rates for owner-occupier fixed-rate mortgages. The Bank publishes no 5-year 85% LTV series. Reproduction of Bank of England Database data is under the Open Government Licence (bankofengland.co.uk/legal).',
      series: QUOTED_RATE_SERIES.map((s) => ({
        code: s.code,
        description:
          input.boe.descriptions.get(s.code) ??
          `${s.fixYears} year (${Math.round(s.ltv * 100)}% LTV) fixed rate mortgage`,
      })),
    },
    {
      id: 'ons-la-codes',
      dataset: `Local authority district names and codes (${input.geography.service})`,
      publisher: 'ONS Open Geography Portal',
      url: GEOGRAPHY_PAGE,
      licence: OGL,
      licenceUrl: OGL_URL,
      asOf: input.geography.asOf,
      notes:
        'Area names, codes and slugs. Source: Office for National Statistics licensed under the Open Government Licence v.3.0. Contains OS data © Crown copyright and database right.',
    },
  ];
  return { schemaVersion: 1, generatedAt: input.generatedAt, sources };
}

/** "LAD_APR_2025_UK_NC_v2" -> "2025-04". */
export function serviceMonth(service: string): Month | null {
  const m = /_(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)_(\d{4})_/i.exec(service);
  if (!m?.[1] || !m[2]) return null;
  const index = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ].indexOf(m[1].toUpperCase());
  return `${m[2]}-${String(index + 1).padStart(2, '0')}`;
}
