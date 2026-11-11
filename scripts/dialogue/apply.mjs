// Merges a changes file from the dialogue review page (brand/dialogue/index.html) back into Quill's lines.
//
//   npm run dialogue:apply <changes.json>           apply it
//   npm run dialogue:apply <changes.json> --check   just say what would change
//
// Checks every changed line still has the same {placeholders} the code fills in, and writes nothing if any don't.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyChanges, formatLines } from './lines-tools.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// DIALOGUE_LINES points it at another copy (the tests use that).
const LINES = process.env.DIALOGUE_LINES || path.join(here, '../../src/ui/mascot/lines.json');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const check = args.includes('--check');

if (!file) {
  console.error('Usage: npm run dialogue:apply <changes.json> [--check]');
  process.exit(2);
}

let changes;
try {
  changes = JSON.parse(fs.readFileSync(path.resolve(process.env.INIT_CWD || process.cwd(), file), 'utf8'));
} catch (e) {
  console.error(`Couldn't read ${file}: ${e.message}`);
  process.exit(2);
}

const lines = JSON.parse(fs.readFileSync(LINES, 'utf8'));
const res = applyChanges(lines, changes);
const show = (t) => (Array.isArray(t) ? t.map((x) => `\n      - ${x}`).join('') : ` ${t}`);

if (res.errors.length) {
  console.error(`Not applied. ${res.errors.length} problem${res.errors.length === 1 ? '' : 's'}:`);
  for (const e of res.errors) console.error(`  ${e}`);
  process.exit(1);
}
if (!res.changed.length) {
  console.log('Nothing to change: every line in the file already matches.');
  process.exit(0);
}
for (const c of res.changed) console.log(`  ${c.id}\n    was:${show(c.from)}\n    now:${show(c.to)}`);
if (check) {
  console.log(`\n${res.changed.length} line${res.changed.length === 1 ? '' : 's'} would change (--check, nothing written).`);
} else {
  fs.writeFileSync(LINES, formatLines(res.lines));
  console.log(`\nUpdated ${res.changed.length} line${res.changed.length === 1 ? '' : 's'} in src/ui/mascot/lines.json.`);
}
