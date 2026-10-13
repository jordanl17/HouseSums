/**
 * Validate the committed data files against the contracts in src/lib/types.ts.
 *
 * Owner: data teammate. This is the lead's minimal starting point (schema checks only). The data
 * teammate adds the brief's checks: missing price or rent after fallbacks, any value moving more
 * than 15% month on month against the committed file, slug collisions, unexpected drops in counts.
 *
 * Run: npm run data:validate
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  parseAreasFile,
  parseDefaults,
  parseRatesFile,
  parseSourcesFile,
  parseTaxRules,
} from '../src/lib/schema.ts';

const dataDir = fileURLToPath(new URL('../data/', import.meta.url));

const files: [string, (value: unknown, path: string) => unknown][] = [
  ['areas.json', parseAreasFile],
  ['rates.json', parseRatesFile],
  ['sources.json', parseSourcesFile],
  ['taxRules.json', parseTaxRules],
  ['defaults.json', parseDefaults],
];

let failed = false;
for (const [name, parse] of files) {
  try {
    parse(JSON.parse(await readFile(`${dataDir}${name}`, 'utf8')), name);
    console.log(`ok   ${name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
process.exitCode = failed ? 1 : 0;
