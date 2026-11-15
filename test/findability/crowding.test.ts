// @vitest-environment jsdom
// Crowding and depth. The other audits ask "can it be found?". This asks what is in the way of the person who is not
// looking for it: how deep a menu entry is buried, how long a list has got, how much a menu holds, and how much of all
// that belongs to a feature they are not using. Reachability counted that a way in exists, so a command four clicks
// down counted the same as Zoom in, and a stream day could add sixty commands while every audit stayed green.
//
// Every cap is written down with its reason. Anything over a cap is on a list in known-gaps.ts that can only shrink,
// and lists made of the person's own things (saved brushes) are named exceptions, because they are content and not
// design. Set FINDABILITY_REPORT=1 to print the numbers.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allCommands, allHelp } from '../../src/core/registry';
import { switchableFeatures } from '../../src/features/host';
import { paletteItems } from '../../src/ui/palette';
import { isStaleCommand } from '../../src/ui/dynamic';
import { loadApp, menuDepths, menuListsWorstCase, quietWorld, SITUATIONS } from './app';
import { BIG_MENUS, DEEP_IN_MENUS, LISTS_OF_YOUR_THINGS, LONG_LISTS, STREAM_LOAD } from './known-gaps';

/** Clicks from the menu bar: "View" is 1, "View > Zoom in" is 2, "View > Audience features > Audience dares > Try the dare" is 4. */
export const MAX_MENU_STEPS = 3;
/** Entries in one list a person sees at once: about what fits a 900 pixel window with the menu bar and a margin. */
export const MAX_LIST_ENTRIES = 30;
/** Commands under one top-level menu, submenus included, before it stops being something you can scan. */
export const MAX_MENU_COMMANDS = 150;

const report: string[] = [];
afterAll(() => {
  if (process.env.FINDABILITY_REPORT) process.stdout.write(`\nCrowding and depth\n${report.join('\n')}\n`);
});

let depths: ReturnType<typeof menuDepths>;
let lists: ReturnType<typeof menuListsWorstCase>;

beforeAll(async () => {
  await loadApp();
  quietWorld();
  depths = menuDepths();
  lists = menuListsWorstCase();
});
afterAll(() => SITUATIONS[0].set());

/** The stream family: the Audience category, the OBS commands and Stream capture. */
const inFamily = (c: { id: string; category?: string }): boolean => c.category === 'Audience' || /^(stream|capture)\./.test(c.id);

describe('menu depth', () => {
  it('looked at the real menus', () => {
    expect(depths.size).toBeGreaterThan(500);
    expect(Math.max(...[...depths.values()].map((d) => d.steps))).toBeGreaterThanOrEqual(3);
  });

  it(`no command is more than ${MAX_MENU_STEPS} clicks down the menus, except the known ones`, () => {
    const deep = [...depths].filter(([, d]) => d.steps > MAX_MENU_STEPS);
    report.push(`Commands deeper than ${MAX_MENU_STEPS} clicks in the menus: ${deep.length}`);
    const fresh = deep.filter(([id]) => !(id in DEEP_IN_MENUS)).map(([id, d]) => `${id}: ${d.path.join(' > ')} (${d.steps} clicks)`);
    expect(fresh, 'flatten the menu, move the entry up, or give it a button').toEqual([]);
  });

  it('the deep list only holds commands that are still that deep', () => {
    const ids = new Set(allCommands().map((c) => c.id));
    const gone = Object.keys(DEEP_IN_MENUS).filter((id) => !ids.has(id) || (depths.get(id)?.steps ?? 0) <= MAX_MENU_STEPS);
    expect(gone, 'no longer deep, or gone: delete the line').toEqual([]);
  });
});

describe('list length', () => {
  it(`no menu or submenu has more than ${MAX_LIST_ENTRIES} entries, except the known ones`, () => {
    const over = [...lists].filter(([path, l]) => l.entries > MAX_LIST_ENTRIES && !LISTS_OF_YOUR_THINGS.includes(path));
    for (const [path, l] of over) report.push(`Long list: ${path} has ${l.entries}`);
    const fresh = over.filter(([path]) => !(path in LONG_LISTS)).map(([path, l]) => `${path} has ${l.entries}`);
    expect(fresh, 'sort it into submenus, or move the rare entries out').toEqual([]);
  });

  it('the long-list numbers are exact: a list that grew fails, and one that shrank says so', () => {
    const moved = Object.entries(LONG_LISTS).filter(([path, n]) => (lists.get(path)?.entries ?? 0) !== n).map(([path, n]) => `${path}: ${lists.get(path)?.entries ?? 'gone'} now, the list says ${n}`);
    expect(moved).toEqual([]);
  });

  it('the exceptions are real lists, and still long', () => {
    for (const path of LISTS_OF_YOUR_THINGS) expect(lists.get(path)?.entries ?? 0, path).toBeGreaterThan(MAX_LIST_ENTRIES);
  });
});

describe('how much a menu holds', () => {
  const total = (menu: string): number => {
    const ids = new Set<string>();
    for (const [path, l] of lists) if (path === menu || path.startsWith(`${menu} > `)) if (!LISTS_OF_YOUR_THINGS.includes(path)) for (const id of l.commands) ids.add(id);
    return ids.size;
  };
  const menus = (): string[] => [...new Set([...lists.keys()].map((p) => p.split(' > ')[0]))];

  it(`no top-level menu holds more than ${MAX_MENU_COMMANDS} commands, submenus and all, except the known ones`, () => {
    const big = menus().filter((m) => total(m) > MAX_MENU_COMMANDS);
    for (const m of big) report.push(`Big menu: ${m} holds ${total(m)} commands`);
    expect(big.filter((m) => !(m in BIG_MENUS)), 'it is the menu for everything: move a family out to its own menu or its own panel').toEqual([]);
  });

  it('the big-menu numbers are exact', () => {
    const moved = Object.entries(BIG_MENUS).filter(([m, n]) => total(m) !== n).map(([m, n]) => `${m}: ${total(m)} now, the list says ${n}`);
    expect(moved).toEqual([]);
  });
});

describe('what a person who does not stream has to wade through', () => {
  const load = () => {
    const family = new Set(allCommands().filter((c) => !isStaleCommand(c.id) && inFamily(c)).map((c) => c.id));
    const palette = paletteItems().filter((i) => i.kind === 'command' && family.has(i.id)).length;
    const inMenus = new Set<string>();
    for (const l of lists.values()) for (const id of l.commands) if (family.has(id)) inMenus.add(id);
    const feats = switchableFeatures().filter((f) => (f.commands ?? []).some((c) => family.has(c.id)));
    const topics = new Set<string>();
    for (const f of feats) for (const h of f.help ?? []) topics.add(h.id);
    for (const c of allCommands()) if (family.has(c.id) && c.help) topics.add(c.help);
    return { palette, menu: inMenus.size, switches: feats.length, help: topics.size };
  };

  it('the stream family is counted in the palette, the menus, Preferences > Features and Help, and the numbers only go down', () => {
    const now = load();
    const all = { palette: paletteItems().filter((i) => i.kind === 'command').length, help: allHelp().length, switches: switchableFeatures().length };
    report.push(`Stream family: ${now.palette} of ${all.palette} palette commands, ${now.menu} menu entries, ${now.switches} of ${all.switches} feature switches, ${now.help} of ${all.help} help topics`);
    expect(now).toEqual(STREAM_LOAD);
  });

  it('the family is found by what it is, not by a list that goes stale', () => {
    expect(allCommands().filter(inFamily).length).toBeGreaterThan(50);
  });
});
