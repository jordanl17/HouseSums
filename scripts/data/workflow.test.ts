/**
 * Least-privilege checks on .github/workflows/refresh-data.yml. The file is read as text with a
 * small indentation-based reader (no YAML dependency): enough to find each job's permissions.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  fileURLToPath(new URL('../../.github/workflows/refresh-data.yml', import.meta.url)),
  'utf8',
);

/** The lines of a top-level key's block, or of one job under `jobs:`. */
function block(lines: readonly string[], header: RegExp, indent: number): string[] {
  const start = lines.findIndex((line) => header.test(line));
  if (start === -1) return [];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const lead = line.length - line.trimStart().length;
    if (lead <= indent) break;
    out.push(line);
  }
  return out;
}

const lines = workflow.split('\n');
const jobLines = block(lines, /^jobs:\s*$/, 0);
const jobNames = jobLines
  .map((line) => /^ {2}([\w-]+):\s*$/.exec(line)?.[1])
  .filter((name): name is string => name !== undefined);

/** `permissions:` of one job as { scope: level }, or 'none' for `permissions: {}`. */
function jobPermissions(name: string): Record<string, string> | 'none' | null {
  const job = block(jobLines, new RegExp(`^ {2}${name}:\\s*$`), 2);
  const inline = job.find((line) => /^ {4}permissions:\s*\{\}\s*$/.test(line));
  if (inline) return 'none';
  const perms = block(job, /^ {4}permissions:\s*$/, 4);
  if (perms.length === 0 && !job.some((line) => /^ {4}permissions:/.test(line))) return null;
  return Object.fromEntries(
    perms.map((line) => {
      const [scope, level] = line.trim().split(/:\s*/);
      return [scope, level];
    }),
  );
}

describe('refresh-data.yml permissions', () => {
  it('defaults the whole workflow to read-only contents', () => {
    expect(block(lines, /^permissions:\s*$/, 0).map((l) => l.trim())).toEqual(['contents: read']);
  });

  it('declares permissions on every job', () => {
    expect(jobNames).toEqual(['refresh', 'snapshot', 'pull-request', 'no-changes']);
    for (const name of jobNames) expect(jobPermissions(name), name).not.toBeNull();
  });

  it('grants pull-requests: write only to the job that opens the PR', () => {
    const withPrWrite = jobNames.filter((name) => {
      const perms = jobPermissions(name);
      return perms !== 'none' && perms?.['pull-requests'] === 'write';
    });
    expect(withPrWrite).toEqual(['pull-request']);
    const granted = lines.filter((l) => /^\s*pull-requests:\s*write/.test(l));
    expect(granted).toHaveLength(1);
    expect(block(jobLines, /^ {2}pull-request:\s*$/, 2).join('\n')).toMatch(/gh pr create/);
  });

  it('gives the job that runs npm and parses downloads a read-only token', () => {
    expect(jobPermissions('refresh')).toEqual({ contents: 'read' });
    const refresh = block(jobLines, /^ {2}refresh:\s*$/, 2).join('\n');
    expect(refresh).toMatch(/npm ci/);
    expect(refresh).not.toMatch(/git push|gh pr/);
  });

  it('lets only the snapshot and pull-request jobs write contents, and neither runs npm', () => {
    const writers = jobNames.filter((name) => {
      const perms = jobPermissions(name);
      return perms !== 'none' && perms?.['contents'] === 'write';
    });
    expect(writers).toEqual(['snapshot', 'pull-request']);
    for (const name of writers) {
      expect(block(jobLines, new RegExp(`^ {2}${name}:\\s*$`), 2).join('\n')).not.toMatch(/npm /);
    }
  });

  it('never leaves credentials in a checkout', () => {
    const checkouts = workflow.match(/uses: actions\/checkout@v\d+/g) ?? [];
    const persisted = workflow.match(/persist-credentials: false/g) ?? [];
    expect(checkouts.length).toBeGreaterThan(0);
    expect(persisted).toHaveLength(checkouts.length);
  });
});
