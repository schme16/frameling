// @vitest-environment jsdom
// Moved commands. "The capture view vanished twice in a day": it was built under View, tidied into its own Streaming
// menu, then moved again into View > Sharing your screen, each step right and each at the person's request, and no test
// said a word, because every other audit asks "can it be reached?" and it could. This asks "is it where it was?".
//
// places.json is where every command was (menu, name, shortcut, feature switch, the words that find it). Any command
// that is somewhere else now fails here, in words, until the change is written in known-moves.ts with a reason. It
// can only hold deliberate moves, so it costs nothing but honesty. New commands are not a problem: they simply are not
// protected until `PLACES_WRITE=add npx vitest run test/findability/places.test.ts` records them.
//
//   PLACES_WRITE=add      record commands the file does not know yet (never changes one it knows)
//   PLACES_WRITE=rebase   record everything as it is now and empty known-moves.ts (do this when cutting a release)
//   FINDABILITY_REPORT=1  print what moved and what is new
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allCommands, type Command } from '../../src/core/registry';
import { loadApp, quietWorld, SITUATIONS } from './app';
import { MOVES, type Move } from './known-moves';
import { paletteNow, placesNow, stillFinds } from './places';
import { ALWAYS_ON, differences, excused, failure, ledgerProblems, NO_KEYS, NO_MENU, sentence, type Book, type Change, type Searcher } from './places-logic';
import type { PaletteItem } from '../../src/ui/palette';
import '../../src/renderer/features';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'places.json');
const MOVES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'known-moves.ts');

const readBook = (): Book => JSON.parse(readFileSync(FILE, 'utf8')) as Book;
/** One command per line, so a diff of this file reads like a list of what changed. */
const writeBook = (b: Book): void => writeFileSync(FILE, `{\n${Object.entries(b).map(([id, p]) => `${JSON.stringify(id)}: ${JSON.stringify(p)}`).join(',\n')}\n}\n`);

const commandsById = (): Map<string, Command> => new Map(allCommands().map((c) => [c.id, c]));

let was: Book = {};
let now: Book = {};
let items: PaletteItem[] = [];

beforeAll(async () => {
  await loadApp();
  const writing = !!process.env.PLACES_WRITE;
  now = placesNow(writing);
  items = paletteNow();
  was = JSON.parse(readFileSync(FILE, 'utf8') || '{}') as Book;
  const mode = process.env.PLACES_WRITE;
  if (mode === 'rebase') {
    writeBook(now);
    writeFileSync(MOVES_FILE, readFileSync(MOVES_FILE, 'utf8').replace(/export const MOVES: Move\[\] = \[[\s\S]*?\n\];/, 'export const MOVES: Move[] = [];'));
    was = now;
  } else if (mode === 'add') {
    const book = readBook();
    for (const [id, p] of Object.entries(now)) if (!(id in book)) book[id] = p;
    writeBook(Object.fromEntries(Object.entries(book).sort(([a], [b]) => a.localeCompare(b))));
    was = book;
  }
}, 400_000);
afterAll(() => {
  quietWorld();
  SITUATIONS[0].set();
});

const searcher: Searcher = {
  keywords: (id) => new Set((commandsById().get(id)?.keywords ?? []).map((k) => k.toLowerCase().trim())),
  finds: (word, id) => stillFinds(word, id, items),
};
let cached: Change[] | null = null;
const changes = (): Change[] => (cached ??= differences(was, now, searcher));

const report: string[] = [];
afterAll(() => {
  if (process.env.FINDABILITY_REPORT) process.stdout.write(`\nMoved commands\n${report.join('\n')}\n`);
});

describe('moved commands: nothing moves without a reason written down', () => {
  it('the record of where commands are is there, and covers nearly everything', () => {
    const known = Object.keys(was).length;
    const all = Object.keys(now).length;
    const missing = Object.keys(now).filter((id) => !(id in was));
    report.push(`Commands recorded: ${known}. In the app now: ${all}. Not recorded yet: ${missing.length}.`);
    expect(known).toBeGreaterThan(0);
    expect(missing.length, `${missing.length} commands are not recorded, so a move of any of them would go unnoticed. Record them with: PLACES_WRITE=add npx vitest run test/findability/places.test.ts (first ones: ${missing.slice(0, 6).join(', ')})`).toBeLessThanOrEqual(Math.ceil(all * 0.1));
  });

  it('no command has changed its place, name, shortcut, feature switch or search words without a line in known-moves.ts', () => {
    const unexplained = changes().filter((c) => !excused(c, MOVES, new Set()));
    for (const c of changes()) report.push(`${excused(c, MOVES, new Set()) ? 'explained' : 'UNEXPLAINED'}: ${sentence(c, was, now)}`);
    expect(unexplained.map((c) => sentence(c, was, now)), failure(unexplained, was, now)).toEqual([]);
  });

  it('every written-down move is still true: nothing in known-moves.ts is stale, empty of reason, or contradicts where the command is', () => {
    const used = new Set<Move>();
    for (const c of changes()) excused(c, MOVES, used);
    expect(ledgerProblems(MOVES, was, used)).toEqual([]);
  });

  it('what is recorded about a command is what a person would see, so the record cannot drift from the app', () => {
    // A cheap guard on the recording itself: every place names a real menu path or says there is none, and a command
    // with a shortcut says it. Catches a recorder that quietly went blank.
    const blank = Object.entries(now).filter(([, p]) => !p.name || !p.place || !p.keys || !p.switch).map(([id]) => id);
    expect(blank).toEqual([]);
    const inMenus = Object.values(now).filter((p) => p.place !== NO_MENU).length;
    const withKeys = Object.values(now).filter((p) => p.keys !== NO_KEYS).length;
    const behindSwitch = Object.values(now).filter((p) => p.switch !== ALWAYS_ON).length;
    report.push(`In a menu: ${inMenus}. With a shortcut: ${withKeys}. Behind a feature switch: ${behindSwitch}.`);
    expect(inMenus).toBeGreaterThan(100);
    expect(withKeys).toBeGreaterThan(50);
    expect(behindSwitch).toBeGreaterThan(20);
  });

  it('the capture view, the thing that started this, is recorded in the place the person was told', () => {
    const c = was['capture.toggle'];
    expect(c, 'capture.toggle is in the record').toBeDefined();
    expect(c.place).toContain('View > Sharing your screen');
  });
});
