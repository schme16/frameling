// Prints the app's words so they can be read in one sitting.
//
//   npm run words:list                 every word, grouped by file
//   npm run words:list -- choice.      only the ids that start with this
//   npm run words:list -- --json       the { "word id": "words" } file the changes file is made from
import { readGroups } from './words-tools.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const prefix = args.find((a) => !a.startsWith('--')) ?? '';
const out = {};
for (const g of readGroups()) {
  const ids = Object.keys(g.words).filter((id) => !id.startsWith('$') && id.startsWith(prefix));
  if (!ids.length) continue;
  if (!json) console.log(`\n== ${g.name}.json (${ids.length} words)`);
  for (const id of ids) {
    const e = g.words[id];
    out[id] = e.text;
    if (!json) console.log(`${id}\n  ${e.text}\n  [${e.where}]`);
  }
}
if (json) console.log(JSON.stringify(out, null, 2));
