# House Sums

The maths of moving in.

House Sums is a free, plain-English site of UK home-buying calculators. The first tool, "Rent v buy", answers one question: how long do I need to own a home before buying beats renting? It starts from real local figures for the area you pick (average price, rent, price growth and rent change for each of the UK's 361 local authorities) and lets you change every assumption. Every result is a link that reproduces it exactly.

**Live site:** <https://jordanl17.github.io/HouseSums/> (GitHub Pages, until a custom domain is registered).

This is a model, not financial advice.

## What is in it

- `/`: the calculator, with an area picker.
- `/rent-vs-buy/{area}/`: one pre-rendered page per local authority (361), with the calculator filled in for that area and a short local summary. The answer is in the HTML before any JavaScript runs.
- `/rent-vs-buy/{nation}/` and `/rent-vs-buy/`: nation pages listing every area with its answer.
- `/how-it-works/` (method, formulas, defaults and tax bands), `/sources/` (every dataset, licence and month) and `/about/`.

It is a static [Astro](https://astro.build) site in TypeScript. The calculator is one [Preact](https://preactjs.com) island; every other page ships no JavaScript. The model (`src/lib/model.ts`), property tax (`src/lib/tax.ts`) and defaults are pure TypeScript with no DOM access. Tax rules, defaults and local figures are JSON under `data/`, not code. Nothing calls a third-party service at runtime.

## Getting started

You need Node 22 (see `.nvmrc`) and npm.

```sh
nvm use
npm ci
npm run dev
```

The dev server prints a local address. The site lives under the base path, so open `http://localhost:4321/HouseSums/`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with live reload |
| `npm run build` | Build the static site into `dist/` (372 pages) |
| `npm run preview` | Serve the built `dist/` folder locally |
| `npm run check` | Type-check Astro files (`astro check`) and TypeScript (`tsc --noEmit`) |
| `npm run lint` | ESLint, Prettier check, colour tokens and contrast checks (changes nothing) |
| `npm run format` | Fix formatting with Prettier and apply ESLint autofixes |
| `npm test` | Unit tests with Vitest (`src/**/*.test.ts`, `scripts/**/*.test.ts`): engine, tax, state, copy, data pipeline |
| `npm run budget` | Fail if the client JavaScript in `dist/` is over 100KB, or if the calculator island needs more than 45KB of our own code before it hydrates |
| `npm run check:links` | Crawl `dist/` and fail on any broken internal link or asset, or a page no link reaches |
| `npm run check:pages` | Page-quality tests over `dist/`: titles, descriptions, one h1, canonical, no em-dashes, JSON-LD, sitemap, every area's static answer against the engine |
| `npm run test:e2e` | Playwright end-to-end tests at 360px and 1280px against the built site (served by `astro preview`) |
| `npm run test:a11y` | Only the axe accessibility scans from the e2e suite |
| `npm run test:live` | The same e2e suite against a deployed site (`LIVE_URL=https://jordanl17.github.io/HouseSums/`) |
| `npm run lighthouse` | Lighthouse, mobile and desktop, median of 3 runs, on `/` and `/rent-vs-buy/leeds/`, with the thresholds asserted (`--url <root>` for a deployed site, `--report-only` to skip the assertion) |
| `npm run analyze` | Bundle analysis of the client JavaScript (treemap in `stats/`) |
| `npm run screenshots -- --out <dir>` | Full-page screenshots of every page type at 360 and 1280, light and dark, for the slop review (`--url <root>` for a deployed site) |
| `npm run og` | Re-render the Open Graph cards in `public/og/` |
| `npm run data:refresh` | Fetch and rebuild `data/areas.json`, `rates.json` and `sources.json` (needs the government data hosts; normally run by the refresh workflow) |
| `npm run data:validate` | Run the data checks on the committed data files |

Before pushing, run:

```sh
npm run check && npm run lint && npm test && npm run build && npm run budget && npm run check:links && npm run check:pages && npm run test:e2e
```

The end-to-end tests, Lighthouse and the screenshots serve the built site, so run `npm run build` first. `E2E_PORT` picks the preview port for the e2e tests (default 4322). Playwright is pinned to 1.56.1 to match the Chromium in the build container; CI installs its own.

## Configuration

The site address and base path come from environment variables, so moving to a custom domain is a config change rather than a code change.

| Variable | Default | Notes |
|---|---|---|
| `SITE_URL` | `https://jordanl17.github.io` | Used for canonical URLs, the sitemap and Open Graph tags |
| `BASE_PATH` | `/HouseSums` | Set to `/` when the site moves to its own domain |
| `PUBLIC_GOATCOUNTER_CODE` | unset | Cookieless event counting; off unless set (the deploy reads the `GOATCOUNTER_CODE` repository variable) |

The same defaults apply to dev, build and preview, so local URLs match production. Internal links are always built with `url()` from `src/lib/url.ts`, never written as absolute paths. Page URLs end in a slash (`/HouseSums/sources/`).

## Project layout

```
data/               processed data (areas.json, rates.json, sources.json, taxRules.json, defaults.json); data/raw/ is gitignored
scripts/            data fetch-and-transform scripts, build checks, Lighthouse, screenshots
src/lib/            pure TypeScript modules (model, tax, defaults, state, format, copy) and their unit tests
src/components/     the calculator island (Preact) and Astro components
src/layouts/        page shell
src/pages/          routes
src/styles/         global CSS; every colour is a token in tokens.css
tests/e2e/          Playwright tests (they run against preview and the live site)
tests/built/        page-quality tests over the built dist/ (npm run check:pages)
.github/workflows/  CI, deploy and data refresh workflows
docs/               product brief, build decisions, phase notes and the acceptance checklist
```

## How deploys work

- **CI** (`.github/workflows/ci.yml`) runs on every pull request and every push to a branch other than `main`: type check, lint, unit tests, build, JavaScript budget, link check and page-quality tests (at `/HouseSums` and again at `BASE_PATH=/`), then the Playwright suite at 360px and 1280px, including the axe accessibility scans, then Lighthouse (`npm run lighthouse`: median of 3 runs on `/` and `/rent-vs-buy/leeds/`, mobile and desktop, failing below 95 in any category or past the LCP, TBT and CLS limits). If a step fails, the Playwright report is uploaded with the run; Lighthouse reports are always uploaded.
- **Deploy** (`.github/workflows/deploy.yml`) runs on every push to `main` and by hand. It runs the whole CI suite first and deploys only if that passes. It builds with `BASE_PATH=/HouseSums` and `SITE_URL=https://jordanl17.github.io`, checks the budget and links again, and publishes `dist/` to GitHub Pages. Then the `live` job waits until the live site serves the new commit (`scripts/wait-for-deploy.mjs` reads `<meta name="hs-build">`) and runs the whole e2e suite against <https://jordanl17.github.io/HouseSums/> (`npm run test:live`), then runs Lighthouse once against it for the record (report only, never fails the deploy; scores in the job summary and the `lighthouse-live` artifact). A red deploy run means production is broken. Only one deploy runs at a time, and a deploy in progress is never cancelled.
- The repository is public and GitHub Pages is switched on (Settings, Pages, Source: GitHub Actions). That setting is the one thing the workflow cannot do with its own token.

Work happens on short-lived branches merged into `main` by pull request once CI passes.

## Data refresh

All local figures come from open government data (UK House Price Index, ONS Price Index of Private Rents, Bank of England quoted mortgage rates, ONS local authority names), all under the Open Government Licence. `.github/workflows/refresh-data.yml` fetches them at 06:17 UTC on the 20th of each month and by hand (Actions, Refresh data, Run workflow). It rebuilds `data/areas.json`, `rates.json` and `sources.json` and runs the checks: any area missing a price or rent, a price or rent moving more than 15% in a month, areas disappearing, too many nation fallbacks or a Bank of England series changing all fail the run, and the site keeps its last good data. If the checks pass and anything changed, it commits to `data/refresh-YYYY-MM` and opens a pull request with a summary of what moved, for Jordan to spot-check and merge.

- Opening that pull request needs the repository setting Settings, Actions, General, "Allow GitHub Actions to create and approve pull requests". Without it the run pushes the branch and prints a compare link instead.
- Pull requests opened by the workflow's token do not trigger CI, so the refresh job runs the unit tests and a build with the new data itself. Closing and reopening the pull request also starts CI.
- Pushing to a `data-test/**` branch does a dry run (no pull request; files go to `data-snapshot/<name>`).

Tax rules (`data/taxRules.json`, 2026/27) and the calculator defaults (`data/defaults.json`) are edited by hand; the next Budget is a data change.

## Where decisions live

- `docs/brief.md`: the product and brand brief, the source of truth.
- `docs/decisions.md`: every decision taken during the build, by phase, with the reasons.
- `docs/phases.md`: build phases, handoff notes and what was deferred.
- `docs/acceptance.md`: the brief's acceptance checklist and test cases, each mapped to the test or evidence that proves it, with what is still open.
