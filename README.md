# House Sums

The maths of moving in.

House Sums is a free, plain-English site of UK home-buying calculators. The first tool, "Rent v buy", answers one question: how long do I need to own a home before buying beats renting? It starts from real local figures for the area you pick and lets you change every assumption.

It is a static site built with [Astro](https://astro.build) and TypeScript, with a single [Preact](https://preactjs.com) island for the calculator. Everything the page needs ships in the build, so there are no runtime calls to third-party services.

This is a model, not financial advice.

## Getting started

You need Node 22 (see `.nvmrc`) and npm.

```sh
nvm use
npm ci
npm run dev
```

The dev server prints a local address. The site lives under the base path, so open `http://localhost:4321/HouseSums/`.

## Commands

| Command            | What it does                                                                    |
| ------------------ | ------------------------------------------------------------------------------- |
| `npm run dev`      | Start the dev server with live reload                                           |
| `npm run build`    | Build the static site into `dist/`                                              |
| `npm run preview`  | Serve the built `dist/` folder locally                                          |
| `npm run check`    | Type-check Astro files (`astro check`) and TypeScript (`tsc --noEmit`)          |
| `npm run lint`     | Run ESLint and check formatting with Prettier (no changes are made)             |
| `npm run format`   | Fix formatting with Prettier and apply ESLint autofixes                         |
| `npm test`         | Run the unit tests with Vitest (`src/**/*.test.ts`)                             |
| `npm run test:e2e` | Run the Playwright end-to-end tests at 360px and 1280px against the built site |
| `npm run budget`   | Fail if the client JavaScript in `dist/` adds up to more than 100KB             |

Before pushing, run:

```sh
npm run check && npm run lint && npm test && npm run build && npm run budget && npm run test:e2e
```

Run `npm run build` before `npm run test:e2e`, as the end-to-end tests serve the built site.

## Configuration

The site address and base path come from environment variables, so moving to a custom domain is a config change rather than a code change.

| Variable    | Default                       | Notes                                                |
| ----------- | ----------------------------- | ---------------------------------------------------- |
| `SITE_URL`  | `https://jordanl17.github.io` | Used for canonical URLs                              |
| `BASE_PATH` | `/HouseSums`                  | Set to `/` when the site moves to its own domain     |

The same defaults apply to dev, build and preview, so local URLs match production. Internal links are always built with `url()` from `src/lib/url.ts`, never written as absolute paths. Page URLs end in a slash (`/HouseSums/sources/`).

## Project layout

```
data/               processed data (areas.json, rates.json, taxRules.json); data/raw/ is gitignored
scripts/            data fetch-and-transform scripts and build checks
src/lib/            pure TypeScript modules and their unit tests
src/components/     Preact and Astro components
src/layouts/        page shells
src/pages/          routes
src/styles/         global CSS
tests/e2e/          Playwright tests
.github/workflows/  CI, deploy and data refresh workflows
docs/               product brief, build decisions and phase notes
```

## How deploys work

- **CI** runs on every pull request and every push to any branch. It installs dependencies, then runs the type check, lint, unit tests, build, JavaScript budget check and the Playwright tests. If the end-to-end tests fail, the Playwright report is uploaded as a build artefact.
- **Deploy** runs on every push to `main` (and can be started by hand from the Actions tab). It builds the site with `BASE_PATH=/HouseSums` and `SITE_URL=https://jordanl17.github.io` and publishes `dist/` to GitHub Pages. The live site is at <https://jordanl17.github.io/HouseSums/>.
- GitHub Pages must be set to deploy from GitHub Actions (Settings, Pages, Source: GitHub Actions). The deploy workflow tries to switch this on the first time it runs.

Work happens on short-lived branches that are merged into `main` by pull request once CI passes.

## More detail

- `docs/brief.md`: the product and brand brief (the source of truth)
- `docs/decisions.md`: decisions taken during the build
- `docs/phases.md`: build phases and handoff notes
