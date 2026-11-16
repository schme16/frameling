// Shared bits for the app's words files (src/words/*.json): finding the files, and merging a changes file into
// them across every file at once. The checking (placeholders, empty text, tidy shape) is Quill's, in
// scripts/dialogue/lines-tools.mjs, because the entries have the same shape. Plain JS so node runs it without a build.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyChanges, checkLines, formatLines } from '../dialogue/lines-tools.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The folder the words files are in. WORDS_DIR points it at another copy (the tests use that). */
export const wordsDir = () => process.env.WORDS_DIR || path.join(here, '../../src/words');

/** Every words file, as { name: 'choices', file, words }. */
export function readGroups(dir = wordsDir()) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ''), file: path.join(dir, f), words: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

/** Problems with the whole set: each file's entries, and an id that turns up in two files. */
export function checkGroups(groups) {
  const errors = [];
  const seen = new Map();
  for (const g of groups) {
    errors.push(...checkLines(g.words).map((e) => `${g.name}.json: ${e}`));
    for (const id of Object.keys(g.words).filter((k) => !k.startsWith('$'))) {
      if (seen.has(id)) errors.push(`${id}: in both ${seen.get(id)}.json and ${g.name}.json`);
      seen.set(id, g.name);
    }
  }
  return errors;
}

/**
 * Merges a changes file ({ "word id": "new words" }) into whichever file holds each id. Returns the new words per file,
 * what changed, and any problems. Nothing should be written if there are problems.
 */
export function applyToGroups(groups, changes) {
  const errors = [];
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return { groups, changed: [], errors: ['The changes file should be an object of { "word id": "new words" }'] };
  const owner = new Map();
  for (const g of groups) for (const id of Object.keys(g.words)) if (!id.startsWith('$')) owner.set(id, g.name);
  const byGroup = new Map(groups.map((g) => [g.name, {}]));
  for (const [id, text] of Object.entries(changes)) {
    if (id.startsWith('$')) continue;
    const name = owner.get(id);
    if (!name) errors.push(`${id}: no such word (was it renamed?)`);
    else byGroup.get(name)[id] = text;
  }
  const changed = [];
  const out = groups.map((g) => {
    const res = applyChanges(g.words, byGroup.get(g.name));
    errors.push(...res.errors);
    changed.push(...res.changed.map((c) => ({ ...c, group: g.name })));
    return { ...g, words: res.lines };
  });
  return { groups: out, changed, errors };
}

export { formatLines };
