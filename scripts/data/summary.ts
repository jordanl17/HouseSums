/**
 * The Markdown summary written to the GitHub job summary and used as the refresh PR body:
 * result, counts, months, biggest movers, fallbacks and rates.
 */
import type { AreasFile, RatesFile, SourcesFile } from '../../src/lib/types.ts';
import { NATIONS } from '../../src/lib/types.ts';
import { areaMoves, describeChange, type CheckResult } from './validate.ts';

export interface SummaryInput {
  mode: string;
  next: { areas: AreasFile; rates: RatesFile; sources: SourcesFile } | null;
  prev: { areas: AreasFile | null; rates: RatesFile | null };
  checks: CheckResult;
  notes: readonly string[];
  /** Fetch or build failure, when the run never got as far as building files. */
  failure?: string;
}

const NATION_NAMES = { eng: 'England', sco: 'Scotland', wal: 'Wales', ni: 'Northern Ireland' };

function pounds(n: number): string {
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}

function percent(n: number, places = 1): string {
  return `${(n * 100).toFixed(places)}%`;
}

export function renderSummary(input: SummaryInput): string {
  const out: string[] = [];
  const ok = !input.failure && input.checks.errors.length === 0;
  out.push(`## Data refresh (${input.mode}): ${ok ? 'checks passed' : 'checks FAILED'}`);
  out.push('');
  if (input.failure) {
    out.push(`The pipeline stopped before writing any data: ${input.failure}`);
    out.push('');
    out.push('The committed data files are unchanged, so the site keeps its last good data.');
    return `${out.join('\n')}\n`;
  }
  if (!ok) {
    out.push('Nothing was written to `data/`; the site keeps its last good data. Problems:');
    out.push('');
    for (const e of input.checks.errors.slice(0, 50)) out.push(`- ${e}`);
    if (input.checks.errors.length > 50)
      out.push(`- ... and ${input.checks.errors.length - 50} more`);
    out.push('');
  }
  if (input.checks.warnings.length > 0) {
    out.push('Warnings:');
    out.push('');
    for (const w of input.checks.warnings) out.push(`- ${w}`);
    out.push('');
  }
  const next = input.next;
  if (!next) return `${out.join('\n')}\n`;
  const { areas, rates } = next;
  const prevAreas = input.prev.areas;
  const prevCount = prevAreas
    ? `${prevAreas.areas.length}${prevAreas.sample ? ' (sample)' : ''}`
    : 'none';
  out.push('| | Now | Before |');
  out.push('|---|---|---|');
  out.push(`| Areas | ${areas.areas.length} | ${prevCount} |`);
  out.push(`| Price month (UK HPI) | ${areas.asOf.price} | ${prevAreas?.asOf.price ?? ''} |`);
  out.push(
    `| Rent month (ONS private rents) | ${areas.asOf.rent} | ${prevAreas?.asOf.rent ?? ''} |`,
  );
  out.push(
    `| Mortgage rate month (Bank of England) | ${rates.asOf} | ${input.prev.rates?.asOf ?? ''} |`,
  );
  out.push(
    `| Areas using a nation fallback | ${areas.areas.filter((a) => a.fallbacks.length > 0).length} | |`,
  );
  out.push('');

  out.push('### Nation figures');
  out.push('');
  out.push('| Nation | Price | 10-year growth | Rent | Rent growth | Months |');
  out.push('|---|---:|---:|---:|---:|---|');
  for (const n of NATIONS) {
    const f = areas.nations[n];
    const months = f.asOf
      ? Object.entries(f.asOf)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')
      : '';
    out.push(
      `| ${NATION_NAMES[n]} | ${pounds(f.price)} | ${percent(f.growth10y)} | ${pounds(f.rent)} | ${percent(f.rentGrowth)} | ${months} |`,
    );
  }
  out.push('');

  if (prevAreas && !prevAreas.sample) {
    const moves = areaMoves(areas, prevAreas);
    for (const field of ['price', 'rent'] as const) {
      const top = moves.filter((m) => m.field === field && m.change !== 0).slice(0, 10);
      out.push(`### Biggest ${field} movers`);
      out.push('');
      if (top.length === 0) out.push('No changes.');
      else {
        out.push('| Area | Before | Now | Change |');
        out.push('|---|---:|---:|---:|');
        for (const m of top)
          out.push(`| ${m.name} | ${pounds(m.from)} | ${pounds(m.to)} | ${describeChange(m)} |`);
      }
      out.push('');
    }
  } else {
    out.push(
      'No real previous data to compare with (the committed files were samples), so there are no movers.',
    );
    out.push('');
  }

  const withFallback = areas.areas.filter((a) => a.fallbacks.length > 0);
  out.push(`### Fallbacks (${withFallback.length})`);
  out.push('');
  if (withFallback.length === 0) out.push('Every area has its own figures.');
  else
    for (const a of withFallback)
      out.push(
        `- ${a.name} (${a.code}): ${a.fallbacks.join(', ')} from the ${NATION_NAMES[a.nation]} figure`,
      );
  out.push('');
  if (input.notes.length > 0) {
    out.push('<details><summary>Pipeline notes</summary>');
    out.push('');
    for (const n of input.notes) out.push(`- ${n}`);
    out.push('');
    out.push('</details>');
    out.push('');
  }

  out.push('### Mortgage rates');
  out.push('');
  out.push('| Fix | LTV | Rate | Series | Before |');
  out.push('|---|---:|---:|---|---:|');
  for (const r of rates.rates) {
    const old = input.prev.rates?.rates.find((x) => x.series === r.series);
    out.push(
      `| ${r.fixYears} years | ${Math.round(r.ltv * 100)}% | ${percent(r.rate, 2)} | ${r.series} | ${old && !old.sample ? percent(old.rate, 2) : ''} |`,
    );
  }
  out.push('');
  return `${out.join('\n')}\n`;
}
