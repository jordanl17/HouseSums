# Build decisions

Decisions taken during the build where the brief was open or the environment forced a choice. Newest at the bottom of each section.

## Process
- Work happens in phases. Each phase gets its own branch (`phase/N-name`) and PR into `main`, and must pass CI and a review before merging. Merges are squash merges.
- Phases: 1 scaffold, CI and deploy. 2 brand and layout shell. 3 engine (tax, model, defaults) and data pipeline. 4 calculator UI. 5 area and nation pages, content pages, SEO. 6 accessibility, performance and end-to-end hardening.

## Hosting
- Until a custom domain is registered, the site is served from GitHub Pages at `https://jordanl17.github.io/HouseSums/`. Astro's `site` and `base` come from env (`SITE_URL`, `BASE_PATH`) so moving to `housesums.co.uk` is a config change. All internal links must go through the base path helper. Never hard-code `/HouseSums`.
- Package manager: npm. Node 22 (`.nvmrc`).
- Fonts are self-hosted via `@fontsource/b612` and `@fontsource/b612-mono`. No runtime font CDN.

## Defaults and outlook presets
Users asked to be able to choose between more cautious and more optimistic outlooks. The calculator has an **Outlook** control with three presets. Picking one sets the four economic assumptions below. Every value can still be edited individually afterwards, and the preset shows as "Custom" once one is changed. All preset values live in `data/defaults.json`, not in code.

| Assumption | Cautious | Typical (default) | Optimistic |
|---|---|---|---|
| House price growth | lower of area 10-year average and 1.5% | area 10-year average, clamped 0-6% | area 10-year average + 1 point, capped at 6% |
| Rent increases | lower of area rent growth and 2% | area rent growth, clamped 1-6% | area rent growth, clamped 1-6% |
| Investment return | 3.5% | 5% | 6.5% |
| Rate after fix | initial rate + 0.5 points | same as initial rate | initial rate - 0.5 points |

- Typical matches the brief exactly, and all model test cases in the brief run against Typical.
- The brief's open questions on the growth cap (kept at 0-6%) and investment return (kept at 5%) are resolved by making Typical match the brief and offering Cautious as the alternative.

## Data
- The build container cannot reach ONS, HM Land Registry or the Bank of England. Data is fetched only by the `refresh-data` GitHub Action. No figures are ever typed in by hand. Until the first refresh lands, the site uses a clearly labelled sample `areas.json` with a handful of areas, `"sample": true` and an on-page notice.
- The refresh workflow pushes a branch and opens a PR. If GitHub Actions isn't allowed to create PRs in this repo, it pushes the branch and the PR is opened manually.

## Analytics
- GoatCounter, loaded only when `PUBLIC_GOATCOUNTER_CODE` is set at build time. Off until Jordan creates an account. Events are named in `src/lib/analytics.ts` and never include input values.

## Tooling (phase 1)
- **Preact 10, not 11.** `@astrojs/preact` 6.0.6 (the latest) declares `preact@^10.6.5` as a peer, so Preact 11 fails `npm install` with a peer conflict. We use the latest Preact 10 and move to 11 when the integration supports it. No `--legacy-peer-deps`.
- **TypeScript 6.0.** TypeScript 7 is out, but `typescript-eslint` supports `<6.1` and `@astrojs/check` supports `^5 || ^6`. Pinned to `~6.0.3`.
- **Playwright pinned to 1.56.1.** It is the release whose Chromium build (1194) matches the browser preinstalled in the build container at `/opt/pw-browsers`, so local runs need no download. CI installs the matching Chromium with `npx playwright install --with-deps chromium`. Upgrade Playwright only together with the container's browser.
- **Trailing slashes: always.** `trailingSlash: 'always'` with `build.format: 'directory'`. Pages build to `folder/index.html`, which is what GitHub Pages serves, and canonical URLs end in `/`. `url()` in `src/lib/url.ts` adds the slash to page paths and leaves file paths (anything with an extension) alone. Note that `astro preview` returns 404 for a path without its trailing slash, where GitHub Pages would redirect.
- **Base path default applies everywhere.** `BASE_PATH` defaults to `/HouseSums` in dev, build and preview alike, so local URLs match production. Set `BASE_PATH=/` for a custom domain.
- **Prettier skips Markdown.** Docs are hand-written prose and the brief is the source of truth; reformatting their tables would create churn. Code, config, CSS and Astro files are formatted.
- **ESLint 10 flat config** with `typescript-eslint` recommended, `eslint-plugin-astro` recommended and `eslint-config-prettier` last. `npm run lint` runs `eslint .` then `prettier --check .`; `npm run format` is the only command that changes files.
- **Strictest TypeScript.** `tsconfig.json` extends `astro/tsconfigs/strictest` (adds `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and friends on top of `strict`).
- **Astro telemetry is turned off in CI** with `ASTRO_TELEMETRY_DISABLED=1`.
- The Preact renderer's client files (about 23KB raw) are emitted into `dist/_astro/` even while no page uses an island. They count towards the 100KB budget, but no page loads them yet.
- **GitHub Actions pinned to major tags** (checked October 2026): `actions/checkout@v7`, `actions/setup-node@v7`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`, `actions/upload-artifact@v7`.
- **CI runs on every pull request and on pushes to any branch.** A branch with an open PR therefore gets two runs (one `push`, one `pull_request`). The concurrency group is keyed on the ref, so the two do not cancel each other, but a newer push cancels an older run of the same kind.
- **The deploy workflow builds and runs the JS budget but not the full test suite.** It relies on CI having passed on the same push to `main`.
- **GitHub Pages must be switched on by hand once** (Settings, Pages, Source: GitHub Actions). `configure-pages` with `enablement: true` cannot do it with the default `GITHUB_TOKEN`; it needs a PAT or GitHub App token, which we do not want to store. The repo is private, so Pages also needs a paid plan or the repo must go public. Both are for Jordan to decide.
- **JS budget:** `scripts/check-budget.mjs` counts raw bytes of every `.js`/`.mjs`/`.cjs` file in `dist/` (not gzip), including the Preact renderer chunks no page loads yet. Limit 102400 bytes. `--max-bytes` and `JS_BUDGET_BYTES` exist for experiments only; CI uses the default.
- **Playwright's webServer runs `astro preview --ignore-lock`** on port 4322 at 127.0.0.1. Without the flag, Astro 7 moves preview to the background when it detects a coding agent, and Playwright sees the command exit early. If you run plain `npm run preview` from an agent session it starts in the background; stop it with `npx astro preview stop`.
- **`url()` edge cases:** a bare `//` or `///path` (no host) is treated as an internal path, and repeated slashes inside the base are collapsed. `//host/path` is still treated as external and returned unchanged.

## Deploy gate and live tests (phase 1 gate)
- `deploy.yml` calls `ci.yml` first (`workflow_call`) and only builds and deploys if the whole CI suite passes. `ci.yml` no longer runs on pushes to `main`, so each main commit is checked once, by the deploy run.
- After every deploy, a `live` job runs the full Playwright suite against the real GitHub Pages URL (`npm run test:live` with `LIVE_URL`). `scripts/wait-for-deploy.mjs` first waits until the live page's `<meta name="hs-build">` matches the commit, so the tests never hit the previous deploy in the CDN. A red deploy run means production is broken. Fix it before starting anything else.
- e2e tests must therefore work against both `astro preview` and the live site: navigate with relative paths and don't depend on local-only behaviour.
- Permissions are per job: only the deploy job gets `pages: write` and `id-token: write`. Checkouts use `persist-credentials: false`.
