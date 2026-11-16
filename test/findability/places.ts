// Where every command lives, written down so a move cannot go unnoticed. The other findability audits ask "can a person
// reach it?", which a command passes before and after being moved. This asks the question the person actually has:
// "is it where I left it?". It reads the real registry, menus, shortcuts and palette; nothing here is a fixture.
//
// A recorded place has five facts a person relies on: the menu it is in (and so how many clicks deep), its name, its
// shortcut, the feature switch it sits behind, and the words that find it in the palette. `places.json` holds them as
// they were; `known-moves.ts` holds the deliberate changes since, each with a reason.
import { allCommands, type Command } from '../../src/core/registry';
import { isStaleCommand, syncDynamicCommands } from '../../src/ui/dynamic';
import { switchableFeatures } from '../../src/features/host';
import { resolveMenus, type MenuItem } from '../../src/ui/menus';
import { paletteItems, rankPalette, type PaletteItem } from '../../src/ui/palette';
import { quietWorld, SITUATIONS } from './app';
import { ALWAYS_ON, IN_PALETTE, NO_KEYS, NO_MENU, NOT_IN_PALETTE, WORD_RECORDED_AT, WORD_TOLERATED_TO, type Place } from './places-logic';

export { NO_MENU, NO_KEYS, ALWAYS_ON, IN_PALETTE, NOT_IN_PALETTE, NOT_FOUND, WORD_RECORDED_AT, WORD_TOLERATED_TO, clicksOf } from './places-logic';

/** At most this many words are recorded per command, so the file stays readable. */
const MAX_WORDS = 3;

/** "Menu > Submenu" for every list in every menu, per command id, across every document situation. */
function menuPaths(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const walk = (items: MenuItem[], path: string[]): void => {
    for (const i of items) {
      if (i.kind === 'command') {
        const set = out.get(i.command.id) ?? new Set<string>();
        set.add(path.join(' > '));
        out.set(i.command.id, set);
      } else if (i.kind === 'submenu') walk(i.items, [...path, i.label]);
    }
  };
  for (const s of SITUATIONS) {
    s.set();
    for (const m of resolveMenus()) walk(m.items, [m.menu.label]);
  }
  return out;
}

const lower = (s: string): string => s.toLowerCase().trim();

/** Where every command is right now, as the app starts: features at their defaults, the quiet world, no desktop. */
/** `withWords` also works out the finding words, which takes a minute: only when writing the record, never when checking it. */
export function placesNow(withWords = false): Record<string, Place> {
  quietWorld();
  syncDynamicCommands();
  const paths = menuPaths();
  SITUATIONS[0].set();
  const owner = new Map<string, string>();
  for (const f of switchableFeatures()) for (const c of f.commands ?? []) owner.set(c.id, f.id);
  const items: PaletteItem[] = paletteItems().filter((i) => !(i.kind === 'command' && isStaleCommand(i.id)));
  const inPalette = new Set(items.filter((i) => i.kind === 'command').map((i) => i.id));
  const top = (word: string): string[] => rankPalette(word, items, [], WORD_TOLERATED_TO).filter((h) => h.item.kind === 'command').slice(0, WORD_RECORDED_AT).map((h) => h.item.id);
  const out: Record<string, Place> = {};
  for (const c of allCommands().filter((x) => !isStaleCommand(x.id)).sort((a, b) => a.id.localeCompare(b.id))) {
    out[c.id] = {
      name: c.label,
      place: paths.has(c.id) ? [...paths.get(c.id)!].sort().join(' | ') : NO_MENU,
      keys: c.keys?.length ? c.keys.join(', ') : NO_KEYS,
      switch: owner.get(c.id) ?? ALWAYS_ON,
      palette: inPalette.has(c.id) ? IN_PALETTE : NOT_IN_PALETTE,
      words: withWords && inPalette.has(c.id) ? findingWords(c, top) : [],
    };
  }
  return out;
}

/** The command's own search words that put it in the first three results. Only single, plain words and short phrases. */
function findingWords(c: Command, top: (w: string) => string[]): string[] {
  const out: string[] = [];
  for (const k of [...new Set((c.keywords ?? []).map(lower))]) {
    if (out.length >= MAX_WORDS) break;
    if (k.length >= 3 && top(k).includes(c.id)) out.push(k);
  }
  return out;
}

/** Does a search for this word still show the command in the first five results? */
export function stillFinds(word: string, id: string, items: PaletteItem[]): boolean {
  return rankPalette(word, items, [], WORD_TOLERATED_TO).some((h) => h.item.kind === 'command' && h.item.id === id);
}

export function paletteNow(): PaletteItem[] {
  syncDynamicCommands();
  return paletteItems().filter((i) => !(i.kind === 'command' && isStaleCommand(i.id)));
}
