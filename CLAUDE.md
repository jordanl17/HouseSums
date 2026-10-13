# House Sums

Static Astro + TypeScript site of UK home-buying calculators, deployed to GitHub Pages. The first tool is "Rent v buy".

- Product and brand spec: `docs/brief.md` (source of truth). Decisions made during the build: `docs/decisions.md`.
- Phase status and handoff notes: `docs/phases.md`. Update your phase's section when you finish.

## Non-negotiables
- **No AI-slop look.** It should read like a pre-AI calculator: no hero, no feature grids, no gradients apart from the contour circles, no shadows, no emoji, no centred-everything, no Inter-style fonts. Run the slop check in the brief at 360px and 1280px before you call any UI done.
- **Copy:** British English, £, plain words, hyphens never em-dashes (no `—` anywhere in user-facing text), no advice language ("you should"), no exclamation marks.
- **Data:** never invent figures. Tax rules, defaults and presets live in JSON under `data/`, not in code.
- **No runtime third-party calls.** Everything ships in the build. JS budget under 100KB.
- **Base path:** the site is served under a base path. Build internal URLs with the helper in `src/lib/url.ts`, never as hard-coded absolute paths.

## Commands
- `npm ci`, `npm run dev`, `npm run build`, `npm run preview`
- `npm run check` (astro check + tsc), `npm run lint`, `npm test` (Vitest), `npm run test:e2e` (Playwright, uses the preinstalled Chromium)

Run `npm run check && npm run lint && npm test && npm run build` before pushing.
