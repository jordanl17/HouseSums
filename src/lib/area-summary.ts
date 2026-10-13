/**
 * Words and figures for the area and nation pages (phase 5, areas teammate). Pure: no DOM, no
 * JSON, no Astro. The pages pass in the data (an area, its nation's figures, the derived inputs
 * the calculator uses, the tax rules) and get back table rows and sentences built only from it.
 *
 * Voice (docs/brief.md): British English, plain words, hyphens never em-dashes, no exclamation
 * marks, no advice. Negative numbers use the true minus sign (U+2212) from format.ts.
 */
import { formatFieldPercent, formatMoney, formatPercent } from './format';
import type {
  AreaFigures,
  BuyerType,
  DataSource,
  Month,
  Nation,
  TaxBand,
  TaxRegime,
} from './types';

/**
 * Decimal places each percentage field shows (defaults.json `decimals`), so a figure reads the
 * same here as in the calculator's field and tables on the same page: Belfast's growth is
 * "5.10%" in both.
 */
export type FieldDecimals = Record<
  'mortgageRate' | 'houseGrowth' | 'rentGrowth' | 'investmentReturn',
  number
>;

/** A rate at a field's decimals: (0.051, 2) -> "5.10%". */
const at = (rate: number, decimals: number, signed = false): string =>
  formatFieldPercent(rate, { decimals }, { signed });

// ---------------------------------------------------------------------------------------------
// Small formatters
// ---------------------------------------------------------------------------------------------

const MONTHS = [
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

function monthParts(month: Month): { year: string; index: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const index = Number(match[2]) - 1;
  if (index < 0 || index > 11) return null;
  return { year: match[1] ?? '', index };
}

/** "2026-07" -> "July 2026" (long) or "Jul 2026" (short). Anything else is returned unchanged. */
export function monthLabel(month: Month, style: 'long' | 'short' = 'long'): string {
  const parts = monthParts(month);
  if (!parts) return month;
  const name = MONTHS[parts.index] ?? '';
  return `${style === 'short' ? name.slice(0, 3) : name} ${parts.year}`;
}

/** The quarter ending in this month: "2026-06" -> "April to June 2026". */
export function quarterLabel(month: Month): string {
  const parts = monthParts(month);
  if (!parts) return month;
  const start = (parts.index + 10) % 12;
  const startYear = parts.index < 2 ? Number(parts.year) - 1 : Number(parts.year);
  const from = MONTHS[start] ?? '';
  const to = MONTHS[parts.index] ?? '';
  return startYear === Number(parts.year)
    ? `${from} to ${to} ${parts.year}`
    : `${from} ${startYear} to ${to} ${parts.year}`;
}

/** A rate with two decimals and a sign: "+4.23%", "−0.52%", "0.00%". */
export function signedPercent(rate: number): string {
  return formatPercent(rate, { decimals: 2, signed: true });
}

/** A rate with two decimals and no plus sign: "4.19%", "−3.92%". */
export function plainPercent(rate: number): string {
  return formatPercent(rate, { decimals: 2 });
}

/** A percentage with no trailing zeros, for limits and assumptions: 0.06 -> "6%", 0.045 -> "4.5%". */
export function roundPercent(rate: number): string {
  return formatPercent(rate, { decimals: 2 })
    .replace(/\.00%$/, '%')
    .replace(/(\.\d)0%$/, '$1%');
}

/** "1 year", "6 years". */
export function yearsText(count: number): string {
  return `${count} ${count === 1 ? 'year' : 'years'}`;
}

/** A break-even year as tables show it: "2 years", or "None in 25 years". */
export function breakEvenCell(year: number | null, horizon: number): string {
  return year === null ? `None in ${yearsText(horizon)}` : yearsText(year);
}

/**
 * How a value compares with the nation's, in whole per cent: "16% less than", "22% more than",
 * or "about the same as" when it rounds to 0%.
 */
export function compareWords(value: number, nationValue: number): string {
  if (!(nationValue > 0) || !Number.isFinite(value)) return 'about the same as';
  const change = Math.round((value / nationValue - 1) * 100);
  if (change === 0) return 'about the same as';
  return change < 0 ? `${-change}% less than` : `${change}% more than`;
}

/** Price in years of rent, with its unit: 247695 / (1145 x 12) -> "18.0 years". */
export function priceToRentYears(price: number, monthlyRent: number): string {
  if (!(monthlyRent > 0)) return '';
  return `${(price / (monthlyRent * 12)).toFixed(1)} years`;
}

/** "England's", "Wales's" (Guardian and GOV.UK style: 's after a proper name ending in s). */
export function possessive(name: string): string {
  return `${name}'s`;
}

// ---------------------------------------------------------------------------------------------
// The area summary
// ---------------------------------------------------------------------------------------------

type Field = 'price' | 'growth10y' | 'rent' | 'rentGrowth';

export interface SummaryInput {
  /** Display name, "Leeds". */
  name: string;
  /** The ONS name when it differs ("Bristol, City of"). */
  onsName?: string | undefined;
  nation: Nation;
  /** "England". */
  nationName: string;
  /** The area's figures as published (unclamped), with fallbacks already applied. */
  figures: AreaFigures;
  /** Fields that hold the nation's figure because no local one was published. */
  fallbacks: readonly Field[];
  /** The Broad Rental Market Area the rent comes from (Scotland and Northern Ireland). */
  rentArea?: string | undefined;
  months: { price: Month; rent: Month };
  nationFigures: AreaFigures & { months: { price: Month; rent: Month } };
  /** What the calculator uses at typical assumptions (deriveInputs), after its clamps. */
  used: { houseGrowth: number; rentGrowth: number };
  /** The calculator's limits on area figures (defaults.json areaClamps). */
  clamps: Record<'houseGrowth' | 'rentGrowth', { min: number; max: number }>;
  /** Decimals of the fields these figures feed (defaults.json). */
  decimals: Pick<FieldDecimals, 'houseGrowth' | 'rentGrowth'>;
}

export interface FigureCell {
  text: string;
  /** True when this is the nation's figure (no local figure published). */
  fallback: boolean;
}

export interface FigureRow {
  key: Field | 'priceToRent';
  label: string;
  /** "Jul 2026", or null when the row has no single month. */
  month: string | null;
  area: FigureCell;
  nation: FigureCell;
}

/** The figures table: the area's figures beside its nation's, with months. */
export function figureRows(input: SummaryInput): FigureRow[] {
  const { figures, nationFigures: nation, months, decimals } = input;
  const fallback = (field: Field) => input.fallbacks.includes(field);
  const priceMonth = monthLabel(months.price, 'short');
  const rentMonth = monthLabel(months.rent, 'short');
  const sameMonth = (field: 'price' | 'rent') => months[field] === nation.months[field];
  const nationMonthNote = (field: 'price' | 'rent') =>
    sameMonth(field) ? '' : ` (${monthLabel(nation.months[field], 'short')})`;
  return [
    {
      key: 'price',
      label: 'Average price',
      month: priceMonth,
      area: { text: formatMoney(figures.price), fallback: fallback('price') },
      nation: { text: formatMoney(nation.price) + nationMonthNote('price'), fallback: false },
    },
    {
      key: 'growth10y',
      label: 'Price growth a year, 10-year average',
      month: `to ${priceMonth}`,
      area: { text: at(figures.growth10y, decimals.houseGrowth), fallback: fallback('growth10y') },
      nation: { text: at(nation.growth10y, decimals.houseGrowth), fallback: false },
    },
    {
      key: 'rent',
      label: 'Average monthly rent',
      month: rentMonth,
      area: { text: formatMoney(figures.rent), fallback: fallback('rent') },
      nation: { text: formatMoney(nation.rent) + nationMonthNote('rent'), fallback: false },
    },
    {
      key: 'rentGrowth',
      label: 'Rent change over the year',
      month: `to ${rentMonth}`,
      area: {
        text: at(figures.rentGrowth, decimals.rentGrowth, true),
        fallback: fallback('rentGrowth'),
      },
      nation: { text: at(nation.rentGrowth, decimals.rentGrowth, true), fallback: false },
    },
    {
      key: 'priceToRent',
      label: 'Price in years of rent',
      month: null,
      area: {
        text: priceToRentYears(figures.price, figures.rent),
        // Marked when either figure is the nation's: the ratio is then not wholly local.
        fallback: fallback('price') || fallback('rent'),
      },
      nation: { text: priceToRentYears(nation.price, nation.rent), fallback: false },
    },
  ];
}

/**
 * One sentence comparing the area's price and rent with its nation's, leaving out any figure
 * that is the nation's own: "An average home in Leeds costs 16% less than the England average,
 * and rents for 22% less." Empty when both are fallbacks.
 */
export function comparisonSentence(input: SummaryInput): string {
  const { name, nationName, figures, nationFigures: nation } = input;
  const price = input.fallbacks.includes('price')
    ? null
    : compareWords(figures.price, nation.price);
  const rent = input.fallbacks.includes('rent') ? null : compareWords(figures.rent, nation.rent);
  const average = `the ${nationName} average`;
  if (price && rent) {
    const rentPart =
      rent === price ? 'and rents for the same margin' : `and rents for ${shortCompare(rent)}`;
    return `An average home in ${name} costs ${price} ${average}, ${rentPart}.`;
  }
  if (price) return `An average home in ${name} costs ${price} ${average}.`;
  if (rent) return `An average rent in ${name} is ${rent} ${average}.`;
  return '';
}

/** "22% less than" -> "22% less"; "about the same as" -> "about the same". */
function shortCompare(words: string): string {
  return words.replace(/ (than|as)$/, '');
}

/**
 * Plain notes under the figures, each one sentence or two, only when it applies:
 * growth or rent change outside the calculator's range (said plainly, with what it uses),
 * nation fallbacks, Northern Ireland's quarterly prices, Scottish and NI rents by Broad Rental
 * Market Area, and the ONS name when the display name differs.
 */
export function summaryNotes(input: SummaryInput): string[] {
  const notes: string[] = [];
  const { name, figures, used, clamps, months, decimals } = input;
  const growthAt = (rate: number) => at(rate, decimals.houseGrowth);
  const rentAt = (rate: number) => at(rate, decimals.rentGrowth);
  const priceMonth = monthLabel(months.price);
  const rentMonth = monthLabel(months.rent);

  const growth = figures.growth10y;
  if (used.houseGrowth !== growth) {
    const span = `over the 10 years to ${priceMonth}`;
    if (growth < clamps.houseGrowth.min) {
      const fell =
        growth < 0
          ? `Average prices in ${name} fell by ${growthAt(-growth)} a year ${span}.`
          : `Average prices in ${name} grew by ${growthAt(growth)} a year ${span}.`;
      const floor =
        clamps.houseGrowth.min === 0
          ? 'The calculator floors house price growth at 0%, so its answer assumes prices hold steady.'
          : `The calculator uses at least ${roundPercent(clamps.houseGrowth.min)} a year for house price growth, so its answer uses ${growthAt(used.houseGrowth)}.`;
      notes.push(`${fell} ${floor}`);
    } else {
      notes.push(
        `Average prices in ${name} grew by ${growthAt(growth)} a year ${span}. The calculator caps house price growth at ${roundPercent(clamps.houseGrowth.max)} a year, so its answer uses ${growthAt(used.houseGrowth)}.`,
      );
    }
  }

  const rentGrowth = figures.rentGrowth;
  if (used.rentGrowth !== rentGrowth) {
    const span = `in the year to ${rentMonth}`;
    const moved =
      rentGrowth < 0
        ? `Rents fell by ${rentAt(-rentGrowth)} ${span}.`
        : `Rents rose by ${rentAt(rentGrowth)} ${span}.`;
    const limit =
      rentGrowth < clamps.rentGrowth.min
        ? `The calculator assumes rent rises by at least ${roundPercent(clamps.rentGrowth.min)} a year, so its answer uses ${rentAt(used.rentGrowth)}.`
        : `The calculator caps rent increases at ${roundPercent(clamps.rentGrowth.max)} a year, so its answer uses ${rentAt(used.rentGrowth)}.`;
    notes.push(`${moved} ${limit}`);
  }

  const fallbackNote = fallbackSentence(input);
  if (fallbackNote) notes.push(fallbackNote);

  if (input.nation === 'ni' && !input.fallbacks.includes('price')) {
    notes.push(
      `Northern Ireland prices are published each quarter, so the price is for ${quarterLabel(months.price)}.`,
    );
  }

  if (input.rentArea && !input.fallbacks.includes('rent')) {
    notes.push(
      `ONS publishes ${input.nationName} rents for Broad Rental Market Areas (the areas used to set housing benefit), not councils. The rent here is for ${input.rentArea}, the area ONS matches to ${name}.`,
    );
  }

  if (input.onsName && input.onsName !== name) {
    notes.push(`ONS lists ${name} as "${input.onsName}".`);
  }
  return notes;
}

/**
 * Notes for a nation page: Northern Ireland's quarterly prices, and rents published by Broad
 * Rental Market Area (Scotland and Northern Ireland; `rentsByArea` is true when the nation's
 * areas carry a rentArea).
 */
export function nationNotes(input: {
  nation: Nation;
  nationName: string;
  months: { price: Month; rent: Month };
  rentsByArea: boolean;
}): string[] {
  const notes: string[] = [];
  if (input.nation === 'ni') {
    notes.push(
      `Northern Ireland prices are published each quarter, so these are for ${quarterLabel(input.months.price)}.`,
    );
  }
  if (input.rentsByArea) {
    notes.push(
      `ONS publishes ${input.nationName} rents for Broad Rental Market Areas (the areas used to set housing benefit), not councils, so each area takes the rent for the one ONS matches to it.`,
    );
  }
  return notes;
}

const FIELD_WORDS: Record<Field, string> = {
  price: 'average price',
  growth10y: '10-year price growth',
  rent: 'rent',
  rentGrowth: 'rent change',
};

/** "There is no local rent or rent change for City of London in the source data, so ..." */
function fallbackSentence(input: SummaryInput): string | null {
  const fields = (['price', 'growth10y', 'rent', 'rentGrowth'] as const).filter((field) =>
    input.fallbacks.includes(field),
  );
  if (fields.length === 0) return null;
  const words = fields.map((field) => FIELD_WORDS[field]);
  const list =
    words.length === 1
      ? (words[0] ?? '')
      : `${words.slice(0, -1).join(', ')} or ${words[words.length - 1] ?? ''}`;
  const these = fields.length === 1 ? 'this is' : 'these are';
  return `The source data has no local ${list} for ${input.name}, so ${these} ${possessive(input.nationName)} figure${fields.length === 1 ? '' : 's'}, marked in the table.`;
}

// ---------------------------------------------------------------------------------------------
// What "typical assumptions" means for this area
// ---------------------------------------------------------------------------------------------

const BUYERS: Record<BuyerType, string> = {
  first: 'a first-time buyer',
  moving: 'someone moving home',
  additional: 'a buyer of an additional home',
};

export interface AssumptionsInput {
  buyerType: BuyerType;
  price: number;
  deposit: number;
  fixYears: number;
  mortgageRate: number;
  /** Month of the Bank of England rate, or null. */
  rateMonth: Month | null;
  houseGrowth: number;
  rentGrowth: number;
  investmentReturn: number;
  years: number;
  decimals: FieldDecimals;
}

/**
 * "That is a first-time buyer with a 10% deposit of £24,770 and a 5-year fix at 5.17% (Bank of
 * England, September 2026), with prices growing 4.19% a year, rent rising 4.23% a year and
 * savings earning 5.0% a year, over 25 years."
 */
export function assumptionsSentence(input: AssumptionsInput): string {
  const share = input.price > 0 ? Math.round((input.deposit / input.price) * 100) : 0;
  const deposit =
    input.deposit >= input.price
      ? `paying the whole ${formatMoney(input.price)} in cash`
      : `a ${share}% deposit of ${formatMoney(input.deposit)} and a ${input.fixYears}-year fix at ${at(input.mortgageRate, input.decimals.mortgageRate)}${
          input.rateMonth ? ` (Bank of England, ${monthLabel(input.rateMonth)})` : ''
        }`;
  const prices =
    input.houseGrowth === 0
      ? 'prices holding steady'
      : `prices growing ${at(input.houseGrowth, input.decimals.houseGrowth)} a year`;
  return `That is ${BUYERS[input.buyerType]} with ${deposit}, with ${prices}, rent rising ${at(input.rentGrowth, input.decimals.rentGrowth)} a year and savings earning ${at(input.investmentReturn, input.decimals.investmentReturn)} a year, over ${yearsText(input.years)}.`;
}

/**
 * What "typical assumptions" means on a nation page, where each area has its own figures:
 * "Typical assumptions: a first-time buyer with a 10% deposit and a 5-year fix at the Bank of
 * England's quoted rate for that loan-to-value, each area's own price growth and rent change
 * within the calculator's limits, and savings earning 5.0% a year, over 25 years."
 */
export function typicalDefinition(input: {
  buyerType: BuyerType;
  depositFraction: number;
  fixYears: number;
  investmentReturn: number;
  /** Decimals the investment return field shows (defaults.json). */
  investmentReturnDecimals: number;
  years: number;
}): string {
  return `Typical assumptions: ${BUYERS[input.buyerType]} with a ${roundPercent(input.depositFraction)} deposit and a ${input.fixYears}-year fix at the Bank of England's quoted rate for that loan-to-value, each area's own price growth and rent change within the calculator's limits, and savings earning ${at(input.investmentReturn, input.investmentReturnDecimals)} a year, over ${yearsText(input.years)}.`;
}

// ---------------------------------------------------------------------------------------------
// Answers across a nation
// ---------------------------------------------------------------------------------------------

/**
 * The middle break-even year of a list (the lower middle for an even count), where null (no
 * break-even within the horizon) counts as later than any year. Null when the middle is null
 * or the list is empty.
 */
export function middleYear(years: readonly (number | null)[]): number | null {
  if (years.length === 0) return null;
  const sorted = [...years].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

export interface NationSpread {
  count: number;
  middle: number | null;
  /** Areas where buying pulls ahead within `within` years. */
  withinCount: number;
  within: number;
  /** Areas where renting comes out ahead for the whole horizon. */
  noneCount: number;
  horizon: number;
}

export function nationSpread(
  years: readonly (number | null)[],
  horizon: number,
  within = 5,
): NationSpread {
  return {
    count: years.length,
    middle: middleYear(years),
    withinCount: years.filter((year) => year !== null && year <= within).length,
    within,
    noneCount: years.filter((year) => year === null).length,
    horizon,
  };
}

const areasWord = (count: number) => `${count} ${count === 1 ? 'area' : 'areas'}`;

/**
 * "At typical assumptions, buying pulls ahead within 5 years in 30 of Scotland's 32 areas, and
 * the middle answer is 2 years. Renting comes out ahead for all 25 years in 1 area."
 */
export function spreadSentence(spread: NationSpread, nationName: string): string {
  const middle =
    spread.middle === null
      ? `the middle answer is no break-even in ${yearsText(spread.horizon)}`
      : `the middle answer is ${yearsText(spread.middle)}`;
  const share =
    spread.withinCount === spread.count && spread.count > 1
      ? `all ${spread.count} of ${possessive(nationName)} areas`
      : `${spread.withinCount} of ${possessive(nationName)} ${areasWord(spread.count)}`;
  const first = `At typical assumptions, buying pulls ahead within ${yearsText(spread.within)} in ${share}, and ${middle}.`;
  if (spread.noneCount === 0) return first;
  return `${first} Renting comes out ahead for all ${spread.horizon} years in ${areasWord(spread.noneCount)}.`;
}

/** "Across England's 296 areas, the middle answer at typical assumptions is 3 years." */
export function middleSentence(spread: NationSpread, nationName: string): string {
  const answer =
    spread.middle === null
      ? `no break-even in ${yearsText(spread.horizon)}`
      : yearsText(spread.middle);
  return `Across ${possessive(nationName)} ${areasWord(spread.count)}, the middle answer at typical assumptions is ${answer}.`;
}

// ---------------------------------------------------------------------------------------------
// Property tax per nation
// ---------------------------------------------------------------------------------------------

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Stamp duty (SDLT)", "Land and Buildings Transaction Tax (LBTT)". */
export function taxLabel(regime: Pick<TaxRegime, 'name' | 'shortName' | 'plainName'>): string {
  const plain = regime.plainName.trim();
  const name =
    plain !== '' && plain.toLowerCase() !== regime.name.toLowerCase()
      ? capitalise(plain)
      : regime.name;
  return `${name} (${regime.shortName})`;
}

/** The first band's upper limit when its rate is 0 (the nil band), else 0. */
function nilBand(bands: readonly TaxBand[]): number {
  const first = bands[0];
  return first && first.rate === 0 && first.to !== null ? first.to : 0;
}

export interface TaxSummaryInput {
  nationName: string;
  regime: TaxRegime;
  /** True when this nation shares the regime with another (Northern Ireland uses SDLT). */
  sharedWith: string | null;
  /** Buyer's survey default in this nation and the Home Report the seller pays (defaults.json). */
  survey: number;
  homeReport: number;
  taxYear: string;
}

/**
 * Plain sentences on the property tax in a nation, from taxRules.json and defaults.json:
 * what it is, the nil band, first-time buyer relief, the extra on an additional home, and the
 * Home Report in Scotland.
 */
export function taxSummary(input: TaxSummaryInput): string[] {
  const { regime, nationName } = input;
  const label = taxLabel(regime);
  const shared = input.sharedWith ? `, the same tax as in ${input.sharedWith}` : '';
  const lines = [
    `${label} applies to homes bought in ${nationName}${shared}. The buyer pays it once, at completion: each slice of the price is taxed at its band's rate.`,
  ];
  const nil = nilBand(regime.bands);
  const ftb = regime.firstTimeBuyer;
  const main =
    nil > 0 ? `Nothing is due on the first ${formatMoney(nil)}` : 'Tax is due from the first pound';
  if (ftb === null) {
    lines.push(`${main}. There is no first-time buyer relief.`);
  } else {
    const ftbNil = nilBand(ftb.bands);
    const cap =
      ftb.maxPrice === null
        ? 'with no price limit'
        : `on homes up to ${formatMoney(ftb.maxPrice)}; above that there is no relief`;
    lines.push(`${main}, or the first ${formatMoney(ftbNil)} for a first-time buyer, ${cap}.`);
  }
  const extra = regime.additional;
  lines.push(
    extra.kind === 'wholePriceSurcharge'
      ? `Buying an additional home adds ${roundPercent(extra.rate)} of the whole price${
          regime.shortName === 'LBTT' ? ' (the Additional Dwelling Supplement)' : ''
        }, from ${formatMoney(extra.minPrice)}.`
      : `An additional home is taxed on a higher-rates table instead, from ${formatMoney(extra.minPrice)}.`,
  );
  if (input.homeReport > 0) {
    lines.push(
      `Sellers in ${nationName} pay for a Home Report (a survey and valuation), so the calculator sets the buyer's survey to ${formatMoney(input.survey)} and adds ${formatMoney(input.homeReport)} to the selling costs.`,
    );
  }
  lines.push(`Rates for the ${input.taxYear} tax year.`);
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

/** A dataset's short name: "Price Index of Private Rents, UK: monthly ..." -> "Price Index of Private Rents". */
export function shortDataset(dataset: string): string {
  return (dataset.split(/[,(]/)[0] ?? dataset).trim();
}

/**
 * "Figures from the UK House Price Index (HM Land Registry with ONS), the Price Index of Private
 * Rents (Office for National Statistics) and Quoted household interest rates (Bank of England)."
 */
export function sourcesSentence(
  sources: readonly Pick<DataSource, 'dataset' | 'publisher'>[],
): string {
  const parts = sources.map((source) => {
    const name = shortDataset(source.dataset);
    const article = /^(UK |Price Index)/.test(name) ? 'the ' : '';
    return `${article}${name} (${source.publisher})`;
  });
  if (parts.length === 0) return '';
  const list =
    parts.length === 1
      ? (parts[0] ?? '')
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
  return `Figures from ${list}.`;
}
