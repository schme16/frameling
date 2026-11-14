// Merges an edited words file back into the app: the choices, the quests, and any other file in src/words.
//
//   npm run words:apply <changes.json>           apply it
//   npm run words:apply <changes.json> --check   just say what would change
//
// A changes file is { "word id": "new words" }, the same shape as Quill's. It finds the file each id lives in. It
// checks every changed word still has the same {placeholders} the code fills in, and that every id exists, and writes
// nothing at all if any don't.
import fs from 'node:fs';
import path from 'node:path';
import { applyToGroups, checkGroups, formatLines, readGroups } from './words-tools.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const check = args.includes('--check');
if (!file) {
  console.error('Usage: npm run words:apply <changes.json> [--check]');
  process.exit(2);
}

let changes;
try {
  changes = JSON.parse(fs.readFileSync(path.resolve(process.env.INIT_CWD || process.cwd(), file), 'utf8'));
} catch (e) {
  console.error(`Couldn't read ${file}: ${e.message}`);
  process.exit(2);
}

const groups = readGroups();
const res = applyToGroups(groups, changes);
const show = (t) => ` ${t}`;
if (res.errors.length) {
  console.error(`Not applied. ${res.errors.length} problem${res.errors.length === 1 ? '' : 's'}:`);
  for (const e of res.errors) console.error(`  ${e}`);
  process.exit(1);
}
const after = checkGroups(res.groups);
if (after.length) {
  console.error(`Not applied. The result has ${after.length} problem${after.length === 1 ? '' : 's'}:`);
  for (const e of after) console.error(`  ${e}`);
  process.exit(1);
}
if (!res.changed.length) {
  console.log('Nothing to change: every word in the file already matches.');
  process.exit(0);
}
for (const c of res.changed) console.log(`  ${c.id}\n    was:${show(c.from)}\n    now:${show(c.to)}`);
const n = res.changed.length;
if (check) {
  console.log(`\n${n} word${n === 1 ? '' : 's'} would change (--check, nothing written).`);
} else {
  const touched = new Set(res.changed.map((c) => c.group));
  for (const g of res.groups) if (touched.has(g.name)) fs.writeFileSync(g.file, formatLines(g.words));
  console.log(`\nUpdated ${n} word${n === 1 ? '' : 's'} in ${[...touched].map((t) => `src/words/${t}.json`).join(', ')}.`);
}
