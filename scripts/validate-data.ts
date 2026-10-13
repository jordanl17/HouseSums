/**
 * Validate the data files against the contracts in src/lib/types.ts and the brief's checks.
 *
 * Run: npm run data:validate -- [--dir <data dir>] [--previous <dir>] [--allow-count-drop] [--allow-moves]
 *   --dir        directory to check (default data/)
 *   --previous   a directory holding last month's areas.json and rates.json, for the
 *                month-on-month (15%) and count checks
 *
 * The refresh workflow runs the same checks in scripts/refresh-data.ts before writing anything.
 * The checks live in scripts/data/validate.ts and are unit tested in scripts/data/*.test.ts.
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validateDirectory } from './data/validate-files.ts';

const { values: args } = parseArgs({
  options: {
    dir: { type: 'string', default: fileURLToPath(new URL('../data/', import.meta.url)) },
    previous: { type: 'string' },
    'allow-count-drop': { type: 'boolean', default: false },
    'allow-moves': { type: 'boolean', default: false },
  },
});

const result = await validateDirectory(args.dir ?? 'data', args.previous, {
  allowCountDrop: args['allow-count-drop'],
  allowMoves: args['allow-moves'],
});
for (const w of result.warnings) console.warn(`warn ${w}`);
for (const e of result.errors) console.error(`FAIL ${e}`);
if (result.errors.length === 0) console.log(`ok   ${args.dir}: every check passed`);
process.exitCode = result.errors.length > 0 ? 1 : 0;
