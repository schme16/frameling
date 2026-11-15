// Deliberate moves. When a command's place, name, shortcut, feature switch or search words change, the moved-commands
// audit (places.test.ts) fails until the change is written here with the reason, so a person who used it yesterday is
// never left hunting for it without anybody having said so. This file only ever holds the changes since the baseline in
// places.json was taken; `PLACES_WRITE=rebase npx vitest run test/findability/places.test.ts` folds them into a fresh
// baseline (and empties this list) when a release is cut.
//
// Copy the line the failing test prints. `from` and `to` are the exact words it shows. Then do the other half, which
// no test can do: when you send a look that moves something, say the old place and the new one in a sentence.
//
// What can be written:
//   place    the menu it is in, or how deep it is, changed
//   name     it was renamed
//   keys     its shortcut was changed or taken away
//   switch   the feature switch it sits behind changed
//   palette  it came into or left the palette
//   search   a word that used to find it no longer does (from: the word, to: 'not in the first five results')
//   gone     the command no longer exists (from: its old name, to: 'removed'; say in why what replaced it)
export type MoveKind = 'place' | 'name' | 'keys' | 'switch' | 'palette' | 'search' | 'gone';

export interface Move {
  /** The command id, as in the registry. */
  id: string;
  what: MoveKind;
  from: string;
  to: string;
  /** Plain words: what this was for, and who asked. At least a short sentence. */
  why: string;
}

export const MOVES: Move[] = [];
