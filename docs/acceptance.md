# Acceptance

The brief's "Acceptance criteria and test cases" (`docs/brief.md`) says v1 is done when every box is ticked and every test case passes in CI. This file maps each box, each tax case and each model case to the test or evidence that proves it, with its status. Written in phase 6 (docs-acceptance) on 13 October 2026.

**How to read the evidence.** `file > describe > test` is a test name exactly as the runner prints it. Unit tests run in `npm test` (Vitest); page-quality tests in `npm run check:pages`; end-to-end tests in `npm run test:e2e` (Playwright) at both widths, `mobile-360` and `desktop-1280`. All three run in the CI job "Check, lint, test, build and e2e" (`.github/workflows/ci.yml`) on every pull request, and again in the deploy workflow before anything ships. The e2e suite also runs against the live site after every deploy (`deploy.yml`, job "Test the live site", `npm run test:live`); the last one before phase 6 was green (deploy run 38463338695, phase 5 merge).

**Statuses.**
- **Met**: proved by the evidence named, in CI.
- **Met, limit noted**: proved, with a documented limit or reading of the brief.
- **Phase 6**: the evidence is added by another phase 6 branch (perf or a11y-ux); the integrator confirms the test names when the branches merge.
- **Partly met** and **Needs Jordan**: not done; the row says exactly why and what is needed.

## Summary

| # | Box | Status |
|---|---|---|
| 1 | Picking an area fills price, rent, growth and rent growth, tagged with source and month | Met |
| 2 | Area and price alone render the answer card, chart and key numbers | Met |
| 3 | Every input editable, each with a reset link once changed | Met, limit noted |
| 4 | Results update within one frame, with no layout jump | Met |
| 5 | A shared URL reproduces the exact result in a fresh browser | Met |
| 6 | No break-even, renting overtakes again and deposit equals price have their own copy | Met |
| 7 | SDLT, LBTT and LTT apply from the area's nation; the nation can be overridden | Met |
| 8 | Area pages pre-rendered for every local authority, unique title and summary | Met |
| 9 | Works at 360px with no horizontal scroll, in both themes, keyboard only | Met (more checks in phase 6) |
| 10 | Lighthouse 95+ for performance and accessibility on / and one area page | Met locally; CI gate in phase 6 |
| 11 | Data workflow runs green on a manual trigger and opens a pull request | Partly met, needs Jordan |
| 12 | Every screen passes the slop check, reviewed by Jordan from screenshots | Needs Jordan |
| | 10 tax test cases | Met (all 10) |
| | 5 model test cases | Met (all 5) |
| | 4 model invariants | Met, one limit noted |

## The "Done means" boxes

### 1. Picking an area fills price, rent, growth and rent growth from areas.json, each tagged with its source and month
**Status: Met.**
- `tests/e2e/inputs.spec.ts > fields > picking an area fills the local figures, each tagged with its source`: picks Leeds, price becomes £247,695, the price, rent, growth and rent growth tags read "Local figure", and the price tag opens a source line matching "UK House Price Index, Mon YYYY".
- `src/lib/defaults.test.ts > deriveInputs: an area with local figures, Typical outlook > tags the area figures local, with source and month`, `> tags everything else typical`, and `deriveInputs: clamps and nation specifics > uses the nation figure for a field listed in fallbacks, tagged typical` (Isles of Scilly, City of London).
- `tests/e2e/review.spec.ts > 'How this works' gives the area's own data months`.
- Phase 6 (a11y-ux): a growth figure floored at 0% (Westminster, Aberdeen City) stops claiming the raw local figure; its tooltip states the real 10-year average and the floor. The 13 October screenshots still show "Local figure" on Westminster's 0.0% (see box 12).

### 2. With only area and price entered, the answer card, chart and key numbers render
**Status: Met.**
- `tests/e2e/acceptance.spec.ts > with only area and price entered, the answer card, chart and key numbers render`: picks Leeds, types a price, checks the link is `a=leeds&p=250000` (nothing else changed), then the headline, numeral, chart and all three key numbers.
- `tests/e2e/calculator.spec.ts > picking an area shows an answer and writes only the area to the URL`.

### 3. Every input in the Inputs table is editable, and each one has a reset link once changed
**Status: Met, limit noted.**
- `tests/e2e/acceptance.spec.ts > every input in the inputs table is editable and gets a reset link once changed`: on City of Edinburgh (so the Scotland-only Home Report shows), every one of the 22 numeric inputs (`NUMERIC_INPUT_KEYS`, checked against the list in the test) is typed into, shows its Reset, and Reset restores the value and disappears. Tax rules (the nation override) gets the same check. The link ends as `a=city-of-edinburgh`.
- `tests/e2e/inputs.spec.ts > fields > every changed input gets a Reset link that restores it`, `> advanced panel > holds every other input, counted, with plain hints`, `> Scotland shows the Home Report; the tax rules can be overridden`, `tests/e2e/keyboard.spec.ts > keyboard only: pick an area, change values, reset one, reach the answer`.
- **Limit:** Area has no default to reset to (the brief's default is "None (prompt)"). Buyer type and Outlook are three-option segmented controls with no separate Reset link: the default option ("First-time", "Typical") is always on screen and one press restores it, and the Outlook shows "Custom" once any of its four assumptions changes (`inputs.spec.ts > fields > the outlook shows Custom once one of its assumptions changes`). Recorded as a phase 4 design choice.

### 4. Changing any input updates the results within one frame, with no layout jump
**Status: Met.**
- `tests/e2e/acceptance.spec.ts > changing an input updates the results by the next animation frame`: fires one input event in the page and reads the cash-needed figure two `requestAnimationFrame` callbacks later; it has changed by exactly the £3,200 typed. (With one callback the old figure is still there, because the island runs the model in the next frame: one model run per frame, as the brief's "debounced to one animation frame" asks.)
- `tests/e2e/layout-shift.spec.ts > the answer card never moves or resizes while inputs change`: records the answer card's box and the area and price field heights every animation frame through a long run of changes (clamps, errors, no mortgage, no break-even, year 1, slider bursts, buyer and outlook, horizons 1 and 40, another area); every frame must match.
- `tests/e2e/layout-shift.spec.ts > a shared link > shows its answer without moving anything on the page`, `> before an area the card is compact; a link reserves the answer from the first paint`, `tests/e2e/results.spec.ts > layout > the answer card keeps its place and size when the answer changes case`.
- Unit: `src/lib/model.test.ts > runModel > runs 40 years with sensitivity in well under 5ms`.

### 5. A shared URL reproduces the exact result in a fresh browser
**Status: Met.**
- `tests/e2e/share-url.spec.ts > a copied link reproduces the exact result in a fresh browser`: changes inputs through the UI, copies the link, opens it in a new browser context and compares the answer, key numbers, breakdown and every input.
- `tests/e2e/share-url.spec.ts > over-precise typed values are kept as shown, so the link still reproduces every figure`, `> a link with only defaults stays short`, `> share link > copies an absolute link to the current figures and says so calmly`.
- `tests/e2e/reference.spec.ts > reference scenario on screen > ...`: the brief's reference scenario opened by link shows exactly what `runModel` gives.
- Unit: `src/lib/state.test.ts > round trip > ...` (fast-check: `decodeState(encodeState(x))` is exact for anything the UI can enter), including `is stable: encoding what was decoded gives the same string`, and `canonicalInput (typed values as the calculator keeps them) > survives the URL exactly, so a shared link computes the same figures`.

### 6. The no-break-even, renting-overtakes-again and deposit-equals-price cases all have their own copy
**Status: Met.**
- `tests/e2e/results.spec.ts > answer copy > no break-even: renting comes out ahead, with a hint the model confirms`, `> renting catches up again: the window and the year it happens`, `> deposit equals price: says there is no mortgage, and charges no product fee`, `> break-even in year 1 is singular`, `> no advice language, em-dashes or exclamation marks in any result`.
- Unit: `src/lib/copy.test.ts > answerCopy > no break-even: "Renting comes out ahead for all N years", numeral is the horizon`, `> renting catches up again: the note gives the window and a second line says when`, `> deposit equals price: says plainly there is no mortgage, in every case`, `> every case keeps to the house style`.

### 7. SDLT, LBTT and LTT apply automatically from the area's nation, and the nation can be overridden
**Status: Met.**
- `tests/e2e/nations.spec.ts > a Scottish area uses LBTT and shows the Home Report`, `> a Scottish first-time buyer at £300,000 pays the brief case, £4,000 LBTT`, `> a Welsh area uses LTT, with no Home Report`, `> an English area uses SDLT, with no Home Report`, `> overriding the nation switches the tax rules`.
- `tests/e2e/results.spec.ts > breakdown > England: stamp duty by name with first-time buyer relief, year table collapsed`, `> Scotland: LBTT, the ADS on an additional property, and the Home Report`, `> Wales: LTT, with no first-time buyer relief`.
- `tests/e2e/inputs.spec.ts > advanced panel > Scotland shows the Home Report; the tax rules can be overridden`; `tests/e2e/acceptance.spec.ts` (tax rules Reset).
- Unit: `src/lib/tax.test.ts > regimes > maps each nation to its tax, NI using SDLT`, `> Northern Ireland pays the same as England`; `src/lib/defaults.test.ts > deriveInputs: clamps and nation specifics > follows the nation override for tax and nation defaults, but keeps the area figures`.

### 8. Area pages are pre-rendered for every local authority in areas.json, each with a unique title and summary
**Status: Met.**
- `tests/built/pages.test.ts > the build > has every area and nation page and nothing at the old slugs` (361 area pages, 4 nation pages).
- `tests/built/pages.test.ts > every page > has a title, and no two pages share one`, `> has a meta description, and no two pages share one`, `> has exactly one h1`.
- `tests/built/answers.test.ts > area page answers at typical assumptions > covers every area in data/areas.json`, `> match an independent runModel(deriveInputs(...)) on every page`: each page's numeral, headline, summary sentence (`area-summary-answer`, which names the area) and the start of its meta description equal an independent engine run.
- `tests/e2e/area-pages.spec.ts > with JavaScript disabled > leeds: the answer and the summary are in the static HTML` (and Glasgow City, Cardiff, Belfast), `> the island hydrates over the static answer and the calculator still works`.
- `tests/built/sitemap.test.ts > sitemap.xml > lists every indexable page once and nothing else`.
- Phase 6 (a11y-ux): area titles shortened to about 65 characters including " | House Sums", still unique (`src/lib/seo.test.ts`, `PAGES` in `tests/e2e/helpers.ts`).

### 9. Works at 360px with no horizontal scroll, in both themes, and with keyboard only
**Status: Met, with more checks added in phase 6.**
- No horizontal scroll: `tests/e2e/pages.spec.ts > page {path} > has no horizontal scroll` for every page in `PAGES` (home, area pages, nation page, index, How it works, Sources, About, style guide) at 360 and 1280; `tests/e2e/smoke.spec.ts > home page > has no horizontal scroll`; `tests/e2e/results.spec.ts > layout > no horizontal scroll with every results section open`; `tests/e2e/inputs.spec.ts > advanced panel > holds every other input, counted, with plain hints` (panel open); `tests/e2e/review.spec.ts` direct-label checks on short horizons.
- Both themes: `tests/e2e/theme.spec.ts > light scheme > ...`, `> dark scheme > ...` (background, text, contours and logo from the tokens); `tests/e2e/focus.spec.ts > light scheme / dark scheme > ...` (focus ring); `tests/e2e/styleguide.spec.ts > styleguide page > has no horizontal scroll in light or dark`; contrast of every token pair in both themes, `scripts/check-contrast.test.ts` and `npm run lint`.
- Keyboard only: `tests/e2e/keyboard.spec.ts > keyboard only: pick an area, change values, reset one, reach the answer`, `> keyboard only: the tags open their source and close with Escape`, `> keyboard only: the outlook and buyer use arrow keys`; `tests/e2e/results.spec.ts > chart > keyboard: focus shows a year, arrows move it, Escape hides it`; `tests/e2e/focus.spec.ts > ... > the first tab stop is a visible skip link with the focus ring`.
- First screen: `tests/e2e/acceptance.spec.ts > the first screen holds area, price and the answer, with no scrolling (./?a=leeds)` and `(rent-vs-buy/leeds/)`: at 360x780 the area, price and answer headline are in view on load; at 1280x800 the whole answer card is.
- Phase 6 (a11y-ux): axe scans of every page type in light and dark at 360 and 1280 with no serious or critical violations, plus the advanced panel, a tooltip and the year table open (`tests/e2e/a11y.spec.ts`); keyboard-only journeys on the home and area pages in both themes; forced-colours screenshots (`tests/e2e/forced-colors.spec.ts`); reduced motion.

### 10. Lighthouse scores 95+ for performance and accessibility on / and on one area page
**Status: Met when measured locally; the CI gate lands in phase 6 (perf).**
- Baseline, `docs/decisions.md` "Phase 6 baseline (lead)": `npm run lighthouse` (Lighthouse 13.5, median of 3 runs, `astro preview` on `dist/`) scored 100 for performance, accessibility, best practices and SEO on `/` and `/rent-vs-buy/leeds/`, mobile and desktop.
- Phase 6 (perf): `npm run lighthouse` runs in `ci.yml` after the e2e tests and fails below 95 in any category or past the LCP, TBT and CLS limits in `scripts/lighthouse.mjs` (`THRESHOLDS`); the deploy's live job runs it once against the live site, report only. Scores go in the phase 6 pull request.
- Variance note: one single run of the area page on mobile scored 94 (TBT 241 ms) during the baseline, which is why the gate uses the median of 3 runs and the stable metrics.

### 11. The data workflow runs green on a manual trigger and opens a pull request with refreshed data
**Status: Partly met. Needs Jordan.**
- Green on a manual trigger: yes. Run 38425052350 (`workflow_dispatch` on `main`, 13 October 2026, after the phase 3 merge) fetched every source, passed every check, ran the tests and the build, and succeeded.
- Opens a pull request: **not yet seen.** That run found nothing new since the committed snapshot (the committed data came from the same day's dry run), so it took the "No changes" path and skipped the pull-request step, as designed. The pull-request path has never run.
- Since phase 4 the workflow is split into `refresh`, `snapshot`, `pull-request` and `no-changes` jobs (`scripts/data/workflow.test.ts` checks the permissions), and it has not been run since the split.
- What is needed:
  1. **Jordan:** Settings, Actions, General, "Allow GitHub Actions to create and approve pull requests". Without it the run pushes `data/refresh-YYYY-MM` and prints a compare link instead of opening the pull request. Nobody in the build can see or change this setting.
  2. A run when the publishers have new figures: the scheduled run on 20 October 2026 (06:17 UTC), or a manual run after the mid-month HPI and ONS releases. Then check that the pull request opens with the summary, spot-check a few areas and merge.
- Dry runs on `data-test/refresh` (runs 38420949459 and 38421635252) were green and produced the committed snapshot.

### 12. Every screen passes the slop check, reviewed by Jordan from screenshots at 360px and 1280px
**Status: Needs Jordan.**
- The set: `npm run screenshots -- --out <dir>` (`scripts/screenshots.mjs`, unit-tested in `scripts/screenshots.test.ts`) shoots 12 page types (home empty, home with Leeds, area pages for Leeds, Glasgow City, Cardiff, Belfast and Westminster, the Scotland nation page, How it works, Sources, About, 404) at 360 and 1280 in light and dark: 48 full-page PNGs named `<page>-<width>-<theme>.png`. Run it on the final phase 6 build and attach it to the phase 6 pull request.
- First pass by the build (13 October, before the phase 6 perf and a11y-ux changes): nothing reads as a generic AI page. No hero, no gradients beyond the contour circles, no shadows, no emoji, nothing centred; inputs and the whole answer card are in the first 800px at 1280 on every calculator page; numbers have units and right-aligned columns. Small things for Jordan to judge are listed in `docs/decisions.md`, "Docs and acceptance (phase 6, docs-acceptance)".
- Print in black and white (slop check 5) was checked on the style guide in phase 2 (PDF with background graphics off, converted to grey; `docs/decisions.md`, "Review round 1 (phase 2)"); the screenshots do not cover print.
- What is needed: **Jordan** reviews the 48 screenshots against the brief's five slop-check questions and signs off, or lists what to change.

## Tax test cases

All ten run as one `it.each` in `src/lib/tax.test.ts > brief: tax test cases (2026/27)`, against the committed `data/taxRules.json`. Status for every row: **Met**.

| Nation | Buyer | Price | Expected | Test name (`src/lib/tax.test.ts > brief: tax test cases (2026/27) > ...`) | Also on screen (e2e) |
|---|---|---|---|---|---|
| England | First-time | £300,000 | £0 | `eng, first buyer, £300000: £0` | `results.spec.ts > breakdown > England: stamp duty by name with first-time buyer relief, year table collapsed` (relief applied) |
| England | First-time | £450,000 | £7,500 | `eng, first buyer, £450000: £7500` | |
| England | First-time | £550,000 | £17,500 (relief lost) | `eng, first buyer, £550000: £17500`, and `England first-time buyer above £500k loses the relief entirely` | |
| England | Moving | £300,000 | £5,000 | `eng, moving buyer, £300000: £5000` | `nations.spec.ts > an English area uses SDLT, with no Home Report` |
| England | Additional | £300,000 | £20,000 | `eng, additional buyer, £300000: £20000` | |
| Scotland | Moving | £300,000 | £4,600 | `sco, moving buyer, £300000: £4600` | `nations.spec.ts > overriding the nation switches the tax rules` |
| Scotland | First-time | £300,000 | £4,000 | `sco, first buyer, £300000: £4000` | `nations.spec.ts > a Scottish first-time buyer at £300,000 pays the brief case, £4,000 LBTT` |
| Scotland | Additional | £300,000 | £28,600 | `sco, additional buyer, £300000: £28600` | |
| Wales | Moving or first-time | £300,000 | £4,500 | `wal, moving buyer, £300000: £4500` and `wal, first buyer, £300000: £4500` | `nations.spec.ts > a Welsh area uses LTT, with no Home Report` |
| Wales | Additional | £300,000 | £19,950 | `wal, additional buyer, £300000: £19950` | |

Around them in the same file: band edges, the £40,000 threshold, England's £500,000/£500,001 cliff, the Welsh Revenue Authority's own worked example (£260,000 second home, £15,950), zero and nonsense prices, and three fast-check invariants.

**Still open: re-read the official pages before launch. Needs Jordan (or anyone with access to gov.uk).** The rates were checked on 13 October 2026 through search-engine copies of the official pages, because the build container cannot reach gov.uk, revenue.scot or gov.wales (`docs/decisions.md`, "Tax rules verification (phase 3)"). The brief asks for a check against GOV.UK, Revenue Scotland and the Welsh Revenue Authority before launch. The pages to read are listed in `data/taxRules.json` (`sources`) and on `/how-it-works/`. Do it again after each Budget.

## Model test cases

Reference scenario (brief): England, first-time buyer, £300k price, £30k deposit, £1,250 rent, 4.3% for 5 years then 4.3%, 30-year term, 3% growth, every other input at its default. The brief does not give rent growth; 3.5% is the value that reproduces its figures (`docs/decisions.md`, "Model conventions (phase 3)"), and the fixture says so. Status for every row: **Met**.

| Check | Expected | Unit test (`src/lib/model.test.ts > brief model test cases (reference scenario) > ...`) | Got | On screen (e2e) |
|---|---|---|---|---|
| Monthly mortgage payment | £1,336.15 | `monthly mortgage payment is £1,336.15` | £1,336.15 | `reference.spec.ts > the oracle reproduces the brief (so the data and engine are the ones under test)` |
| First-month owning cost | £1,615.32 | `first-month owning cost is £1,615.32` | £1,615.32 | `reference.spec.ts > reference scenario on screen > the key numbers equal runModel output` |
| Upfront costs on top of deposit | £4,099 | `upfront costs on top of the deposit are £4,099` | £4,099 | `reference.spec.ts > reference scenario on screen > the breakdown and year-by-year table equal runModel output`; `results.spec.ts > breakdown > England: ...` (£4,099) |
| Break-even year at 0-5% growth | 11, 5, 3, 2, 1, 1 | `break-even years at 0-5% growth are 11, 5, 3, 2, 1, 1`, and `the growth sensitivity rows give the same break-even years` | 11, 5, 3, 2, 1, 1 | `reference.spec.ts > reference scenario on screen > what moves the answer lists the break-even year at each growth rate` |
| Buy vs rent wealth after 10 years | £181,200 vs £87,864 (±£1) | `buy vs rent wealth after 10 years is £181,200 vs £87,864 (±£1)` | £181,199.60 vs £87,864.31 | `reference.spec.ts > reference scenario on screen > the breakdown and year-by-year table equal runModel output` |

`src/lib/model.test.ts > defaults the reference scenario relies on > match the brief` checks that the defaults the scenario leans on are the brief's.

### Invariants (property-based, fast-check)

| Invariant | Test (`src/lib/model.property.test.ts > model invariants (fast-check) > ...`) | Status |
|---|---|---|
| Raising house price growth never makes the break-even year later | `raising house price growth never makes the break-even year later` | Met, limit noted: holds over realistic ranges (maintenance up to 2%, returns up to 8%). At the corners of the UI limits it can fail, because maintenance is a share of the home's value; that follows from the brief's own formulas and is pinned by `documents why the growth invariant needs realistic ranges`. Narrowing the maintenance or return limits in `defaults.json` is a product call for Jordan, not needed for v1. |
| Raising rent never makes the break-even year later | `raising rent never makes the break-even year later (full UI bounds)` | Met |
| Raising selling costs never makes it earlier | `raising selling costs never makes the break-even year earlier (full UI bounds)` | Met |
| Zero growth, zero return, rent equal to owning cost: buy minus rent = principal repaid minus upfront costs minus selling costs | `zero-growth identity: buy minus rent = principal repaid - upfront costs - selling costs` | Met |

## Other launch items

| Item | Status | What is needed |
|---|---|---|
| Copy rules site-wide: no em-dashes, British English, no advice language, no exclamation marks | Met | `tests/built/pages.test.ts > every page > has no em-dashes in its visible text, title or descriptions`, `> is in British English`; `tests/e2e/pages.spec.ts > page {path} > copy has no em-dashes or exclamation marks`; `tests/e2e/results.spec.ts > answer copy > no advice language, em-dashes or exclamation marks in any result`; `src/lib/copy.test.ts > answerCopy > every case keeps to the house style`. |
| Under 100KB of JavaScript | Met | `npm run budget` (`scripts/check-budget.mjs`) in CI and in the deploy; 85,816 bytes at the phase 6 baseline. Phase 6 (perf) adds a 45KB limit on the island chunk. |
| No runtime third-party calls | Met | `tests/e2e/pages.spec.ts > page {path} > loads JavaScript only for the calculator, only from our own origin` and `> loads no JavaScript`; `tests/e2e/smoke.spec.ts > home page > loads scripts only from our own origin`; `tests/e2e/calculator.spec.ts > the area list is fetched as JSON from our own origin, not bundled`. |
| Live site | Met | Public repository, GitHub Pages on, <https://jordanl17.github.io/HouseSums/>; every deploy runs the e2e suite against it (deploy runs 1 to 5 all green). |
| Custom domain (housesums.co.uk, housesums.uk) | Needs Jordan | Register the domains (open question in the brief). Then set `SITE_URL` and `BASE_PATH=/` in `deploy.yml`, add the domain in Settings, Pages, and HTTPS. CI already builds and link-checks at `BASE_PATH=/`. robots.txt only takes effect at a host root, so it starts working then. |
| Source attribution wording on /sources/ | Needs Jordan (or anyone with access to the publisher sites) | Written from each publisher's usual statement; the publisher pages could not be fetched from the build container (`docs/decisions.md`, "Content pages (phase 5, content teammate)"). Check against HM Land Registry, ONS and the Bank of England before launch. |
| Analytics | Off, by choice | GoatCounter is wired but off until Jordan creates a site and sets the `GOATCOUNTER_CODE` repository variable. Not a "Done means" box. |

## Keeping this current

When a test named here is renamed or moved, update its row in the same change. When a "Needs Jordan" item is done, change its status and say when and how it was checked.
