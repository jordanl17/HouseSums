## Data refresh (dry run): checks passed

| | Now | Before |
|---|---|---|
| Areas | 361 | 6 (sample) |
| Price month (UK HPI) | 2026-07 | 2026-07 |
| Rent month (ONS private rents) | 2026-08 | 2026-08 |
| Mortgage rate month (Bank of England) | 2026-09 | 2026-09 |
| Areas using a nation fallback | 2 | |

### Nation figures

| Nation | Price | 10-year growth | Rent | Rent growth | Months |
|---|---:|---:|---:|---:|---|
| England | £293,479 | 3.0% | £1,459 | 4.0% |  |
| Scotland | £196,349 | 3.7% | £1,013 | 1.1% |  |
| Wales | £215,037 | 4.5% | £846 | 4.3% |  |
| Northern Ireland | £202,487 | 5.7% | £874 | 1.6% | price 2026-06, rent 2026-06 |

No real previous data to compare with (the committed files were samples), so there are no movers.

### Fallbacks (2)

- City of London (E09000001): rent, rentGrowth from the England figure
- Isles of Scilly (E06000053): price, growth10y, rent, rentGrowth from the England figure

<details><summary>Pipeline notes</summary>

- Isles of Scilly (E06000053): not in UK HPI; nation price and growth used
- Isles of Scilly (E06000053): not in ONS private rents; nation rent and rent growth used
- City of London (E09000001): not in ONS private rents; nation rent and rent growth used

</details>

### Mortgage rates

| Fix | LTV | Rate | Series | Before |
|---|---:|---:|---|---:|
| 2 years | 60% | 5.01% | IUMZICQ |  |
| 2 years | 75% | 5.13% | IUMBV34 |  |
| 2 years | 85% | 5.26% | IUMZICR |  |
| 2 years | 90% | 5.37% | IUMB482 |  |
| 2 years | 95% | 5.70% | IUM2WTL |  |
| 5 years | 60% | 4.84% | IUMZO27 |  |
| 5 years | 75% | 4.98% | IUMBV42 |  |
| 5 years | 90% | 5.17% | IUMZO28 |  |
| 5 years | 95% | 5.54% | IUM5WTL |  |

