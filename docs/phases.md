# Phases

Each phase lands as one PR into `main`. The phase team appends its handoff notes here: what shipped, what's deferred, and anything the next phase must know.

| # | Phase | Branch | Status |
|---|---|---|---|
| 1 | Scaffold, CI and deploy | `phase/1-scaffold` | In review |
| 2 | Brand and layout shell | `phase/2-brand` | In progress |
| 3 | Engine and data pipeline | `phase/3-engine` | Not started |
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

In progress. Lead foundation (tokens, base styles, token lint guard, primitive stubs and prop contracts) is on `phase/2-brand`. See `docs/decisions.md`, "Design system (phase 2)", for files, load order, class naming and the focus ring. Full handoff notes for phase 4 follow when the phase lands.

#### Primitives (for phase 4)
Files: `src/components/ui/*.astro` (Astro reference markup), `src/components/ui/types.ts` (prop contracts), `src/styles/ui/*.css` (one file per primitive, imported by `src/styles/ui.css`). All classes are global, so Preact components only need the same markup and class names. `/styleguide/` (`src/pages/styleguide.astro`) shows each one, in both themes, plus a static first screen of the calculator. Its example data is in `src/components/styleguide/example-data.ts` and is not model output.

How to build the calculator page from them:
- Layout: `.calc-layout` with `__primary` (Area, Property price), `__answer` (a `.card` holding `.answer`, the chart and `<dl class="key-numbers">`) and `__rest` (Buyer, Deposit, Monthly rent, Mortgage rate, House price growth, Outlook, then the "Adjust every assumption (18)" disclosure). Put fields in `<div class="fields"><div class="fields__grid">`; give segmented controls and the disclosure `fields__wide`.
- Field: `.field` > `.field__head` (`.field__label` + optional `.tag`), `.field__control` (`.field__affix--prefix`, `.field__input`, `.field__affix--suffix`), then an optional `.slider`, `.field__hint` and `.field__error`. Set `aria-invalid="true"` and `aria-describedby` on the input for errors; the pill draws the focus ring with `:focus-within`. Use `.field__input--text` for the area name.
- Segmented: `fieldset.segmented` > `legend.segmented__legend` + `.segmented__options` > `label.segmented__option` > `input.segmented__input[type=radio]` + `span.segmented__label`. Native radios, so arrow keys work with no JS. Add a "Custom" option or label for the Outlook when a value is edited.
- Tag: `.tag--local` (hi-vis) / `.tag--typical` (tag-alt); put the source and month in `title` or an adjacent hint, never in upper case. In a half-width field the tag wraps under the label; if that misaligns a row, move the tag to the hint line.
- Answer: `.answer__sentence` with `__lead`, `__numeral`, `__unit`; `.answer__note` for the one explaining sentence. For "Renting comes out ahead for all 25 years" there is no numeral: render the sentence in `.answer__lead` only.
- Chart: port `src/components/ui/ExampleChart.astro` (markup documented in its header) and keep `chart.css`. The hover tooltip is new work; keep the frame `role="img"` with a summary, and the year-by-year `DataTable` (with `rowHeader`) in a `.disclosure` as the table alternative.
- Key numbers: `dl.key-numbers` > `.key-number` (dt label, dd with `__figure` and `__unit`). Each is a two-row subgrid so figures line up across a row.
- Buttons: `.button--primary` at most once per view.

Deferred: a scroll wrapper for wide tables (the year-by-year table may need `overflow-x: auto` with a focusable region at 360px once it has more columns); the chart tooltip; a "Reset" link style next to changed inputs (a plain `a` or `.button--secondary` at small size is enough).
