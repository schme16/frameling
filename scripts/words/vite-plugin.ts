// Keeps the words files out of the way of the bundle. Two things, both only in a build:
// 1. The `where`, `vars` and `$about` in src/words/*.json are for whoever edits them, so they are dropped.
// 2. A call like choiceWord('choice.x.title') with no placeholders to fill is replaced by the words themselves, so the
//    bundle holds the same text it always did and not a lookup table of long ids. A call that fills placeholders, or
//    builds its id, stays a lookup, and the file stays in the bundle for it.
// Tests and the dev server read the files as they are, so what the app says is the same either way (a build check in
// test/words/words.test.ts runs this over every call).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/words');
/** The reader function in each area's module, and the file its words are in. */
const READERS: Record<string, string> = { choiceWord: 'choices.json', questWord: 'quests.json' };

const cache = new Map<string, Record<string, { text: string }>>();
const wordsOf = (file: string): Record<string, { text: string }> => {
  const have = cache.get(file);
  if (have) return have;
  const words = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Record<string, { text: string }>;
  cache.set(file, words);
  return words;
};

/** The source with every plain `choiceWord('id')` / `questWord('id')` call swapped for its words. */
export function inlineWords(code: string): string {
  if (!/\b(?:choiceWord|questWord)\(/.test(code)) return code;
  return code.replace(/\b(choiceWord|questWord)\(\s*'([^'\\]+)'\s*\)/g, (all, fn: string, id: string) => {
    const entry = wordsOf(READERS[fn]!)[id];
    return entry ? JSON.stringify(entry.text) : all;
  });
}

/** Just the words, as JSON, for a words file that stays in the bundle. */
export function leanJson(code: string): string {
  const words = JSON.parse(code) as Record<string, { text: string }>;
  const lean: Record<string, { text: string }> = {};
  for (const [k, v] of Object.entries(words)) if (!k.startsWith('$')) lean[k] = { text: v.text };
  return JSON.stringify(lean);
}

export const lean = {
  name: 'frameling-lean-words',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    const file = id.split('?')[0];
    if (/[\\/]src[\\/]words[\\/][^\\/]+\.json$/.test(file)) return leanJson(code);
    if (/[\\/]src[\\/](?!words[\\/]).*\.tsx?$/.test(file)) {
      const out = inlineWords(code);
      return out === code ? null : out;
    }
    return null;
  },
};
