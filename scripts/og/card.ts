/**
 * The Open Graph cards (1200x630): one per nation plus the site default. Pure: builds the card's
 * words and its HTML page; scripts/og/generate.ts renders the pages with Playwright and writes
 * the PNGs to public/og/.
 *
 * The card is the site in miniature, not an advert: concrete with the contour circles, the logo
 * and wordmark, a plain heading, one hi-vis tag and the tagline. No figures (they change every
 * month and the PNGs are committed), no imagery, and no colour literals: the page links
 * src/styles/tokens.css and shell.css and uses var(--...) only.
 */
import { NATION_NAMES, NATION_SLUGS } from '../../src/lib/nations';
import { NATIONS, type Nation, type TaxRules } from '../../src/lib/types';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export interface Card {
  /** File name under public/og/, without .png: "default", "scotland"... */
  name: string;
  heading: string;
  subheading: string;
  /** The hi-vis tag. */
  tag: string;
  /** The second, quieter tag. */
  tagAlt: string;
}

/** The property tax line: "Property tax: LBTT", or for the default card "SDLT, LBTT and LTT". */
function taxShortName(nation: Nation, taxRules: TaxRules): string {
  return taxRules.regimes[taxRules.nations[nation]].shortName;
}

/** Every card: the site default first, then one per nation in NATIONS order. */
export function cards(taxRules: TaxRules): Card[] {
  const shortNames = [...new Set(NATIONS.map((nation) => taxShortName(nation, taxRules)))];
  const allTaxes =
    shortNames.length > 1
      ? `${shortNames.slice(0, -1).join(', ')} and ${shortNames[shortNames.length - 1]}`
      : (shortNames[0] ?? '');
  return [
    {
      name: 'default',
      heading: 'Rent v buy',
      subheading: 'How long until buying beats renting?',
      tag: 'Area-by-area figures across the UK',
      tagAlt: allTaxes,
    },
    ...NATIONS.map((nation) => ({
      name: NATION_SLUGS[nation],
      heading: `Rent v buy in ${NATION_NAMES[nation]}`,
      subheading: 'How long until buying beats renting?',
      tag: 'Area-by-area figures',
      tagAlt: `Property tax: ${taxShortName(nation, taxRules)}`,
    })),
  ];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The logo's three shapes, copied from src/components/Logo.astro so there is one drawing. */
export function logoShapes(logoSource: string): string {
  const shapes = logoSource.match(/<(path|rect)\b[^>]*>(?:<\/\1>)?/g);
  if (!shapes || shapes.length < 3) {
    throw new Error('Could not find the logo shapes in src/components/Logo.astro');
  }
  return shapes.join('');
}

/**
 * A standalone HTML page for one card. `stylesheets` are file:// URLs, in order: the fonts,
 * tokens.css and shell.css. `logo` is logoShapes() output.
 */
export function cardHtml(card: Card, stylesheets: readonly string[], logo: string): string {
  const links = stylesheets
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join('\n');
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${escapeHtml(card.heading)}</title>
${links}
<style>
  html, body { margin: 0; }
  body {
    width: ${OG_WIDTH}px;
    height: ${OG_HEIGHT}px;
    box-sizing: border-box;
    padding: 72px 80px 64px;
    display: flex;
    flex-direction: column;
    background-color: var(--color-concrete);
    background-image: var(--contour-background);
    color: var(--color-ink);
    font-family: var(--font-sans);
  }
  .logo { --logo-size: 56px; }
  .card__body { margin-top: auto; }
  h1 {
    max-width: 960px;
    margin: 0;
    font-size: 76px;
    font-weight: var(--weight-bold);
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-heading);
  }
  .card__sub {
    margin: 20px 0 0;
    font-size: 36px;
    line-height: var(--leading-tight);
    letter-spacing: var(--tracking-heading);
  }
  .card__tags { display: flex; gap: 16px; margin-top: 36px; }
  .card__tag {
    padding: 6px 22px;
    white-space: nowrap;
    border-radius: var(--radius-pill);
    font-family: var(--font-mono);
    font-size: 26px;
    line-height: var(--leading-body);
    color: var(--color-ink);
    background-color: var(--color-tag-alt);
  }
  .card__tag--hi-vis { background-color: var(--color-hi-vis); color: var(--color-on-hi-vis); }
  .card__foot {
    margin: 48px 0 0;
    font-family: var(--font-mono);
    font-size: 26px;
    color: var(--color-muted);
  }
</style>
</head>
<body>
  <span class="logo">
    <svg class="logo__mark" width="56" height="56" viewBox="0 0 24 24" aria-hidden="true">${logo}</svg>
    <span class="logo__word">House Sums</span>
  </span>
  <div class="card__body">
    <h1>${escapeHtml(card.heading)}</h1>
    <p class="card__sub">${escapeHtml(card.subheading)}</p>
    <p class="card__tags">
      <span class="card__tag card__tag--hi-vis">${escapeHtml(card.tag)}</span>
      <span class="card__tag">${escapeHtml(card.tagAlt)}</span>
    </p>
  </div>
  <p class="card__foot">The maths of moving in.</p>
</body>
</html>
`;
}
