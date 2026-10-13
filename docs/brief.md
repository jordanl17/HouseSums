# House Sums: brand and product brief

The maths of moving in. Handoff for a build agent. 13 Oct 2026, Jordan Lawrence.

> **Critical:** House Sums must not look like AI-generated UI. It should look like a calculator from before the AI era: useful, clear and focused. This overrides every other design choice in this brief. See "Design principle" below.

## Summary

We're building House Sums, a free, plain-English site of UK home-buying tools with a bit of personality. The first tool answers one question: **how long do I need to own a home before buying beats renting?**

It opens with real local figures for the area you pick (average rent, price and growth), and lets power users adjust every assumption. It's a static site on GitHub Pages, with a scheduled GitHub Action refreshing open data once a month.

Why now:
- Mortgage rates are high relative to base rate. As of 15 September 2026, average 2-year fixes were 5.73% and 5-year fixes 5.78%, with base rate at 3.75%.
- Rents are rising faster than prices. In the year to August 2026, UK rents rose 3.8% while house prices rose 1.4%.
- The answer now depends heavily on where you live. Every calculator we found uses national defaults.

What v1 is not: advice, a mortgage comparison table, or a lead-gen funnel. The way to win is trust and search traffic first, then decide how to make money.

## Design principle: a calculator, not an AI landing page

This is the most important design requirement in the brief. House Sums must look like a good calculator from before the AI era: useful, clear and focused. If a screen could pass for a generic AI-generated startup page, it fails, however polished it is.

### What good looks like
- The tool is the page. Inputs and the answer are on the first screen: side by side on desktop, stacked on mobile with the answer kept in view.
- Dense but calm. Labelled fields in a tight grid, numbers right-aligned in tabular figures, a unit next to every value.
- Every element earns its place by helping someone get the answer or understand it. Anything else is cut.
- Plain, specific labels ("Monthly rent for a similar home"), never marketing copy.
- Reference points: a well-made desk calculator, the mortgage tables in an old building society leaflet, the original New York Times rent vs buy calculator, a tidy spreadsheet.

### Never do these (the AI-slop tells)
- A big marketing hero with a slogan and a call-to-action above the calculator.
- Feature grids with icons, three-step "How it works" strips, testimonials, "as seen in" logos.
- Gradients, glows, glassmorphism, blurred blobs, sparkle or "AI" icons, emoji.
- Everything centred, or every block in an identical rounded card with a soft shadow.
- Trendy startup fonts (Inter, Space Grotesk, Syne, Bricolage and the like) or decorative serif headlines.
- Purple, purple-to-blue, or a lone neon accent on near-black.
- Filler words: "unlock", "empower", "seamless", "your journey", "let's dive in".
- Animated number counters, confetti, scroll-triggered fade-ins.
- Stock photos or generic illustrations.

### The slop check (run on every screen before it ships, at 360px and 1280px)
1. Cover the logo. Could this be any AI startup's page? If yes, it fails.
2. On a 1280px laptop, can someone enter a price and see an answer without scrolling?
3. Is there any element that doesn't help get or understand the answer? Remove it.
4. Does every number have a unit, and do columns of numbers line up?
5. Printed in black and white, does it still make complete sense?

## Market and the gap

There are plenty of UK rent vs buy calculators, but none starts from local figures, explains its maths, or answers the question in years. That's the gap.

| Type | Examples | What they do well | Where they fall short |
|---|---|---|---|
| Consumer and lender calculators | Which?, Habito, Mojo | Trusted brands; repayment and affordability maths | No rent comparison; built to capture leads |
| SEO calculator sites | uktaxcalculators, salarytax.uk, HouseCheckup, WeCovr | Many pages ranking for long-tail searches; up-to-date tax bands | National defaults, form-first, ad-heavy, little explanation |
| Landlord and build-to-rent marketing | Essential Living | Polished | Framed to sell renting |
| Best-in-class benchmark (US) | New York Times rent vs buy calculator | Live sliders, one clear answer, explains each assumption | US only |

Where House Sums wins:
1. **Local by default.** Pick a town and the inputs fill with real local rent, price and growth. REalyse puts gross yields at about 7.4% in the North East and 7.2% in Scotland, against about 4.7% in London. That gap flips the answer.
2. **One clear answer.** "Buying pulls ahead after 6 years", not a page of numbers.
3. **Open maths.** Every assumption is shown, editable and explained in plain English.
4. **All four UK nations.** SDLT, LBTT and LTT, including Scottish specifics such as the Home Report.
5. **No sales agenda.** No lead forms in v1.

## Audience and jobs to be done

Primary audience: renters weighing their first purchase (about 967,000 first-time buyers in 2025, average age 33.9 in England).

| Segment | Who | What they need |
|---|---|---|
| First-time buyer (primary) | Renting, late 20s to late 30s, saving or recently saved a deposit | A clear answer and confidence that it's local and honest |
| Mover | Owns, considering a move or a stretch purchase | The break-even point after selling costs and tax |
| Power user | Finance-literate, often in tech, wants to tweak every assumption | Advanced controls, transparent maths, shareable scenarios |

Jobs to be done:
- "When I'm tired of renting, help me see whether buying actually leaves me better off, so I don't make a £30k mistake."
- "When I'm looking at a specific area, show me what's typical there so I don't have to research rents and prices myself."
- "When my partner or parents ask why we're buying, give me something I can share that shows the reasoning."
- "When I'm unsure about the future, show me how much the answer depends on house prices and rates."

## Brand

House Sums looks like a building site run from a cockpit: concrete grey, a hi-vis highlight and instrument-panel type, softened by pill shapes and a background of contour circles. It feels engineered and precise, with enough attitude to be remembered. The answer itself always stays calm and clear.

**Name:** House Sums. From the British "do the sums". Each calculator gets its own plain title, starting with "Rent v buy". **Tagline:** The maths of moving in.

### Reference mock (desktop, illustrative figures only)

Header: logo + "House Sums", nav "How it works", "Sources".
Heading: "Rent v buy: how long until buying beats renting?"
Left column inputs: Area (Leeds), Buyer (First-time · England), Property price (£245,000), Deposit (£24,500, 10%), Monthly rent, similar home (£1,180), Mortgage rate, 5-year fix (4.30%), House price growth (3.0% a year), "Adjust every assumption (18) ▸". Tag: "Local figures · Leeds, Aug 2026".
Right column: "Buying pulls ahead after" / giant "6" / "years". Chart with y-axis £0k-£250k, x-axis Now, Yr 5, Yr 10, Yr 15; Buy (filled area) and Rent (line), dashed "Year 6" marker. Key numbers: CASH NEEDED £38,699; FIRST MONTH, OWN VS RENT £1,421 / £1,180; AFTER 10 YEARS +£30,886.

### Voice
- Answer first. Lead with the number of years, then explain.
- Plain English. Say "stamp duty" before "SDLT", and explain terms the first time they appear.
- A wink, not a joke. Wit lives in labels, empty states and page furniture. Never in the answer, the numbers or a warning.
- Honest about uncertainty. Show ranges and sensitivity. Never "you should buy".
- No hype. No urgency, no exclamation marks, no "unlock your dream home".
- British spelling and £ throughout. Use hyphens, never em-dashes.

| Instead of | Write |
|---|---|
| You should buy now | At these settings, buying pulls ahead after 6 years |
| LTV | Loan-to-value (how much of the price you're borrowing) |
| Calculate | Show me my break-even year |
| Select an area | Pick a place. We'll bring the local numbers. |
| No break-even found | Renting wins this one, for all 25 years |
| Error: invalid input | Deposit can't be more than the price |
| 404 Not Found | This page has moved out. No deposit returned. |
| Guaranteed savings | If prices grow 3% a year, you'd be about £40k better off |

### Visual identity

**Type.** B612 for everything, B612 Mono for figures, tags and labels. Headings are bold, sentence case, tracked about -0.02em, and set smaller than a typical hero. The answer numeral is the one oversized element. Self-host the fonts (OFL licence); no Google Fonts runtime call.

**Colour.** Concrete and ink do most of the work. Hi-vis is a highlighter: the primary button, tags, the focus ring and the break-even marker. It never carries text on a light background, and text on hi-vis is always ink. Blue and orange are reserved for Buy and Rent everywhere; the orange line always carries a direct label because it sits below 3:1 against the light surface.

| Token | Light | Dark | Use |
|---|---|---|---|
| concrete (bg) | #D8D6D1 | #1C1C1B | Page background |
| surface | #E9E7E2 | #262624 | Cards, inputs |
| ink | #1A1A1A | #ECEAE5 | Text, outlines |
| muted | #4E4E4E | #B3B1AB | Secondary text |
| hi-vis (accent) | #D4FF00 | #D4FF00 | Button, tags, focus, break-even marker |
| on hi-vis | #1A1A1A | #1A1A1A | Text on hi-vis |
| tag alt | #FFFFFF | #3A3A37 | Second tag colour |
| buy | #1F5AA6 | #5B8FE0 | Buy series and answer numeral |
| rent | #E85A0C | #DB5E14 | Rent series |

**Shape.** Soft pill: cards at 26px radius with no border or shadow, pill buttons, pill inputs and pill tags. Depth comes from the surface sitting on concrete, not from outlines.

**Texture: contour circles.** The page background carries perfect concentric circles.
- Always circles, never ellipses, so use `circle` in the gradient and never `ellipse`.
- One centre per view, placed off the top-right of the hero (about 85% across, 12% down).
- 1.5px ink lines every 26px at about 9% opacity (10% white-ish in dark mode). Cards stay plain.

```css
background-image: repeating-radial-gradient(circle at 85% 12%, transparent 0 26px, rgb(26 26 26 / 0.09) 26px 27.5px);
```

**Logo.** "Sun on the sill": a hi-vis half sun rising from an ink horizon line, with three short rays. The wordmark is "House Sums" in B612 Bold.

**Answer and chart.** The break-even year is a giant numeral in the buy colour. The chart draws buy with a 14% filled area and rent as a plain line, labels both lines directly, and marks the break-even year with a dashed line and a "Year 6" label.

**Guardrails.** Brand flourishes (the circles, hi-vis) stay in the background and the calculator stays plain. One large hi-vis area per view at most; no gradients apart from the contour pattern; no drop shadows; data colours never used for decoration.

## v1 product requirements: rent vs buy

v1 is one page that turns an area and a few numbers into a break-even year, with every assumption editable.

Goals:
- Someone can get a local answer in under 30 seconds with only two inputs: area and price.
- A power user can change every assumption without leaving the page.
- Every result can be shared as a URL that reproduces it exactly.

Non-goals for v1: accounts, saved scenarios, affiliate links, live mortgage deals, Help to Buy or shared ownership, interest-only mortgages, and buy-to-let analysis.

### Page structure
1. **Calculator first:** inputs on the left (area and price first), answer on the right. Heading "Rent v buy: how long until buying beats renting?" at normal heading size. No marketing hero.
2. **Answer card:** "Buying pulls ahead after 6 years in Leeds", one sentence explaining what that means, and a note when renting catches up again later.
3. **Key numbers:** cash needed upfront, first-month cost of owning vs renting, and the difference after 10 years.
4. **Chart:** what you'd walk away with if you sold each year, buy vs rent, with the break-even year marked and a hover tooltip.
5. **What moves the answer:** break-even year at 0-5% house price growth, plus the same at mortgage rates 1 point higher and lower.
6. **Your assumptions:** simple controls first, then an "Adjust everything" panel.
7. **Breakdown:** upfront costs, selling costs, and a year-by-year table that's collapsed by default.
8. **How this works:** plain-English explainer of the method, data sources with as-of dates, and the disclaimer.

### Inputs

| Input | Level | Default | Where the default comes from |
|---|---|---|---|
| Area | Simple | None (prompt) | Local authority search; postcode lookup in v1.1 |
| Nation / tax rules | Auto | From area | Can be overridden |
| Buyer type | Simple | First-time | First-time, moving, additional property |
| Property price | Simple | Area average | UK HPI, latest month |
| Monthly rent for a similar home | Simple | Area average | ONS private rents, latest month |
| Deposit | Simple | 10% of price | Typical first-time buyer loan-to-value |
| Mortgage rate | Simple | Matched to loan-to-value band | Bank of England quoted rates |
| House price growth | Simple | Area 10-year average, capped at 0-6% | UK HPI history |
| Mortgage term | Advanced | 30 years | Common for first-time buyers |
| Initial fix length | Advanced | 5 years | |
| Rate after fix | Advanced | Same as initial rate | Assumes remortgage, not SVR |
| Product fee | Advanced | £999 | |
| Legal fees (buying) | Advanced | £1,800 | |
| Survey | Advanced | £500 E&W and NI, £0 Scotland | Scotland's Home Report is paid by the seller |
| Moving costs | Advanced | £800 | |
| Maintenance | Advanced | 1% of value a year | |
| Buildings insurance | Advanced | £350 a year | |
| Service charge, ground rent, factor fees | Advanced | £0 | Show a hint for flats |
| Rent increases | Advanced | Area annual rent growth, capped at 1-6% | ONS private rents |
| Investment return | Advanced | 5% a year after fees | Shown as "if you invested in a global index fund in an ISA" |
| Inflation | Advanced | 2.5% a year | Applies to insurance and fixed fees |
| Estate agent fee | Advanced | 1.4% inc. VAT | |
| Legal fees (selling) | Advanced | £1,500 | |
| Home Report | Advanced, Scotland only | £600 | Seller cost |
| Years to compare | Advanced | 25 | 1-40 |

- Each default shows a small "Local figure" or "Typical figure" tag, with an info tooltip naming the source and its month.
- A changed input gets a "Reset" link next to it.
- Money inputs format with commas on blur and accept pasted values like "£300k".
- Key inputs (rate, growth, rent, price) have a slider as well as a number field.

### Behaviour
- Results recalculate live on every input, debounced to one animation frame.
- All state goes into the URL (only values that differ from the defaults), so links are short and shareable.
- When there's no break-even within the horizon, the headline is "Renting comes out ahead for all 25 years", plus a hint naming which input would flip it.
- Validation is inline and calm. Deposit is clamped to the price, and a deposit under 5% shows a note that few lenders offer loans above 95% LTV.

### Quality bar
- Mobile-first: works at 360px wide with no horizontal scroll, and the answer card is visible without scrolling once an area is picked.
- WCAG 2.2 AA: keyboard reachable, visible focus, the chart has a table alternative, and colour is never the only cue.
- Light and dark themes follow the system setting.
- Lighthouse 95+ for performance and accessibility, and under 100KB of JavaScript.

## Calculation spec

The model compares two households month by month. One buys. The other rents the same home and invests everything the buyer spends upfront, plus any monthly difference. The break-even year is the first year-end when the buyer would walk away with more.

### Monthly simulation
1. **Day one.** Upfront costs U = property tax + legal fees + survey + moving + product fee (only if there's a loan). Loan L = price - deposit D. The renter's portfolio starts at D + U, and the buyer's side portfolio at 0.
2. **Each month m:**
   - Mortgage payment from the standard formula below. At the end of the fix, recompute the payment on the remaining balance and remaining term at the follow-on rate.
   - Owning cost = mortgage payment + maintenance (annual % × current value ÷ 12) + (insurance + service charge) ÷ 12, uprated by inflation each year.
   - Rent = starting rent × (1 + rent growth) raised to the number of whole years elapsed.
   - Both portfolios grow at the monthly equivalent of the investment return. Whoever spent less that month invests the difference.
   - Home value grows at the monthly equivalent of house price growth.
3. **Each year-end:** record both wealth figures below.

```
M = L·r / (1 − (1 + r)^−n)        r = annual rate ÷ 12,  n = months remaining
W_buy(y)  = V_y − B_y − S(V_y) + P_own_y
W_rent(y) = P_rent_y
S(V) = V × agent % + selling legal fees + Home Report (Scotland only)
```

V is the home value, B the mortgage balance, S the selling costs and P the invested portfolios. Monthly growth equivalents are (1 + annual)^(1/12) − 1.

Outputs: the break-even year (or none), whether renting overtakes again after break-even, wealth at each year for both sides, and year-1 monthly costs. Sensitivity rows re-run the model with house price growth at 0-5% and the mortgage rate at ±1 point.

Assumptions the explainer must state: your main home is free of capital gains tax; investments are in an ISA with no tax; rent and running costs are paid from income; the buyer remortgages rather than paying the standard variable rate; there's no Lifetime ISA bonus or help-to-buy scheme.

### Property tax, 2026/27 residential rates

Tax rules are data, not code. Keep them in a versioned `taxRules.json` with an effective date so the next Budget is a data change.

| Nation | Main rates | First-time buyer | Additional property |
|---|---|---|---|
| England & NI (SDLT) | 0% to £125k, 2% to £250k, 5% to £925k, 10% to £1.5m, 12% above | 0% to £300k, 5% to £500k; no relief above £500k | +5% on the whole price |
| Scotland (LBTT) | 0% to £145k, 2% to £250k, 5% to £325k, 10% to £750k, 12% above | Nil band raised to £175k; no price cap | +8% ADS on the whole price |
| Wales (LTT) | 0% to £225k, 6% to £400k, 7.5% to £750k, 10% to £1.5m, 12% above | No relief | Higher-rates table: 5% to £180k, 8.5% to £250k, 10% to £400k, 12.5% to £750k, 15% to £1.5m, 17% above |

Surcharges don't apply under £40k. The "moving" buyer type assumes the current home is sold before or at completion, so no surcharge applies.

The build agent must re-check these against GOV.UK, Revenue Scotland and the Welsh Revenue Authority before launch.

## Data: local defaults

All the local figures come from free, openly licensed government data. A monthly GitHub Action turns it into small JSON files that ship with the site, so the page never calls an API at runtime.

| Dataset | Publisher | Geography | Updated | Used for | Licence |
|---|---|---|---|---|---|
| UK House Price Index | HM Land Registry with ONS | Local authority, all UK (NI quarterly) | Monthly | Average price; 10-year growth | OGL v3 |
| Price Index of Private Rents | ONS | LA in England and Wales; Broad Rental Market Area in Scotland and NI | Monthly | Average rent; rent growth | OGL v3 |
| Quoted household interest rates | Bank of England database | UK, by fix length and LTV | Monthly | Default mortgage rate | Bank of England terms (to check) |
| Local authority names and codes | ONS Open Geography Portal | Local authority | Yearly | Slugs, nation, postcode lookup later | OGL v3 |

Pipeline: UK HPI + ONS private rents + Bank of England rates → monthly GitHub Action (fetch and transform to areas.json and rates.json) → checks pass? If no: run fails, site keeps last good data. If yes: pull request with a summary of changes → Jordan reviews and merges (spot-check a few areas) → Astro build to GitHub Pages.

The checks fail the run if any area is missing a price or rent, or a value moves more than 15% month on month.

### Derived fields
- **Price:** latest UK HPI average, all property types.
- **Growth:** the 10-year compound annual rate, (latest ÷ price 10 years ago)^(1/10) − 1, clamped to 0-6%.
- **Rent:** latest ONS average monthly rent. For Scotland and NI, map each council area to the Broad Rental Market Area covering most of its population, and record the mapping in the repo.
- **Rent growth:** latest annual change, clamped to 1-6%.
- **Mortgage rate:** Bank of England quoted rates for 2- and 5-year fixes at 60%, 75%, 85%, 90% and 95% LTV. Pick by the user's LTV band and fix length, using the nearest fix length for anything else. Look up and verify the exact series codes.

### areas.json shape
```json
{
  "asOf": { "price": "2026-07", "rent": "2026-08" },
  "areas": [
    {
      "code": "E08000035",
      "slug": "leeds",
      "name": "Leeds",
      "nation": "eng",
      "price": 245000,
      "growth10y": 0.041,
      "rent": 1180,
      "rentGrowth": 0.052,
      "fallbacks": []
    }
  ]
}
```
The figures above are illustrative only. `fallbacks` lists any field that used the nation's figure instead of a local one.

## Tech, hosting, SEO and analytics

Fully static Astro + TypeScript site on GitHub Pages. Pre-render one page per local authority.

Stack:
- Astro with static output. The calculator is a single Preact island; everything else is plain HTML.
- Model: a pure TypeScript module (`src/lib/model.ts`) with no DOM access.
- Chart: hand-rolled SVG, no charting library.
- Styling: CSS custom properties from the brand tokens, no CSS framework.
- Tests: Vitest for the model and tax rules, Playwright for the main flows at 360px and 1280px.
- Hosting: GitHub Pages, deployed by GitHub Actions on push to main, with a custom domain and HTTPS (custom domain later; domains not yet registered).

| Route | What it is |
|---|---|
| `/` | The calculator with an area picker |
| `/rent-vs-buy/{area}` | Pre-rendered page per local authority: calculator pre-filled, plus a short local summary built from the data |
| `/rent-vs-buy/{nation}` | Nation pages linking to their areas |
| `/how-it-works` | Method, assumptions and formulas in plain English |
| `/sources` | Every dataset with its publisher, licence and last refresh date |
| `/about` | Who's behind it, plus the not-advice statement |

Each area page must carry its own data and a computed answer (e.g. "At typical assumptions, buying in Leeds pulls ahead after 6 years"), so it isn't thin content.

Repo layout:
```
/data            raw downloads (gitignored) and processed areas.json, rates.json, taxRules.json
/scripts         fetch-and-transform scripts run by the data workflow
/src/lib         model.ts, tax.ts, format.ts and their tests
/src/components  Calculator, AreaPicker, Chart, AnswerCard, Sensitivity
/src/pages       routes above
/.github/workflows  deploy.yml, refresh-data.yml
```

SEO: unique title and meta description per area ("Rent or buy in Leeds? See your break-even year"); sitemap.xml, canonical URLs, WebApplication structured data; static Open Graph image per nation in v1; slugs follow ONS LA names, lowercased and hyphenated.

Analytics: cookieless (GoatCounter or Plausible), no cookie banner. Events: area selected, advanced panel opened, share link copied, a sensitivity row viewed. Never send input values to analytics.

## Acceptance criteria and test cases

v1 is done when every box is ticked and every test case passes in CI.

- [ ] Picking an area fills price, rent, growth and rent growth from areas.json, each tagged with its source and month
- [ ] With only area and price entered, the answer card, chart and key numbers render
- [ ] Every input in the Inputs table is editable, and each one has a reset link once changed
- [ ] Changing any input updates the results within one frame, with no layout jump
- [ ] A shared URL reproduces the exact result in a fresh browser
- [ ] The no-break-even, renting-overtakes-again and deposit-equals-price cases all have their own copy
- [ ] SDLT, LBTT and LTT apply automatically from the area's nation, and the nation can be overridden
- [ ] Area pages are pre-rendered for every local authority in areas.json, each with a unique title and summary
- [ ] Works at 360px with no horizontal scroll, in both themes, and with keyboard only
- [ ] Lighthouse scores 95+ for performance and accessibility on / and on one area page
- [ ] The data workflow runs green on a manual trigger and opens a pull request with refreshed data
- [ ] Every screen passes the slop check, reviewed by Jordan from screenshots at 360px and 1280px

### Tax test cases

| Nation | Buyer | Price | Expected tax |
|---|---|---|---|
| England | First-time | £300,000 | £0 |
| England | First-time | £450,000 | £7,500 |
| England | First-time | £550,000 | £17,500 (relief lost) |
| England | Moving | £300,000 | £5,000 |
| England | Additional | £300,000 | £20,000 |
| Scotland | Moving | £300,000 | £4,600 |
| Scotland | First-time | £300,000 | £4,000 |
| Scotland | Additional | £300,000 | £28,600 |
| Wales | Moving or first-time | £300,000 | £4,500 |
| Wales | Additional | £300,000 | £19,950 |

### Model test cases

Reference scenario: England, first-time buyer, £300k price, £30k deposit, £1,250 rent, 4.3% for 5 years then 4.3%, 30-year term, 3% growth, every other input at its default.

| Check | Expected |
|---|---|
| Monthly mortgage payment | £1,336.15 |
| First-month owning cost | £1,615.32 |
| Upfront costs on top of deposit | £4,099 |
| Break-even year at 0%, 1%, 2%, 3%, 4%, 5% growth | 11, 5, 3, 2, 1, 1 |
| Buy vs rent wealth after 10 years | £181,200 vs £87,864 (±£1) |

Invariants (property-based tests):
- Raising house price growth never makes the break-even year later.
- Raising rent never makes the break-even year later.
- Raising selling costs never makes it earlier.
- With 0% growth, 0% investment return and rent set equal to owning cost every month, buy wealth minus rent wealth in year y equals mortgage principal repaid minus upfront costs minus selling costs.

## Roadmap, monetisation and compliance (context only, not v1 scope)

- v1.1: postcode lookup via postcodes.io, "what would flip it" hint, two-area comparison, per-area share images.
- v2: True cost of buying; Leave my fix early?; Moving break-even; Overpay or invest?
- v3: monetisation experiments (decision pack, broker referral, conveyancing referrals; avoid display ads).

Compliance guardrails:
- v1 is information only. No lender names, live product rates or calls to action to apply for credit. Bank of England averages are fine as defaults.
- No advice language. Use "at these settings" and "if prices grow X%", never "you should".
- Privacy: no personal data collected, cookieless analytics, inputs never leave the browser.
- Disclaimer in the footer and on /how-it-works: "This is a model, not financial advice".

## Notes for the build agent

Rules:
- Never invent data. If a figure is missing for an area, fall back to the nation's figure, tag it "Typical figure", and log it in the workflow summary.
- Tax rules and defaults live in JSON, not in code.
- No runtime calls to third-party APIs in v1. Everything the page needs ships in the build.
- Copy follows the voice section: British English, plain words, hyphens rather than em-dashes, and no advice language.
- Avoiding the AI-slop look is the top design requirement. When in doubt, choose the plainer option, and run the slop check before showing any screen.

Open questions for Jordan: register housesums.co.uk and housesums.uk; growth default cap; investment return default; broker affiliate programme. See `docs/decisions.md` for how these were resolved for the build.
