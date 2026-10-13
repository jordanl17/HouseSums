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
