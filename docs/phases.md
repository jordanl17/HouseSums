# Phases

Each phase lands as one PR into `main`. The phase team appends its handoff notes here: what shipped, what's deferred, and anything the next phase must know.

| # | Phase | Branch | Status |
|---|---|---|---|
| 1 | Scaffold, CI and deploy | `phase/1-scaffold` | Merged |
| 2 | Brand and layout shell | `phase/2-brand` | Merged |
| 3 | Engine and data pipeline | `phase/3-engine` | Merged |
| 4 | Calculator UI | `phase/4-calculator` | Merged |
| 5 | Area, nation and content pages, SEO | `phase/5-pages` | Merged |
| 6 | Accessibility, performance and end-to-end | `phase/6-hardening` | In review |

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
- **GitHub Pages was not switched on** when phase 1 was written. Resolved: the repository is public, Pages is switched on and the site is live at <https://jordanl17.github.io/HouseSums/>. Every deploy since the phase 1 merge has deployed and then run the whole e2e suite against the live site (fact updated in phase 6).
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

Merged (PR #2). The whole visual identity is HTML and CSS only; no page ships client JS. Decisions are in `docs/decisions.md` under "Design system (phase 2)", "Page shell (phase 2)", "UI primitives (phase 2, primitives)", "Integration (phase 2)" and "Review round 1 (phase 2)".

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
- The e2e suite had run only against `astro preview` when phase 2 was written. Resolved: the deploy's `live` job ran it against the live site after the phase 2 merge, and does after every deploy (fact updated in phase 6).
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

Merged (PR #3). A pure TypeScript engine (no DOM, no JSON imports, no figures in code) plus the monthly data pipeline, which has run green in GitHub Actions and produced the first real data snapshot. No page imports the engine yet, so client JS is unchanged (22,904 bytes). Decisions are in `docs/decisions.md` under "Engine contracts (phase 3)", "Tax rules verification (phase 3)", "Model conventions (phase 3)", "URL state keys (phase 3)" (with "Formatting"), "Data pipeline (phase 3)" and "Integration (phase 3)".

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


### Phase 4: calculator UI

Merged (PR #4). The lead set up the island, its contracts and stubs; three teammates (inputs, results, followups) filled them in parallel and the branches were merged without conflicts. Decisions: `docs/decisions.md`, "Calculator island (phase 4, lead)".

#### Island props (for phase 5 area pages)
`src/components/calculator/Calculator.tsx`, default export, props in `src/components/calculator/types.ts` (`CalculatorProps`):
- `data: CalculatorData`: `{ defaults, taxRules, rates, areasMeta }`. Get it from `calculatorData()` in `src/lib/calculator-data.ts` (validated at build, cached).
- `links: { areaList, howItWorks }`: `url('data/area-list.json')` and `url('how-it-works')`.
- `initialArea?: ClientArea | null`: the page's area, from `areaForPage(slug)`. The island server-renders the full answer for it at build time (same `deriveInputs` + `runModel` as the browser), so the area page's HTML carries the answer before any JS runs, and hydration matches it.
- `initialState?: { selection?, overrides? }`: starting selection or overrides (a nation page could pass `{ selection: { nationOverride: 'sco' } }`). Applied before the URL.
- `syncUrl?: boolean` (default true): read the query on load and keep it in sync with `replaceState`. On an area page, `a=` is left out while the picked area is `initialArea`.

Example: `<Calculator client:load data={calculatorData()} links={...} initialArea={areaForPage('leeds')} />`. For the page's own summary sentence, run `deriveInputs` + `runModel` at build with the same data (`areasFile()` gives the full file).

#### Phase 4 contracts (for the teammates)
Every child component gets one prop, `calc: CalcApi` (`InputsPanel` also gets `part`). Read state from it and change it only through its actions (`selectArea`, `setBuyerType`, `setOutlook`, `setNationOverride`, `setInput`, `resetInput`, `loadAreas`, `shareUrl`). `calc.field(key)` gives `{ spec, value, base, changed, provenance }` for any input. `calc.result` is the model output (null until an area is picked); `calc.status` is `empty`, `loading`, `ready` or `error` (`calc.problem` says why). Children never read or write the URL, fetch, or import JSON.

| Owner | Files (may create and edit) | Must not touch |
|---|---|---|
| lead | `Calculator.tsx`, `types.ts`, `ui/**` (primitives), `src/lib/area-list.ts`, `src/lib/calculator-data.ts`, `src/pages/index.astro`, `src/pages/data/area-list.json.ts`, `src/styles/calculator.css`, `src/styles/calculator/primitives.css`, `layout.css`, `src/styles/base.css`, `src/layouts/Base.astro`, `tests/e2e/helpers.ts`, `calculator-helpers.ts` (except `pickArea`), `calculator.spec.ts`, `smoke`/`pages`/`focus` specs, `playwright.config.ts`, `docs/*.md` | |
| inputs | `AreaPicker.tsx`, `InputsPanel.tsx`, `AdvancedPanel.tsx`, `src/styles/calculator/inputs.css`, the body of `pickArea()` in `tests/e2e/calculator-helpers.ts`, new `tests/e2e/inputs.spec.ts` and `tests/e2e/keyboard.spec.ts`, new pure helpers `src/lib/inputs.ts` (+ test) if needed | results and followups files, lead files |
| results | `AnswerCard.tsx`, `KeyNumbers.tsx`, `Chart.tsx`, `Sensitivity.tsx`, `Breakdown.tsx`, `HowThisWorks.tsx`, `src/styles/calculator/results.css`, new `src/lib/copy.ts` + `copy.test.ts`, new `src/lib/chart.ts` + test if needed, new `tests/e2e/results.spec.ts` | inputs and followups files, lead files |
| followups | `src/lib/defaults.ts` (the empty-rates error only) and `defaults.test.ts`, `scripts/data/**` validation and summary, `.github/workflows/refresh-data.yml`, `src/lib/model.property.test.ts`, `src/lib/analytics.ts` + `analytics.test.ts`, `ShareLink.tsx`, `src/styles/calculator/share.css`, new e2e specs `share-url.spec.ts`, `reference.spec.ts`, `nations.spec.ts`, `layout-shift.spec.ts` | the other calculator components, lead files |

If you need a change in a lead file (a new optional `CalcApi` field, a primitive option), make the smallest additive change and list it in your handoff. Do not edit `docs/*.md`: put decisions in your handoff and the lead records them.

**Test hooks** (`data-testid` unless it says id). Island: `calculator` (with `data-status` and `data-hydrated`), `answer-card` (the card section). Inputs: input ids `calc-{key}` for every key in `NUMERIC_INPUT_KEYS` (`calc-price`, `calc-homeReport`...) and `calc-area`; wrappers `field-calc-{key}` and `field-calc-area`; sliders id `calc-{key}-slider`; tags `tag-{key}`; Reset buttons `reset-{key}`; `buyer`, `outlook` (segmented fieldsets); `advanced` (the disclosure); nation override input id `calc-nation`, wrapper `field-calc-nation`. The Home Report field is not rendered outside Scotland. Results: `answer`, `answer-headline`, `answer-numeral`, `answer-note`, `answer-overtake`, `answer-flip`, `answer-empty`, `answer-live` (the polite live region); `key-numbers`, `key-cash`, `key-first-month`, `key-after`; `chart`, `chart-table`; `sensitivity`; `breakdown`, `breakdown-upfront`, `breakdown-selling`, `breakdown-tax` (the property tax line, naming the tax), `year-table`; `how-this-works`. Share: `share-link`, `share-status`. Helpers in `tests/e2e/calculator-helpers.ts`: `gotoCalculator`, `expectStatus`, `pickArea`, `input`, `answerBox`, `params`, `REFERENCE_QUERY`.

**Layout stability.** The answer card must not move or resize when inputs change: results reserve the space for every state (headline, note lines, chart height, key numbers), and the area and price fields (above the card at 360px) must not change height as values change (reserve the hint or note line).

**Budget.** With the stubs the island chunk is about 29KB raw and the total 52KB of 100KB. Aim to keep the island under 40KB: no new runtime dependencies, no charting library, no JSON imports in client code.

#### What shipped (phase 4)
Decisions: `docs/decisions.md`, "Calculator island (phase 4, lead)", "Inputs", "Results", "Follow-ups, analytics and sharing" and "Integration (phase 4)".

- **Home page.** The heading, then one Preact island (`client:load`): inputs left (Area and Property price first), answer card right at 1280; stacked at 360 with the card straight after area and price. Before an area: "Pick a place. We'll bring the local numbers." in a compact card; a link naming an area reserves the answer's size from the first paint (inline script in `index.astro`), so a shared link's answer arrives with no layout shift anywhere on the page.
- **Area picker** (`AreaPicker.tsx`): WAI-ARIA 1.2 combobox over 361 areas, matching without case, accents or punctuation, nation as secondary text. The list is `data/area-list.json` (static endpoint, about 26KB), fetched from our origin; failure is plain copy with "Try again".
- **Inputs** (`InputsPanel.tsx`, `AdvancedPanel.tsx`, `src/lib/inputs.ts`): every input in the brief's table, labels, units and limits from `defaults.json`; sliders on price, rent, rate and growth; "Local figure"/"Typical figure" toggletips with source and month; Reset on every changed input; money accepts "£300k" and formats on blur; calm inline notes (deposit clamp, under-5% lender note, range clamps, loan-to-value explained); Outlook shows "Custom" naming what changed; the advanced panel "Adjust every assumption (17)" (18 under Scottish rules, with the Home Report).
- **Results** (`AnswerCard`, `KeyNumbers`, `Chart`, `Sensitivity`, `Breakdown`, `HowThisWorks`, copy in `src/lib/copy.ts`, chart geometry in `src/lib/chart.ts`): every copy case (break-even, year 1, renting catches up again, no break-even with a model-checked "what would flip it" hint, no mortgage); key numbers; hand-rolled SVG chart with a keyboard/touch year inspector and a hidden table; sensitivity at 0-5% growth and the rate ±1 point; breakdown with the tax by name, relief or surcharge, selling costs and a collapsed year-by-year table.
- **State and URL.** One model run per animation frame; `history.replaceState` only, non-default values only; a copied link reproduces every figure in a fresh browser (e2e).
- **Analytics and sharing.** `src/lib/analytics.ts` (four events, no payload, GoatCounter count endpoint, off unless `PUBLIC_GOATCOUNTER_CODE`; the deploy build now passes `vars.GOATCOUNTER_CODE`). "Copy link to these figures" with a manual-copy fallback.
- **Phase 3 follow-ups.** `NoMortgageRatesError`; relative 15% rate check with a 0.25-point floor; fallback switches reported as warnings; `refresh-data.yml` split so only the PR job has `pull-requests: write`; rent-up and selling-costs-up invariants over the full UI bounds.
- **Review round 1 fixes.** Chart labels clear of the axis; compact empty card with no placeholder figures in the HTML; area's own data months in "How this works"; the "(now)" row and the growth field at the same precision; one polite, debounced live region for the answer; no shift on a shared-link load (share row reserved, sections under the card held until the answer); typed values kept at the precision shown, so links reproduce exactly. See `docs/decisions.md`, "Review round 1 (phase 4)".
- **Review round 2 fixes.** Chart labels stay inside the plot on 1 and 2-year horizons (half-year placement, at most 70% along, e2e on label bounds and `scrollWidth`); a small dip below £0 no longer costs a whole axis step; the live region adds "Renting catches up again in year M."; Segmented status lines describe their radios; links drop a Home Report left behind under another nation; flip-hint and years limits read from `defaults.json`; a light focus edge on hi-vis controls in dark; tidier copy. See `docs/decisions.md`, "Review round 2 (phase 4)".
- **Tests.** About 450 unit tests. e2e (about 280 runs across 360 and 1280, including `review.spec.ts`): inputs, keyboard-only flow, results copy, chart, share and URL round trip, the reference scenario on screen equal to `runModel`, nations (SDLT, LBTT with Home Report, LTT, override), and a per-frame layout-shift check through a long run of input changes and from the empty state to the first answer.
- **Budget.** Total client JS about 84KB of 100KB; the island chunk about 60KB, over the 40KB aim (see decisions).

#### Deferred (phase 4)
- **Island size** over the 40KB aim; phase 6 can lazy-load the breakdown and sensitivity or trim copy.
- **Long names at 360px.** 24 areas whose "years in ..." needs three lines make the card 7px taller when picked (only on that change).
- **refresh-data.yml** has only been checked statically since the job split. Push to `data-test/refresh` for a dry run before the scheduled run on the 20th.
- **Analytics is off** until Jordan creates a GoatCounter site and sets the `GOATCOUNTER_CODE` repository variable. With it set, the live smoke test "loads scripts only from our own origin" still holds (no script is loaded), but tests that pick an area would send events to it from CI; add a check or skip analytics on the live test run if that matters.
- Lighthouse runs are phase 6.
- **Live regions that unhide and fill in one render** (Field notes, the toggletip bubble) may not be announced by every screen reader; the note joins `aria-describedby`, so it is heard on return to the field. Phase 6 can keep them always present and hide them with CSS (tests rely on `toBeHidden`, so update them together).
- **Forced colours** (Windows High Contrast): slider tracks and the two chart line colours need `@media (forced-colors: active)` rules (phase 6).
- **Not taken from review round 2:** see the last item of "Review round 2 (phase 4)" in `docs/decisions.md`.
- **Not taken from review round 1:** a second chart marker at the year renting catches up again, spanning the sections under the card across both columns at wide widths, a surface behind the tables, a visible "Custom" outlook segment, keeping a price typed before the first area pick, and a "scroll sideways" hint on the year table at 360.

#### For phase 5
- Area pages render `ready` from the server, so they need no `data-calc-link` script; if an area page ever reads `?a=` for another area, add the same inline script as `index.astro`.
- Area pages: `<Calculator client:load data={calculatorData()} links={{ areaList: url('data/area-list.json'), howItWorks: url('how-it-works') }} initialArea={areaForPage(slug)} />` (props above). The whole answer, chart, key numbers, sensitivity and breakdown server-render from `initialArea`, so the HTML carries the computed answer. Use `src/lib/copy.ts` (`answerCopy`, `answerFacts`) for the page's own summary sentence so it matches the card.
- `HowThisWorks.tsx` links to `/how-it-works/`; that page and `/sources/` are yours. The explainer should state the brief's assumptions plus the tax cases listed in the phase 3 notes.
- Awkward ONS slugs (`kingston-upon-hull-city-of` and others) are still open; the picker shows the ONS names.


### Phase 5: area, nation and content pages, SEO

Merged (PR #5). The lead laid the foundations below; three teammates (areas, content, seo) filled the templates in parallel and the branches merged without conflicts. Decisions and file ownership: `docs/decisions.md`, "Pages and SEO (phase 5, lead)".

#### Foundations (lead)
- **Slugs.** `bristol`, `kingston-upon-hull`, `herefordshire` (display names without ", City of" / ", County of"; ONS name kept as `onsName`), from `data/area-names.json`, applied by the pipeline on every refresh and by `npm run data:names` to the committed file. Old slugs are aliases: `?a=bristol-city-of` opens Bristol. Area slugs never equal nation slugs (checked).
- **`src/lib/nations.ts`** (pure): `NATION_NAMES`, `NATION_SLUGS` (`england`, `scotland`, `wales`, `northern-ireland`), `nationFromSlug`, `isNationSlug`.
- **`src/lib/areas.ts`** (build time only; never import from client code): pure `sortByName`, `closestByPrice`, `areaMonths`, `nationMonths`, `onsName`, `isFallback`, `typicalAnswerSentence`; paths `areaPath`, `nationPath`, `nationsIndexPath`; over the committed data `allAreas`, `getArea`, `areasByNation`, `relatedAreas` (6, same nation, closest price), `nationFigures` (with months), `monthsFor`, `typicalSelection`, `typicalAnswer(area)` (`{ derived, result, copy, sentence }`, cached), `islandArea`, `rentVsBuyPaths`, `nationName`.
- **`src/lib/seo.ts`** (pure): title, description, canonical, OG image path and JSON-LD builders (see decisions).
- **Base.astro**: new optional props `ogImage`, `ogImageAlt`, `jsonLd`; OG and Twitter tags on every page.
- **Routes (skeletons, now owned by areas):** `src/pages/rent-vs-buy/[slug].astro` (areas and nations), `src/pages/rent-vs-buy/index.astro`; stub components `AreaSummary.astro`, `RelatedAreas.astro`, `NationTable.astro`. The area skeleton already renders the island with `initialArea`, so the answer is in the static HTML.
- **e2e `PAGES`** now includes `rent-vs-buy/`, `rent-vs-buy/scotland/`, `rent-vs-buy/leeds/` and `rent-vs-buy/kingston-upon-hull/` with their titles and h1s (the contract below).

#### Contracts for the teammates
- **Titles and h1s** (asserted by `PAGES` in `tests/e2e/helpers.ts`; keep them):
  - Area: title `areaTitle(name)` ("Rent or buy in Leeds? See your break-even year | House Sums"), description `areaDescription({ answer: typicalAnswer(area).sentence, price, rent })`, h1 "Rent v buy in Leeds: how long until buying beats renting?".
  - Nation: title `nationTitle(nation)`, description `nationDescription(nation, count)`, h1 "Rent v buy in Scotland".
  - `/rent-vs-buy/`: title and h1 "Rent v buy by nation".
  - `/how-it-works/` "How it works", `/sources/` "Sources", `/about/` "About House Sums" (h1s unchanged); content sets a unique description on each.
- **Test hooks** on area pages: the island's `answer-headline`, `answer-numeral` (server-rendered); `area-summary` (the summary section) and `area-summary-answer` (holds exactly `typicalAnswer(area).sentence`); `related-areas`; on nation pages `nation-areas` (the table). The seo teammate's dist test reads `answer-numeral` / `answer-headline` and `area-summary-answer` and compares them with its own `runModel(deriveInputs(...))`.
- **Island on area pages:** `<Calculator client:load data={calculatorData()} links={{ areaList: url('data/area-list.json'), howItWorks: url('how-it-works') }} initialArea={islandArea(area)} />`. One island per page; no other client JS on any page.
- **OG images:** `og/default.png` and `og/{england,scotland,wales,northern-ireland}.png` under `public/`, 1200x630. Base already points at them (`ogImagePath(nation)` on area and nation pages).
- **Links** always through `url()` or the path helpers in `areas.ts`. New pages that should get the shared e2e checks go in `PAGES` (tell the lead).

#### What shipped (phase 5)
Decisions: `docs/decisions.md`, "Pages and SEO (phase 5, lead)", "Area and nation pages", "Content pages", "SEO and quality gates" and "Integration (phase 5)".

- **Area pages** (`/rent-vs-buy/{slug}/`, 361): the h1 "Rent v buy in Leeds: how long until buying beats renting?", the island pre-filled with `initialArea` (the whole answer, chart, key numbers, sensitivity and breakdown are in the static HTML; the island hydrates on top), then "{Area} in figures": the answer at typical assumptions (`area-summary-answer`, exactly `typicalAnswer(area).sentence`), what typical means for this area, the nation's middle answer, price and rent against the nation in per cent, and a figures table of the area beside its nation with the month of each figure. Plain notes for falling prices (with the 0% floor), rent change outside 1-6%, nation fallbacks ("*", "(England figure)"), NI quarterly prices, Broad Rental Market Areas, and the ONS name where it differs. Then the six closest areas by price in the same nation (table with each break-even), and links to the nation page, How it works and Sources. Code: `src/lib/area-summary.ts`, additions to `src/lib/areas.ts`, `src/components/area/**`, `src/styles/area.css`.
- **Nation pages** (4) and **`/rent-vs-buy/`**: the nation's figures with months, how the answers spread, what typical assumptions mean, the property tax in plain sentences from `taxRules.json` (LBTT and the Home Report in Scotland, NI sharing SDLT with England), links to the other nations, and every area A to Z in a `.data-table` with price, rent and break-even. The index is a table of the four nations. The home page has one line of nation links under the island.
- **Slugs**: `bristol`, `kingston-upon-hull`, `herefordshire` via `data/area-names.json` in the pipeline; old slugs work as `?a=` aliases (e2e `alias.spec.ts`).
- **How it works**: the two households month by month, the break-even definition, seven formulas in plain HTML, a worked example computed at build, every default and preset from `defaults.json`, SDLT/LBTT/LTT bands with relief, surcharges, tax year and effective date from `taxRules.json`, the brief's assumptions plus the tax cases left out (2% non-resident surcharge, companies and trusts, shared ownership, linked purchases, refund of higher rates), known limits and "This is a model, not financial advice."
- **Sources**: every dataset in `sources.json` (publisher, link, licence and licence link, coverage, use, month, notes, attribution), the nine Bank of England series with codes and descriptions (and the missing 5-year 85% band), the BRMA mapping tables for Scotland and NI, areas on nation fallbacks, the monthly refresh (schedule and thresholds read from the pipeline), the last refresh date and the OGL statements. **About**: an independent project by Jordan Lawrence, no lenders, adverts, lead forms or personal data, figures stay in the browser, cookieless counting (currently off), not advice, and the GitHub issues link.
- **SEO**: unique titles and descriptions (area descriptions lead with the computed answer), canonical URLs with trailing slashes, `sitemap.xml` (370 URLs; no styleguide, 404 or old slugs), `robots.txt`, WebApplication JSON-LD on the home page and area pages, BreadcrumbList on area, nation and index pages, OG and Twitter tags everywhere, five committed 1200x630 OG cards (`npm run og`), `lang="en-GB"`.
- **Quality gates in CI**: `npm run check:links` (broken internal links, assets, fragments, sitemap and canonical targets, and orphan pages all fail), `npm run check:pages` (22 tests over `dist/`, including every area page's static answer against an independent engine run), both repeated at `BASE_PATH=/`. e2e: `area-pages`, `nation-pages`, `alias`, `content-pages`, `seo` specs (answer with JS disabled, hydration and a working calculator, nation lists, the alias, sitemap and robots served). Expected values come from the data files, so the specs also hold against the live site.
- **Numbers**: 581 unit tests, 22 page-quality tests, 395 e2e runs passed (5 skipped) at 360 and 1280. Build: 372 pages in about 6.5 s. Client JS 85,816 bytes of 102,400 (no new JS; area pages share the island bundle).

#### Deferred (phase 5)
- **Live e2e.** This note said the suite had not run against the live site. It had and it does: Pages is live, and every deploy's `live` job runs `npm run test:live` against it (green for the phase 5 merge, deploy run 38463338695). Fact updated in phase 6.
- **robots.txt only works at a host root**, so it does nothing until the custom domain (`BASE_PATH=/`). Submit the sitemap to search consoles by hand until then.
- **Attribution wording and tax pages** were written from memory and search extracts, since gov hosts are unreachable from the container. Check the statements on /sources/ against each publisher and re-read the six tax pages in `taxRules.json` before launch.
- **The issues link** on /about/: resolved, the repository is public, so the link works for visitors (fact updated in phase 6).
- **OG cards** are checked for names, size and that they are not empty, not pixel by pixel. Re-run `npm run og` after any logo, token or nation-name change.
- The nation index note names England's and NI's months; it reads them from data but assumes those are the only two month sets.

#### What phase 6 must know
- **Every page except `/` and area pages ships zero JS**; area pages load exactly the home page's island bundle. Keep it that way: the shared e2e check fails on any other script.
- **Lighthouse** should run on `/` and one area page (`/rent-vs-buy/leeds/`). Area pages are long (calculator, then summary, related areas): the answer card is still in the first screen at 1280x800.
- **Accessibility work to look at**: the nation tables (A to Z, up to 296 rows in England) have `<caption>`s and row headers; fallback "*" marks have visually hidden text; StackTable keeps table roles when it stacks below 36rem. Check these with a screen reader, and the forced-colours items left from phase 4.
- **Contracts the quality gates hold** (change the tests with the code): exactly one h1, unique description and title per page; only 404 and styleguide are noindex; WebApplication only on `/` and area pages; area meta descriptions start with the answer sentence then "Average price £X, rent £Y a month.", with " (England figure)" (the nation's name) after any price or rent that is a nation fallback; the `answer-*`, `area-summary-answer`, `related-areas` and `nation-areas` hooks.
- **New pages** must be linked from somewhere reachable from the home page (orphans fail `check:links`), go in the sitemap endpoint (`check:pages` compares the sitemap with canonicals), and go in `PAGES` in `tests/e2e/helpers.ts` for the shared checks.
- **Review round 1 fixes** (decisions.md, "Review round 1 (phase 5)"): fallback figures labelled in meta, OG, Twitter and JSON-LD descriptions; "Price in years of rent" marked when either figure is the nation's; Isles of Scilly's related-areas heading; "Renting catches up again" moved next to the answer (hook `area-summary-overtake`); "all N of" spread copy; softer tax-check wording; trimmed "Why" column plus Tax rules and Buyer type rows; exact About privacy line; OG card tags; shorter content-page descriptions.
- **Left for phase 6 from the review:** picking another area on an area page keeps the Leeds h1 and summary while the island shows the new area (navigate to that area's page, or add the home page's `data-calc-link` script); the island tags a floored negative growth (Aberdeen City) as "Local figure"; area titles reach about 90 characters with the suffix; area pages are about 88 KB of HTML, mostly repeated island props.
- **Build time** is about 7 s for 372 pages; `typicalAnswer` and `nationSpreadFor` are cached per build, so new per-area work should reuse them rather than re-running the model.


### Phase 6: accessibility, performance and end-to-end hardening

In review. The lead measured a baseline and set up shared tooling (`docs/decisions.md`, "Phase 6 baseline (lead)" and "Phase 6 ownership (lead)"); three teammates (perf, a11y-ux, docs-acceptance) worked on their own branches and the integrator merged them without textual conflicts. Decisions: "Performance (phase 6, perf)", "Accessibility and UX (phase 6, a11y-ux)", "Docs and acceptance (phase 6, docs-acceptance)" and "Integration (phase 6)". The acceptance checklist with evidence for every box and test case is `docs/acceptance.md`.

#### What shipped (phase 6)
- **Island JS** (`npm run budget`): the island needs 43,650 bytes of our code before it hydrates (61,805 before), held to 45KB in CI by `scripts/check-budget.mjs`; total client JS 82,177 of 102,400 bytes (85,816 before). The chart, share row, advanced panel, waiting card and the sections under the card load in a second chunk (`later.ts`, `deferred.tsx`, `Hold`) as soon as the island starts; they stay server-rendered until it arrives. The unused `@preact/signals` chunk is stubbed out, analytics code drops out when it is off, and Preact has its own chunk. The 40KB aim is missed by about 3.6KB (see "Integration (phase 6)").
- **HTML** (`tests/built/weight.test.ts`): shared island data (defaults, tax rules, rates, nation figures, aliases) is one hashed, preloaded `data/calculator.json` instead of 12.7KB of props on every page. The advanced panel's body and the year-by-year table render on first open; the chart's hidden table renders once the chart is live. Leeds 87,220 to about 38.5KB; every area page under 45KB (max about 40KB); `dist/` 32.8MB to about 15MB. The answer, key numbers, chart, summary, sensitivity and breakdown are still in the static HTML.
- **CSS and fonts**: one shared stylesheet instead of two render-blocking ones (critical CSS not inlined: it would be most of the 32KB and push area pages back over 45KB); the four woff2 faces are declared in `fonts.css` and preloaded; desktop CLS from the font swap is gone.
- **Lighthouse in CI**: `npm run lighthouse` after e2e in `ci.yml` (median of 3, mobile and desktop, `/` and `/rent-vs-buy/leeds/`, 95+ in all four categories plus LCP, TBT and CLS limits); report-only against the live site in `deploy.yml`'s `live` job.
- **Accessibility tests**: `a11y.spec.ts` (axe, nine page types and six calculator states, light and dark, 360 and 1280), `keyboard-journey.spec.ts`, `screen-reader.spec.ts`, `reduced-motion.spec.ts`, `forced-colors.spec.ts` (emulated, screenshots attached or written to `FORCED_COLORS_SHOTS`). All run in CI and against the live site.
- **UX fixes**: picking another area on an area page opens that area's page with the buyer type, outlook, tax nation and non-local overrides in the query, focus back in the Area field and one announcement (`area-navigation.spec.ts`); old `?a=` links on area pages redirect. Growth held to the brief's range is tagged "Floored at 0%" or "Capped at 6%" with the real figure in the tooltip. Area titles are 65 characters or fewer with " | House Sums". The answer live region announces once per settled change and never on load; field notes and the toggletip are standing regions. Forced-colours rules for chart lines, marker, sliders, tags, cards and focus; a reduced-motion rule in `base.css`.
- **Integration fix**: the chart's "Year N" label near the left edge hangs right of the marker, so it no longer covers the top y-axis label at 360 (slop item from the docs-acceptance pass; asserted in `review.spec.ts`).
- **Docs**: `docs/acceptance.md`, README rewritten (live URL, commands, deploys, data refresh, where decisions live), stale statements about a private repo and Pages being off fixed. `npm run screenshots -- --out <dir>` produces the 48-image slop-review set.

#### Deferred (phase 6)
- **Needs Jordan**: slop sign-off from the final screenshot set (listed in the phase 6 PR); "Allow GitHub Actions to create and approve pull requests" and a check of the first refresh PR (acceptance box 11; scheduled run 20 October 06:17 UTC); re-reading the tax pages and the /sources/ attribution wording before launch (gov hosts unreachable from the build); registering the domains; GoatCounter if wanted.
- **Island 40KB aim** missed by about 3.6KB: what remains is the engine, inputs and answer card the first render and first change need.
- **With JavaScript off**, the advanced panel and year-by-year table open empty and the chart's hidden table is absent (trade-off for the 45KB HTML target; the answer and everything else is still static).
- **Re-deferred by a11y-ux, with reasons in decisions.md**: long names at 360px (card 7px taller on that pick), the phase 4 review items not taken, the nation index month note, and a real NVDA/VoiceOver pass before launch.
- **Slop items for Jordan to judge** ("Docs and acceptance (phase 6, docs-acceptance)"): at 360 Cardiff's "Rent" key line touches the buy line where they cross; tables wrap "None in 25 years"; the reserved blank lines in the answer card at 360; the empty left column at 1280; B612's brackets.

#### What the next phase must know
- **Pages render `CalculatorIsland`**, not `Calculator`: `<CalculatorIsland client:load links={calculatorLinks()} initialArea={...} />`. It fetches `links.data` (`data/calculator.json?v=<hash>`) and passes it to `Calculator`, whose props are unchanged. Pass `preloads={calculatorPreloads()}` to `Base` on island pages. The phase 4 and 5 notes above that show `<Calculator data={calculatorData()} ...>` describe the old wiring.
- **Deferred parts** (chart, share row, advanced panel, card ghost, `More`) must each render exactly one root element whenever they are on the page, or hydration breaks. A static import of `later.ts` pulls it back into the island and fails the budget. `data-hydrated="true"` means the deferred parts are live too.
- **Tests that read inside the advanced panel or year table must open them first** (`openDisclosure()` in `tests/e2e/calculator-helpers.ts`).
- **Headroom**: island 43,650 of 46,080 bytes; area pages about 40KB of 45KB. Both are checked in CI.
- **Lighthouse** scores: the PR body has the CI table and the live-site run. If runner variance ever fails the performance median, the documented next step is five runs, not a lower bar.
- **e2e ports**: give each worktree its own `E2E_PORT`; screenshots use `SCREENSHOTS_PORT` (4340) and Lighthouse its own preview.
