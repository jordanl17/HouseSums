# Phases

Each phase lands as one PR into `main`. The phase team appends its handoff notes here: what shipped, what's deferred, and anything the next phase must know.

| # | Phase | Branch | Status |
|---|---|---|---|
| 1 | Scaffold, CI and deploy | `phase/1-scaffold` | In review |
| 2 | Brand and layout shell | `phase/2-brand` | In review |
| 3 | Engine and data pipeline | `phase/3-engine` | In progress |
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
