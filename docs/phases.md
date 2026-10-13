# Phases

Each phase lands as one PR into `main`. The phase team appends its handoff notes here: what shipped, what's deferred, and anything the next phase must know.

| # | Phase | Branch | Status |
|---|---|---|---|
| 1 | Scaffold, CI and deploy | `phase/1-scaffold` | In review |
| 2 | Brand and layout shell | `phase/2-brand` | In review |
| 3 | Engine and data pipeline | `phase/3-engine` | In review |
| 4 | Calculator UI | `phase/4-calculator` | Not started |
| 5 | Area, nation and content pages, SEO | `phase/5-pages` | Not started |
| 6 | Accessibility, performance and end-to-end | `phase/6-hardening` | Not started |

## Handoff notes

### Phase 1: scaffold, CI and deploy

What shipped:
- Astro 7 (static output) + TypeScript (strictest) + Preact 10 integration. Versions and the reasons for the pins (Preact 10, TypeScript 6.0, Playwright 1.56.1) are in `docs/decisions.md` under "Tooling (phase 1)".
- `astro.config.mjs` reads `SITE_URL` (default `https://jordanl17.github.io`) and `BASE_PATH` (default `/HouseSums`) from the environment. `trailingSlash: 'always'`, `build.format: 'directory'`.
- `src/lib/url.ts`: `url(path)` builds internal URLs under the base path, plus the pure helpers `joinBase(base, path)` and `normaliseBase(base)`. Unit tests in `src/lib/url.test.ts`.
- `src/layouts/Base.astro` with props `title?`, `description?`, `noindex?`. It sets `lang="en-GB"`, the canonical link, a header link home and the footer disclaimer. `src/styles/base.css` is deliberately plain (system-ui).
- Placeholder `src/pages/index.astro` (ships zero JS) and `src/pages/404.astro` ("This page has moved out. No deposit returned." with a link home).
- ESLint flat config (typescript-eslint, eslint-plugin-astro, eslint-config-prettier) and Prettier. `npm run lint` checks both and never changes files.
- Vitest for `src/**/*.test.ts`: 25 tests on `url.ts`, including fast-check property tests. Writing them found and fixed two edge cases (repeated slashes inside the base; a bare `//` being treated as an external URL).
- Playwright (`playwright.config.ts`, `tests/e2e/smoke.spec.ts`) with projects `mobile-360` and `desktop-1280`, served by `astro preview` on the built site. Per width: the home page loads with its heading, line and footer; no horizontal scroll; no JavaScript requested; the 404 page returns 404 with the brief copy and its home link goes to the base path.
- `scripts/check-budget.mjs` (`npm run budget`): fails if the raw bytes of all `.js`/`.mjs`/`.cjs` files in `dist/` exceed 100KB. Currently 22,904 bytes, all Preact renderer chunks that no page loads.
- `.github/workflows/ci.yml`: on every pull request and every push. Node from `.nvmrc` with npm cache; `npm ci`, check, lint, test, build, budget, then installs Chromium and runs the e2e tests. Uploads the Playwright report on failure. Superseded runs are cancelled.
- `.github/workflows/deploy.yml`: on push to `main` and by hand. Builds with `BASE_PATH=/HouseSums` and `SITE_URL=https://jordanl17.github.io`, runs the budget and deploys to GitHub Pages. Concurrency group `pages`, never cancelled mid-deploy.
- README covering the project, commands, configuration and how deploys work.

Deferred or blocked:
- **GitHub Pages is not switched on yet.** It needs Jordan (repo admin) to set Settings, Pages, Source: GitHub Actions, and, because the repo is private, either a paid plan or making the repo public. Until then the deploy workflow fails at "Configure Pages" on the first push to `main`. See README, "Turning on GitHub Pages".
- The budget script has no unit tests, because Vitest only includes `src/**/*.test.ts`. If that matters, move its sum and table logic into `src/lib` or widen the Vitest include.
- CI does not cache the Playwright browser download. Add a cache for `~/.cache/ms-playwright` if the install step gets slow.

What the next phase must know:
- Phase 2 owns the look. Replace `src/styles/base.css` and restyle `Base.astro`, keeping its props. Fonts are already installed (`@fontsource/b612`, `@fontsource/b612-mono`); import them from the layout so they are bundled and self-hosted.
- Always link with `url()` from `src/lib/url.ts`. Never write `/HouseSums` or a leading-slash path by hand.
- `src/components/Hello.tsx` is a throwaway component that proves the Preact JSX setup compiles. Delete it when the first real island lands.
- `astro preview` 404s on paths without a trailing slash (GitHub Pages redirects instead). Link to `url('sources')`, which gives `/HouseSums/sources/`.
- Run `npm run build` before `npm run test:e2e`; the e2e tests serve `dist/`. They navigate with relative paths (`./`, `this-page-does-not-exist/`) against a `baseURL` that includes the base path, so new tests should do the same.
- The 404 test finds the home link inside `<main>` by an accessible name matching `/home/i` (the header also links to the base). Keep "home" in that link text when restyling, or update the test.
- The no-JS e2e test asserts the home page loads no scripts. Phase 4 must change it when the calculator island lands on `/`.
- Playwright is pinned to 1.56.1 to match the container's Chromium. Do not run `playwright install` locally.
- CI and deploy actions are pinned to the major tags listed in `docs/decisions.md`. Phase 3's `refresh-data.yml` should use the same versions.

### Phase 2: brand and layout shell

In review. The whole visual identity is HTML and CSS only; no page ships client JS. Decisions are in `docs/decisions.md` under "Design system (phase 2)", "Page shell (phase 2)", "UI primitives (phase 2, primitives)", "Integration (phase 2)" and "Review round 1 (phase 2)".

What shipped:
- **Tokens** (`src/styles/tokens.css`): every brief colour for light and dark (`prefers-color-scheme`), plus `--color-control-edge` for input edges, spacing (`--space-*`, 4px base), radius (`--radius-card` 26px, `--radius-pill` 999px), type families and scale (`--size-answer` for the answer numeral only), focus and layout tokens, and `--contour-background` (circle at 85% 12%, 1.5px lines every 26px, ink at 9% light and light ink at 10% dark), fixed to the body. `scripts/check-tokens.mjs` (in `npm run lint`) fails on any colour literal outside tokens.css.
- **Fonts**: B612 400/700 and B612 Mono 400/700, latin subset, `font-display: swap`, self-hosted via `@fontsource`. `src/styles/fonts.css` borrows only the comma and full stop from B612 for mono figures, so "245,000" does not read as "245, 000".
- **Stylesheets**, all global and imported by `Base.astro` in this order: fonts, `fonts.css`, `tokens.css`, `base.css` (reset, type, utilities, `.container`, `.prose`, `.calc-layout`), `ui.css` (one file per primitive in `src/styles/ui/`), `shell.css` (skip link, header, logo, nav, footer).
- **Logo** (`src/components/Logo.astro`, props `size`, `wordmark`, `label`, `class`): the "Sun on the sill" mark (hi-vis half sun with an ink outline in light, three ink rays, ink horizon) and the "House Sums" wordmark in B612 Bold. `public/favicon.svg` is the same mark and switches colours with `prefers-color-scheme` inside the SVG.
- **Shell** (`Base.astro`, props unchanged): skip link to `<main id="main">`, header with the logo linking home and nav "How it works" and "Sources" (`aria-current` on the current page), footer with the disclaimer, About and Sources links and the tagline. `lang="en-GB"`, left-aligned, 1200px max width, 16px gutters on mobile and 24px from 48rem.
- **Pages**: home placeholder (the real h1 and one plain line, no hero or CTA); 404 with the brief copy; stub `/how-it-works/`, `/sources/` and `/about/` with two or three honest sentences each and no figures.
- **UI primitives** (`src/components/ui/`): Card, Button, Field, Slider, Segmented, Tag, Disclosure, KeyNumber, AnswerNumeral, DataTable, plus `ExampleChart.astro` (static SVG chart with HTML labels). Prop contracts in `src/components/ui/types.ts`.
- **/styleguide/** (noindex, unlinked): a static example of the calculator's first screen labelled "Example figures, not a real calculation", then every primitive in a pinned light panel and a pinned dark panel.
- **Focus**: 3px hi-vis ring inside a 2px ink outline on every `:focus-visible`, 3:1 against neighbours in both themes; forced-colours keeps the outline.
- **Contrast guard** (`scripts/check-contrast.mjs`, unit-tested in `npm test` and run by `npm run lint`): 28 token pairs, light and dark, plus a scan that fails if rent, hi-vis, focus-ring, contour or buy-fill is ever used as a text colour.
- **e2e** (`tests/e2e/`): every page in `PAGES` (home, how it works, sources, about, styleguide) returns 200 with its h1, header and footer, has no horizontal scroll at 360 and 1280, loads no JS, and has no em-dashes or exclamation marks; every header and footer link resolves; light and dark backgrounds match the tokens (dark asserted as the dark concrete token); the first tab stop shows the focus ring; the styleguide's first screen fits at 1280x800 and stacks answer-after-area-and-price at 360. All relative paths, so the suite runs against the live site too.

Deferred:
- The e2e suite has run only against `astro preview` locally and in CI; the live run happens after the merge deploys (and needs GitHub Pages switched on, see phase 1).
- Chart hover tooltip, a scroll wrapper for a wider year-by-year table, a "Reset" link style, and the Outlook "Custom" state: phase 4.
- Real copy for the stub pages, and leaving `/styleguide/` out of the sitemap: phase 5.

What the next phase must know:
- Pages put content straight into the `Base` slot: `<main>` already carries `.container`. Use `.prose` for text pages and `.calc-layout` for the calculator. Do not add a second `.container`.
- Never write a colour literal outside tokens.css; add a token there (light and dark) and, if it is a new text/background pair, a row in `CONTRAST_PAIRS`.
- Rent orange and hi-vis are never text. Label the rent line in ink; text on hi-vis is `--color-on-hi-vis`.
- Print is part of the slop check. Dark tokens are screen-only, so print is always light; `base.css` holds the print block and each primitive whose meaning lives in a background (segmented, slider, chart) has its own `@media print` rule. Keep that pattern for anything new, and check with a PDF render with background graphics off.
- The styleguide's 1280x800 fold test checks the whole answer card, down to the key numbers. The real page must keep the same: area, price and the answer card in the first 800px.
- Phase 4 must update the no-JS assertions for `/` (in `smoke.spec.ts` and through `PAGES` in `pages.spec.ts`) when the island lands. Add new pages to `PAGES` in `tests/e2e/helpers.ts` to give them the shared checks.

#### Primitives (for phase 4)
Files: `src/components/ui/*.astro` (Astro reference markup), `src/components/ui/types.ts` (prop contracts), `src/styles/ui/*.css` (one file per primitive, imported by `src/styles/ui.css`). All classes are global, so Preact components only need the same markup and class names. `/styleguide/` (`src/pages/styleguide.astro`) shows each one, in both themes, plus a static first screen of the calculator. Its example data is in `src/components/styleguide/example-data.ts` and is not model output.

How to build the calculator page from them:
- Layout: `.calc-layout` with `__primary` (Area, Property price), `__answer` (a `.card` holding `.answer`, the chart and `<dl class="key-numbers">`) and `__rest` (Buyer, Deposit, Monthly rent, Mortgage rate, House price growth, Outlook, then the "Adjust every assumption (18)" disclosure). Put fields in `<div class="fields"><div class="fields__grid">`; give segmented controls and the disclosure `fields__wide`.
- Field: `.field` > `.field__head` (`.field__label` + optional `.tag`), `.field__control` (`.field__affix--prefix`, `.field__input`, `.field__affix--suffix`), then an optional `.slider`, `.field__hint` and `.field__error`. `aria-describedby` on the input lists `{id}-prefix` and `{id}-suffix` (the unit spans) first, then `{id}-hint` and `{id}-error`, so units are announced with the value; keep that order in Preact. Set `aria-invalid="true"` for errors; the pill draws the focus ring with `:focus-within`. Use `.field__input--text` for the area name.
- Segmented: `fieldset.segmented` > `legend.segmented__legend` + `.segmented__options` > `label.segmented__option` > `input.segmented__input[type=radio]` + `span.segmented__label`. Native radios, so arrow keys work with no JS. Add a "Custom" option or label for the Outlook when a value is edited.
- Tag: `.tag--local` (hi-vis) / `.tag--typical` (tag-alt); put the source and month in `title` or an adjacent hint, never in upper case. In a half-width field the tag wraps under the label; if that misaligns a row, move the tag to the hint line.
- Answer: `.answer__sentence` with `__lead`, `__numeral`, `__unit`; `.answer__note` for the one explaining sentence. For "Renting comes out ahead for all 25 years" there is no numeral: render the sentence in `.answer__lead` only.
- Slider: `aria-label` is the field's label ("Property price"), never "... slider".
- Chart: port `src/components/ui/ExampleChart.astro` (markup documented in its header) and keep `chart.css`. The hover tooltip is new work; direct labels hang left of the point when above the line and right when below (both series rise), so recheck that if a series can fall; keep the frame `role="img"` with a summary, and the year-by-year `DataTable` (with `rowHeader`) in a `.disclosure` as the table alternative.
- Key numbers: `dl.key-numbers` > `.key-number` (dt label, dd with `__figure` and `__unit`). Each is a two-row subgrid so figures line up across a row.
- Buttons: `.button--primary` at most once per view.

Deferred: a scroll wrapper for wide tables (the year-by-year table may need `overflow-x: auto` with a focusable region at 360px once it has more columns); the chart tooltip; a "Reset" link style next to changed inputs (a plain `a` or `.button--secondary` at small size is enough).

### Phase 3: engine and data pipeline

In review. A pure TypeScript engine (no DOM, no JSON imports, no figures in code) plus the monthly data pipeline, which has run green in GitHub Actions and produced the first real data snapshot. No page imports the engine yet, so client JS is unchanged (22,904 bytes). Decisions are in `docs/decisions.md` under "Engine contracts (phase 3)", "Tax rules verification (phase 3)", "Model conventions (phase 3)", "URL state keys (phase 3)" (with "Formatting"), "Data pipeline (phase 3)" and "Integration (phase 3)".

What shipped:
- **Tax** (`src/lib/tax.ts`, `data/taxRules.json`): `propertyTax({ nation, buyerType, price }, rules)` returns `{ regime, total, bands, reliefApplied, surcharge }`; `regimeFor(nation, rules)`. 2026/27 SDLT, LBTT and LTT, first-time buyer relief, surcharges and the £40k threshold, all from the rules file (`schemaVersion`, `effectiveFrom: 2026-04-01`, `taxYear: 2026/27`, official source URLs per regime). Totals round down to whole pounds. Checked against official pages through domain-restricted search on 13 October 2026; no official source contradicts the brief. 59 tests: the brief's 10 cases, band edges, £40k, England's £500,000/£500,001 cliff, the WRA's worked example, zero/negative/NaN prices and fast-check invariants.
- **Model** (`src/lib/model.ts`): `runModel(inputs, taxRules, { sensitivity })` returns `breakEvenYear`, `rentingOvertakesAgainYear`, `series` (year 0 = day one to `years`: buy and rent wealth, balance, home value, portfolios, amounts paid), `firstMonth`, `upfront`, `tax`, `selling` and 8 `sensitivity` rows (growth 0-5%, then rate and rate after fix -1/+1 point). Also `monthlyPayment`, `upfrontCosts`, `sellingCosts`. About 0.03ms for 40 years with sensitivity. **All five brief model cases pass exactly with nothing skipped**: £1,336.15, £1,615.32, £4,099, break-even 11/5/3/2/1/1, and £181,199.60 vs £87,864.31 at 10 years. The reference scenario's rent growth is not stated in the brief; 3.5% is the value that reproduces it, and the fixture says so. Four fast-check invariants in `model.property.test.ts`.
- **Defaults and derivation** (`data/defaults.json`, `src/lib/defaults.ts`): every brief default and the three Outlook presets as data, each field with label, unit, level, min/max/step and source note. `deriveInputs({ area, areas, rates, defaults, selection, overrides })` returns `{ inputs, base, provenance }`; `findArea`, `pickMortgageRate`. Provenance is `local` (area's own figure, with source and month) or `typical` (nation fallback, fixed default, Bank of England rate, or preset-adjusted).
- **Format and URL state** (`src/lib/format.ts`, `src/lib/state.ts`): `formatMoney`, `formatPercent`, `formatYears`, `parseMoney`, `parsePercent`, `MINUS` (U+2212). `encodeState(state, base, defaults)` / `decodeState(search, defaults, knownAreas?)` with short stable keys (`SELECTION_PARAMS`, `INPUT_PARAMS`), only non-default values, a round-trip property test and safe handling of unknown or junk params.
- **Data** (`data/areas.json`, `rates.json`, `sources.json`, `brma-map.json`): 361 ONS local authorities (296 England, 32 Scotland, 22 Wales, 11 NI). Prices UK HPI July 2026 (NI quarterly, June 2026); rents ONS private rents August 2026 (NI June 2026); Bank of England quoted rates September 2026, nine series with codes and descriptions in `sources.json`. Two areas use nation fallbacks: Isles of Scilly (all four figures) and City of London (rent and rent growth). Scotland and NI rents map councils to Broad Rental Market Areas via `brma-map.json` (ONS's own best-match method, written in the file). No sample flags remain.
- **Pipeline** (`scripts/refresh-data.ts`, `scripts/validate-data.ts`, `scripts/data/**`, `.github/workflows/refresh-data.yml`): fetch, transform, validate (missing price or rent, more than 15% moves in prices and rents with point limits for rates, slug collisions, count drops, fallback share, series descriptions, BRMA coverage), job summary, artifact. Monthly at 06:17 UTC on the 20th and by hand: commits to `data/refresh-YYYY-MM` and opens a PR, or prints the compare URL. Push to `data-test/**`: dry run, which also pushes the files to `data-snapshot/<name>`. Dry run 38421635252 on `data-test/refresh` was green; the committed files are byte-identical to `data-snapshot/refresh`. 54 pipeline tests on fixtures. `npm run data:validate` checks the committed files.

Deferred or needing Jordan:
- **Repo setting for the refresh PR:** Settings, Actions, General, "Allow GitHub Actions to create and approve pull requests". Without it the scheduled run pushes the branch and prints the compare URL. PRs opened with `GITHUB_TOKEN` don't trigger CI, so the refresh job runs `npm test` and `npm run build` itself.
- **Tax rules were checked through search extracts**, not a direct read: this container cannot resolve gov.uk, revenue.scot or gov.wales. Re-read the six pages listed in `taxRules.json` before launch and after each Budget.
- **The Bank publishes no 5-year 85% LTV quoted rate**, so `rates.json` has nine rates. A 5-year fix at 75-85% LTV uses the 5-year 90% rate (tested).
- **Growth invariant at the extremes.** "Growth up never makes break-even later" holds over realistic ranges but can fail at the corners of the UI bounds (5% maintenance with 15% returns), following from the brief's formulas. It is pinned by a named test. Narrowing `maintenanceRate` or `investmentReturn` max in `defaults.json` is a product call.
- **Awkward ONS slugs:** `kingston-upon-hull-city-of`, `bristol-city-of`, `herefordshire-county-of`. Decide display names or redirects before launch (phase 5).
- Leftover temporary branches `data-test/probe` and `probe-out` could not be deleted from the container (403). Delete them by hand. Keep `data-test/refresh` (pushing to it re-runs the dry run) and `data-snapshot/refresh`.

What the next phases must know:
- **Loading data.** Import the JSON in the page or island and validate it once with `parseAreasFile`, `parseRatesFile`, `parseSourcesFile`, `parseTaxRules` and `parseDefaults` from `src/lib/schema.ts` (they throw `DataError` with the JSON path). The engine modules never import JSON themselves. `areas.json` is about 90KB of JSON: phase 4's island should not ship the whole file to the client if it can avoid it (for example, pass only the picked area and the nation figures as props on area pages, and lazy-load the list for the picker on `/`); keep the JS budget in mind.
- **The flow for the calculator:** `decodeState(location.search, defaults, slugSet)` gives `{ selection, overrides }`; `findArea(areas, selection.areaSlug)`; `deriveInputs({ area, areas, rates, defaults, selection, overrides })` gives `inputs`, `base` (what each "Reset" restores) and `provenance` (tag "Local figure" or "Typical figure", with `source` and `month` for the tooltip); `runModel(inputs, taxRules)`; `encodeState({ selection, overrides }, base, defaults)` for the URL. Pass the user's raw overrides, not the full inputs. Use `{ sensitivity: false }` for live recalculation if you want and run sensitivity separately; both are fast enough to run every frame.
- **Outlook "Custom"** shows when any of houseGrowth, rentGrowth, investmentReturn or rateAfterFix is overridden. The engine and URL only carry `cautious`, `typical` or `optimistic`.
- **Normalise before encoding** if you want the shortest links: `state.ts` does not clamp the deposit to the price or drop a `nationOverride` equal to the area's nation. The model caps the deposit at the price itself.
- **Formatters return ""** for non-finite values; the UI decides what to show. `parseMoney` rejects "300 pcm" and "1 000" on purpose.
- **Tax display:** for England and Scotland additional-property purchases, `bands` is the main table and the extra is `surcharge` (show it as, for example, "ADS £24,000"); for Wales `bands` is the higher-rates table. `reliefApplied` drives "First-time buyer relief applied". Band tax plus a whole-price surcharge can be up to £1 above `total` because of rounding down.
- **Series and answer copy:** `breakEvenYear` null means "Renting comes out ahead for all N years"; `rentingOvertakesAgainYear` drives the "renting catches up again" note; `firstMonth.rent` is the year-1 rent; `series[10]` gives the 10-year difference for the key numbers.
- **Raw data is unclamped.** `growth10y` is negative for some areas (Westminster, City of London, Aberdeen) and rent growth runs to about 13%; `deriveInputs` applies the brief's clamps. Area pages that quote the raw figure should say it is the 10-year average, and the answer should always come from `deriveInputs` + `runModel`.
- **Per-area months:** NI areas and the NI nation figures carry `asOf` (June 2026). Show the area's own month where present, else the file's.
- **Sources page (phase 5)** should read `data/sources.json` (dataset, publisher, URL, licence, licence URL, asOf, notes, Bank series). The Bank of England data is under OGL v3 (bankofengland.co.uk/legal). The brief's "why now" rates are Moneyfacts figures; the site uses the Bank's lower quoted rates.
- **Explainer assumptions (phase 5)** should add the tax cases left out: the 2% SDLT non-resident surcharge, companies and trusts, shared ownership, and the refund of higher rates when a previous home sells later. Inflation uprates insurance and the service charge only; selling costs are not uprated.

