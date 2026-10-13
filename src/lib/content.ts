/**
 * Pure helpers for the content pages (/how-it-works/, /sources/, /about/), phase 5 content
 * teammate. They turn the validated data files into the rows and sentences those pages show, so
 * every figure on them (defaults, presets, tax bands, months, series codes) is read from data/,
 * never retyped.
 *
 * No JSON imports and no DOM: the caller passes the parsed files in (the pages load them through
 * src/components/content/content-data.ts). Unit tests: content.test.ts.
 *
 * What does live here is prose that is not a figure: the plain description of each dataset's
 * geography and use, the attribution statements the Open Government Licence asks for, and the
 * names of the extra charges on an additional property. A test fails if a dataset is added to
 * sources.json without them.
 */
import { shortPercent } from './copy';
import { formatFieldPercent, formatMoney, MINUS } from './format';
import { NATION_NAMES } from './nations';
import type {
  Area,
  AreaField,
  DataSource,
  DefaultsFile,
  FieldSpec,
  Nation,
  NumericInputKey,
  PresetAdjust,
  PresetName,
  RatesFile,
  SourcesFile,
  TaxBand,
  TaxRegime,
  TaxRegimeId,
  TaxRules,
} from './types';
import { AREA_FIELDS, NATIONS, NUMERIC_INPUT_KEYS, PRESET_NAMES } from './types';

// ---------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** "2026-07" -> "July 2026". Anything that is not a month is returned unchanged. */
export function formatMonthLong(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const name = match ? MONTH_NAMES[Number(match[2]) - 1] : undefined;
  return match && name ? `${name} ${match[1]}` : month;
}

/**
 * "2026-10-13" or "2026-10-13T15:23:47Z" -> "13 October 2026" (the calendar date in UTC, as the
 * pipeline writes it). Anything else is returned unchanged.
 */
export function formatDateLong(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const name = match ? MONTH_NAMES[Number(match[2]) - 1] : undefined;
  return match && name ? `${Number(match[3])} ${name} ${match[1]}` : iso;
}

/** The year of an ISO date or timestamp, e.g. "2026". */
export function yearOf(iso: string): string {
  return /^(\d{4})/.exec(iso)?.[1] ?? iso;
}

// ---------------------------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------------------------

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Index of the "}" matching the "{" at `open`, or -1. */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * A formula written in a small plain-text notation, as HTML: `{M}` is a symbol (<var>),
 * `_{...}` a subscript and `^{...}` a power, which screen readers hear as "to the power of".
 * Everything else is escaped text. Writing formulas this way keeps them on one line in the
 * source, where a formatter cannot add spaces inside them.
 *
 * formulaHtml('{M} = {L} × {r}^{2}') ->
 *   '<var>M</var> = <var>L</var> × <var>r</var><sup class="formula__power">...2</sup>'
 */
export function formulaHtml(expr: string): string {
  let out = '';
  let i = 0;
  while (i < expr.length) {
    const char = expr[i] ?? '';
    const next = expr[i + 1];
    if ((char === '_' || char === '^') && next === '{') {
      const end = closingBrace(expr, i + 1);
      if (end !== -1) {
        const inner = formulaHtml(expr.slice(i + 2, end));
        out +=
          char === '_'
            ? `<sub>${inner}</sub>`
            : `<sup class="formula__power"><span class="visually-hidden">to the power of </span>${inner}</sup>`;
        i = end + 1;
        continue;
      }
    }
    if (char === '{') {
      const end = closingBrace(expr, i);
      if (end !== -1) {
        out += `<var>${formulaHtml(expr.slice(i + 1, end))}</var>`;
        i = end + 1;
        continue;
      }
    }
    out += escapeHtml(char);
    i += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Defaults and presets (data/defaults.json)
// ---------------------------------------------------------------------------------------------

/**
 * A value in a field's unit: "£999", "£350 a year", "1.40%", "2.5% a year", "30 years".
 * Percentages show the field's `decimals` from defaults.json, as the calculator does.
 */
export function formatFieldValue(
  value: number,
  spec: Pick<FieldSpec, 'unit'> & Partial<Pick<FieldSpec, 'decimals'>>,
): string {
  switch (spec.unit) {
    case 'gbp':
      return formatMoney(value);
    case 'gbpPerMonth':
      return `${formatMoney(value)} a month`;
    case 'gbpPerYear':
      return `${formatMoney(value)} a year`;
    case 'percent':
      return formatFieldPercent(value, spec);
    case 'percentPerYear':
      return formatFieldPercent(value, spec, { perYear: true });
    case 'years':
      return `${value} ${value === 1 ? 'year' : 'years'}`;
  }
}

/** "Same as the initial rate", "Initial rate + 0.5 points", "Initial rate − 0.5 points". */
export function rateDeltaText(delta: number): string {
  if (delta === 0) return 'Same as the initial rate';
  const points = shortPercent(Math.abs(delta)).replace('%', '');
  const unit = points === '1' ? 'point' : 'points';
  return `Initial rate ${delta > 0 ? '+' : MINUS} ${points} ${unit}`;
}

/** "the area's figure", "the area's figure, at most 1.5%", "... + 1 point, at most 6%". */
export function presetAdjustText(adjust: PresetAdjust): string {
  let text = "Area's figure";
  if (adjust.add !== 0) {
    const points = shortPercent(Math.abs(adjust.add)).replace('%', '');
    text += ` ${adjust.add > 0 ? '+' : MINUS} ${points} ${points === '1' ? 'point' : 'points'}`;
  }
  if (adjust.cap !== null) text += `, at most ${shortPercent(adjust.cap)}`;
  return text;
}

/**
 * The default a field starts at, as text. Fixed defaults are formatted in the field's unit, with
 * any per-nation value after it ("£500 (Scotland £0)"). Derived defaults say where they come from,
 * using the figures in defaults.json (the deposit fraction, the clamps, the Typical preset).
 */
export function fieldDefaultText(key: NumericInputKey, defaults: DefaultsFile): string {
  const spec = defaults.fields[key];
  const typical = defaults.presets[defaults.defaultPreset];
  const clamps = defaults.areaClamps;
  switch (key) {
    case 'price':
    case 'rent':
      return "Area's average";
    case 'deposit':
      return `${shortPercent(defaults.depositFraction)} of the price`;
    case 'mortgageRate':
      return 'Bank of England quoted rate';
    case 'houseGrowth':
      return `Area's 10-year average, kept between ${shortPercent(clamps.houseGrowth.min)} and ${shortPercent(clamps.houseGrowth.max)}`;
    case 'rentGrowth':
      return `Area's latest annual change, kept between ${shortPercent(clamps.rentGrowth.min)} and ${shortPercent(clamps.rentGrowth.max)}`;
    case 'rateAfterFix':
      return rateDeltaText(typical.rateAfterFixDelta);
    case 'investmentReturn':
      return formatFieldValue(typical.investmentReturn, spec);
    default:
      break;
  }
  if (spec.default === null) return 'Derived';
  const base = formatFieldValue(spec.default, spec);
  const perNation = NATIONS.flatMap((nation) => {
    const value = spec.byNation?.[nation];
    return value === undefined ? [] : [`${NATION_NAMES[nation]} ${formatFieldValue(value, spec)}`];
  });
  return perNation.length === 0 ? base : `${base} (${perNation.join(', ')})`;
}

export interface DefaultRow {
  key: NumericInputKey;
  label: string;
  /** The default, as text. */
  value: string;
  /** Why: the field's source note from defaults.json. */
  reason: string;
}

/** One row per field, in the calculator's order, split into simple and advanced inputs. */
export function defaultRows(defaults: DefaultsFile): {
  simple: DefaultRow[];
  advanced: DefaultRow[];
} {
  const rows = NUMERIC_INPUT_KEYS.map((key) => {
    const spec = defaults.fields[key];
    return {
      key,
      level: spec.level,
      row: {
        key,
        label: spec.label,
        value: fieldDefaultText(key, defaults),
        reason: reasonText(fieldDefaultText(key, defaults), spec.source),
      },
    };
  });
  return {
    simple: rows.filter((r) => r.level === 'simple').map((r) => r.row),
    advanced: rows.filter((r) => r.level === 'advanced').map((r) => r.row),
  };
}

const normalise = (text: string) =>
  text.toLowerCase().replace(/'s\b/g, '').replace(/\s+/g, ' ').trim();

/**
 * The "Why" for a default: its source note from defaults.json without the clauses that only
 * repeat the "Starts at" text. "Area average, UK House Price Index, latest month" beside
 * "Area's average" becomes "UK House Price Index, latest month". Clauses are split at ", " and
 * ": "; the note is kept whole when nothing repeats, or when everything would go.
 */
export function reasonText(value: string, source: string): string {
  const parts = source.split(/(, |: )/);
  const v = normalise(value);
  const kept: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const clause = parts[i] ?? '';
    const c = normalise(clause);
    const repeats = c !== '' && (v.includes(c) || v.includes(c.replace(/s$/, '')));
    if (!repeats) kept.push(kept.length === 0 ? '' : (parts[i - 1] ?? ', '), clause);
  }
  const text = kept.join('').trim();
  if (text === '' || text === source) return source;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface ChoiceDefaultRow {
  key: 'nation' | 'buyerType';
  label: string;
  value: string;
  reason: string;
}

const BUYER_TYPE_NAMES: Record<DefaultsFile['defaultBuyerType'], string> = {
  first: 'First-time buyer',
  moving: 'Moving home',
  additional: 'Additional property',
};

/** The two choices that are not numbers: the tax rules (nation) and the buyer type. */
export function choiceDefaultRows(defaults: DefaultsFile): ChoiceDefaultRow[] {
  return [
    {
      key: 'nation',
      label: 'Tax rules',
      value: `The area's nation (${NATION_NAMES[defaults.defaultNation]} before an area is picked)`,
      reason: 'Each nation has its own property tax. The Tax rules input can change it',
    },
    {
      key: 'buyerType',
      label: 'Buyer type',
      value: BUYER_TYPE_NAMES[defaults.defaultBuyerType],
      reason:
        'Built for renters weighing a first purchase. The others are moving home and additional property',
    },
  ];
}

export interface PresetColumn {
  name: PresetName;
  label: string;
  description: string;
  isDefault: boolean;
}

export interface PresetRow {
  assumption: string;
  values: Record<PresetName, string>;
}

/** The Outlook presets as a table: one column per preset, one row per assumption it sets. */
export function presetTable(defaults: DefaultsFile): {
  columns: PresetColumn[];
  rows: PresetRow[];
} {
  const { presets, fields } = defaults;
  const per = (fn: (name: PresetName) => string): Record<PresetName, string> => ({
    cautious: fn('cautious'),
    typical: fn('typical'),
    optimistic: fn('optimistic'),
  });
  return {
    columns: PRESET_NAMES.map((name) => ({
      name,
      label: presets[name].label,
      description: presets[name].description,
      isDefault: name === defaults.defaultPreset,
    })),
    rows: [
      {
        assumption: fields.houseGrowth.label,
        values: per((name) => presetAdjustText(presets[name].houseGrowth)),
      },
      {
        assumption: fields.rentGrowth.label,
        values: per((name) => presetAdjustText(presets[name].rentGrowth)),
      },
      {
        assumption: fields.investmentReturn.label,
        values: per((name) =>
          formatFieldValue(presets[name].investmentReturn, fields.investmentReturn),
        ),
      },
      {
        assumption: fields.rateAfterFix.label,
        values: per((name) => rateDeltaText(presets[name].rateAfterFixDelta)),
      },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Property tax (data/taxRules.json)
// ---------------------------------------------------------------------------------------------

export interface BandRow {
  /** "Up to £125,000", "£125,001 to £250,000", "Above £1,500,000". */
  range: string;
  /** "0%", "7.5%". */
  rate: string;
}

/** The slice of the price a band covers, as GOV.UK words it. */
export function bandRange(band: TaxBand): string {
  if (band.from === 0) {
    return band.to === null ? 'The whole price' : `Up to ${formatMoney(band.to)}`;
  }
  if (band.to === null) return `Above ${formatMoney(band.from)}`;
  return `${formatMoney(band.from + 1)} to ${formatMoney(band.to)}`;
}

export function bandRows(bands: readonly TaxBand[]): BandRow[] {
  return bands.map((band) => ({ range: bandRange(band), rate: shortPercent(band.rate) }));
}

/** What the extra charge on an additional property is called in each regime. */
const ADDITIONAL_NAMES: Record<TaxRegimeId, { name: string; plural: boolean }> = {
  sdlt: { name: 'higher rates for additional properties', plural: true },
  lbtt: { name: 'Additional Dwelling Supplement (ADS)', plural: false },
  ltt: { name: 'higher residential rates', plural: true },
};

export interface RegimeSummary {
  id: TaxRegimeId;
  /** "Stamp Duty Land Tax (SDLT)" */
  name: string;
  /** "stamp duty" */
  plainName: string;
  shortName: string;
  /** The nations it applies in, e.g. ["England", "Northern Ireland"]. */
  nations: string[];
  main: BandRow[];
  /** First-time buyer relief: its table and a sentence, or null when there is none. */
  firstTimeBuyer: { rows: BandRow[]; note: string } | null;
  /** The sentence on an additional property, and its table when the regime has one. */
  additional: { note: string; rows: BandRow[] | null };
  /** The official pages the rules were checked against. */
  sources: TaxRegime['sources'];
}

/** One summary per regime, in the order the nations first use them (SDLT, LBTT, LTT). */
export function regimeSummaries(rules: TaxRules): RegimeSummary[] {
  const order: TaxRegimeId[] = [];
  for (const nation of NATIONS) {
    const id = rules.nations[nation];
    if (!order.includes(id)) order.push(id);
  }
  return order.map((id) => {
    const regime = rules.regimes[id];
    const nations = NATIONS.filter((nation: Nation) => rules.nations[nation] === id).map(
      (nation) => NATION_NAMES[nation],
    );
    const ftb = regime.firstTimeBuyer;
    const additional = regime.additional;
    const min = formatMoney(additional.minPrice);
    const extra = ADDITIONAL_NAMES[id];
    return {
      id,
      name: `${regime.name} (${regime.shortName})`,
      plainName: regime.plainName,
      shortName: regime.shortName,
      nations,
      main: bandRows(regime.bands),
      firstTimeBuyer:
        ftb === null
          ? null
          : {
              rows: bandRows(ftb.bands),
              note:
                ftb.maxPrice === null
                  ? 'First-time buyers use these bands instead, at any price.'
                  : `First-time buyers use these bands instead, up to a price of ${formatMoney(ftb.maxPrice)}. Above that there is no relief and the main rates apply to the whole price.`,
            },
      additional:
        additional.kind === 'wholePriceSurcharge'
          ? {
              note: `On an additional property costing ${min} or more, the ${extra.name} ${extra.plural ? 'add' : 'adds'} ${shortPercent(additional.rate)} of the whole price on top of the main rates.`,
              rows: null,
            }
          : {
              note: `On an additional property costing ${min} or more, the ${extra.name} ${extra.plural ? 'replace' : 'replaces'} the main rates (the additional property table).`,
              rows: bandRows(additional.bands),
            },
      sources: regime.sources,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Sources (data/sources.json)
// ---------------------------------------------------------------------------------------------

export interface SourceProse {
  /** Where the figures are published for. */
  geography: string;
  /** What House Sums uses them for. */
  usedFor: string;
  /** The attribution statement the licence asks for, given the data's year. */
  attribution: (year: string) => string;
}

/** The Open Government Licence v3.0. */
export const OGL_URL = 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/';

/** True for a dataset published under the Open Government Licence. */
export const isOgl = (source: Pick<DataSource, 'licence'>) =>
  /open government licence/i.test(source.licence);

/** The Open Government Licence's own default attribution. */
export const OGL_ATTRIBUTION =
  'Contains public sector information licensed under the Open Government Licence v3.0.';

/**
 * Plain words for each dataset in sources.json, keyed by its id. The statements follow each
 * publisher's requested wording under the Open Government Licence v3.0.
 */
export const SOURCE_PROSE: Readonly<Record<string, SourceProse>> = {
  'uk-hpi': {
    geography:
      'Every local authority in the UK, monthly (quarterly in Northern Ireland), plus a figure for each nation.',
    usedFor:
      "Each area's average price, and its 10-year house price growth from the price 10 years earlier.",
    attribution: (year) =>
      `Contains HM Land Registry data © Crown copyright and database right ${year}. This data is licensed under the Open Government Licence v3.0.`,
  },
  'ons-pipr': {
    geography:
      'Local authorities in England and Wales; Broad Rental Market Areas in Scotland and Northern Ireland; a figure for each nation.',
    usedFor: "Each area's average monthly rent and its latest annual change in rent.",
    attribution: () =>
      'Source: Office for National Statistics licensed under the Open Government Licence v3.0.',
  },
  'boe-quoted-rates': {
    geography: 'The whole UK, by fix length and loan-to-value.',
    usedFor:
      'The starting mortgage rate, picked by your loan-to-value band and the length of the fix.',
    attribution: () => `Bank of England Database. ${OGL_ATTRIBUTION}`,
  },
  'ons-la-codes': {
    geography: 'Every local authority district in the UK.',
    usedFor: "Area names, codes and each area's nation, and from those the page addresses.",
    attribution: (year) =>
      `Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right ${year}.`,
  },
};

export interface SourceEntry {
  source: DataSource;
  /** "July 2026". */
  asOf: string;
  geography: string | null;
  usedFor: string | null;
  /** The attribution statement; the OGL default for an OGL dataset with no prose of its own. */
  attribution: string | null;
}

/** Every dataset in sources.json with its prose and attribution, in the file's order. */
export function sourceEntries(file: SourcesFile): SourceEntry[] {
  const year = yearOf(file.generatedAt);
  return file.sources.map((source) => {
    const prose = SOURCE_PROSE[source.id];
    return {
      source,
      asOf: formatMonthLong(source.asOf),
      geography: prose?.geography ?? null,
      usedFor: prose?.usedFor ?? null,
      attribution: prose ? prose.attribution(year) : isOgl(source) ? OGL_ATTRIBUTION : null,
    };
  });
}

/**
 * "2 years", "60%" from a Bank of England series description such as "... sterling 2 year (60%
 * LTV) fixed rate mortgage ...". Null when the description is not in that form.
 */
export function seriesTerms(description: string): { fixYears: number; ltv: number } | null {
  const match = /(\d+)\s*year\s*\((\d+)%\s*LTV\)/i.exec(description);
  if (!match) return null;
  return { fixYears: Number(match[1]), ltv: Number(match[2]) / 100 };
}

// ---------------------------------------------------------------------------------------------
// The monthly refresh (.github/workflows/refresh-data.yml)
// ---------------------------------------------------------------------------------------------

/**
 * When the refresh workflow runs. content.test.ts checks this against the workflow's cron, so the
 * Sources page can't drift from it.
 */
export const REFRESH_SCHEDULE = {
  cron: '17 6 20 * *',
  /** As the Sources page says it. */
  text: 'on the 20th of each month',
} as const;

// ---------------------------------------------------------------------------------------------
// Rates and areas, for the Sources page
// ---------------------------------------------------------------------------------------------

/**
 * Loan-to-value bands the Bank publishes for one fix length but not another (today the 5-year
 * fix at 85%), with the band the calculator uses instead: the smallest published band above it
 * for that fix, as pickMortgageRate does.
 */
export function missingSeries(
  rates: Pick<RatesFile, 'rates'>,
): { fixYears: number; ltv: number; usesLtv: number | null }[] {
  const fixes = [...new Set(rates.rates.map((r) => r.fixYears))].sort((a, b) => a - b);
  const bands = [...new Set(rates.rates.map((r) => r.ltv))].sort((a, b) => a - b);
  return fixes.flatMap((fixYears) => {
    const published = rates.rates.filter((r) => r.fixYears === fixYears).map((r) => r.ltv);
    return bands
      .filter((ltv) => !published.includes(ltv))
      .map((ltv) => ({
        fixYears,
        ltv,
        usesLtv: published.filter((p) => p > ltv).sort((a, b) => a - b)[0] ?? null,
      }));
  });
}

/** Plain names for an area's four figures. */
export const AREA_FIELD_NAMES: Readonly<Record<AreaField, string>> = {
  price: 'average price',
  growth10y: '10-year price growth',
  rent: 'average rent',
  rentGrowth: 'annual rent change',
};

/** "average price, 10-year price growth and average rent". */
export function listText(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** Areas that use their nation's figure for any field, alphabetical, with the fields in words. */
export function fallbackAreas(
  areas: readonly Pick<Area, 'slug' | 'name' | 'nation' | 'fallbacks'>[],
): { slug: string; name: string; nation: string; fields: string }[] {
  return areas
    .filter((area) => area.fallbacks.length > 0)
    .map((area) => ({
      slug: area.slug,
      name: area.name,
      nation: NATION_NAMES[area.nation],
      fields: listText(
        AREA_FIELDS.filter((f) => area.fallbacks.includes(f)).map((f) => AREA_FIELD_NAMES[f]),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
}

/**
 * A short label for a file link: the file name ("Average-prices-2026-07.csv"), taken from a
 * `uri` query parameter when the path has none (ONS file links), else the host.
 */
export function linkLabel(href: string): string {
  try {
    const parsed = new URL(href);
    const fromUri = parsed.searchParams.get('uri')?.split('/').filter(Boolean).at(-1);
    const fromPath = parsed.pathname.split('/').filter(Boolean).at(-1);
    const file = [fromPath, fromUri].find((name) => name !== undefined && name.includes('.'));
    return file ?? parsed.host;
  } catch {
    return href;
  }
}

/**
 * Splits text into plain parts and https links, so a note such as "... File: https://..." can show
 * its address as a link. Trailing punctuation stays outside the link.
 */
export function splitLinks(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(/https:\/\/[^\s)]+/g)) {
    const href = match[0].replace(/[.,;:]+$/, '');
    const start = match.index;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: href, href });
    last = start + href.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
