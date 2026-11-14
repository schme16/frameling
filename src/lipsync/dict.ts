/**
 * The pronunciation list for typed words. Import this file only with `import()`, when words are typed: it and the data
 * file are their own chunk, so they cost nothing at startup. The data is generated, see scripts/lipsync/pack_dict.mjs.
 */
import type { Expected } from './text';
import { lineExpected, parseDictionary, type Dictionary } from './words';

let loaded: Promise<Dictionary> | null = null;

/** The list, read once. */
export function loadDictionary(): Promise<Dictionary> {
  loaded ??= import('./dict-data').then((m) => parseDictionary(m.default));
  return loaded;
}

/** The mouths a typed line says, read with the pronunciation list. */
export async function expectedFromText(text: string): Promise<Expected[]> {
  return lineExpected(text, await loadDictionary());
}
