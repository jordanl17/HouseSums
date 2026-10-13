/**
 * Apply data/area-names.json to the committed data/areas.json without refetching anything
 * (phase 5). The monthly refresh applies the same mapping itself (scripts/refresh-data.ts), so
 * this is only needed after editing area-names.json between refreshes. Idempotent.
 *
 * Run: npm run data:names
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseAreaNames, parseAreasFile } from '../src/lib/schema.ts';
import { applyAreaNames, checkAreaNames } from './data/area-names.ts';

const dataDir = new URL('../data/', import.meta.url);
const read = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(name, dataDir), 'utf8'));

const areas = parseAreasFile(await read('areas.json'));
const names = parseAreaNames(await read('area-names.json'));
const { file, notes } = applyAreaNames(areas, names);
const checks = checkAreaNames(file, names);
for (const note of notes) console.log(`note ${note}`);
for (const warning of checks.warnings) console.warn(`warn ${warning}`);
for (const error of checks.errors) console.error(`FAIL ${error}`);
if (checks.errors.length > 0) {
  process.exitCode = 1;
} else {
  // Same serialisation as the pipeline: JSON.stringify(_, null, 2) plus a newline.
  const target = fileURLToPath(new URL('areas.json', dataDir));
  await writeFile(target, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`ok   wrote ${target}`);
}
