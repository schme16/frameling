// The small reader every words file uses. A words file is a JSON object of `"id": { text, where, vars? }`, like Quill's
// lines.json. Each area has its own file and its own tiny module (choices.ts, quests.ts) that calls this, so an area's
// words load with the area and the ids stay typed.
import { fill, type Vars } from './fill';

export interface WordEntry {
  /** What the app says. Words in {curly} brackets are filled in by the app. */
  text: string;
  /** When and where it shows, for whoever is editing. */
  where: string;
  /** The {placeholders} the text must keep, so a lost one is caught. */
  vars?: string[];
}

/** The ids in a words file (everything except the `$about` note). */
export type WordId<D> = Exclude<keyof D & string, `$${string}`>;

/** Makes the reader for one words file: `const word = readWords(data)`, then `word('some.id', { name })`. */
export function readWords<D extends object>(data: D, file: string) {
  const entries = data as unknown as Record<string, WordEntry>;
  return (id: WordId<D>, vars?: Vars): string => {
    const e = entries[id];
    if (!e) throw new Error(`No word "${id}" in ${file}`);
    return fill(e.text, vars);
  };
}

/** Every id in a words file, for the tests. */
export const wordIds = <D extends object>(data: D): WordId<D>[] => Object.keys(data).filter((k) => !k.startsWith('$')) as WordId<D>[];
