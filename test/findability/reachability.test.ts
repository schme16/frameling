// @vitest-environment jsdom
// Reachability: for every command, every way a person can get to it (the palette, a menu, the tool rail, a key, a
// button or panel on screen). A command reachable only by typing its name into the palette is a feature only people who
// already know its name can use, so it fails here, unless it is on the checked-in list of known ones, which can only
// shrink. Set FINDABILITY_REPORT=1 to print the whole table.
//
// What this cannot see: a command can be named in a component that never draws it in the state you are in, and a key
// can be rebound away. "On screen" is read from the source (a component that names the command), not from the running
// app, so a button hidden behind a closed panel still counts. The running-app version of this audit is in docs/testing.md.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerCommand, unregisterCommand } from '../../src/core/registry';
import { loadApp, reachability, SITUATIONS, type Reach, type Way } from './app';
import { KEYS_AND_PALETTE_ONLY, PALETTE_ONLY } from './known-unreachable';

let r: Reach;
const NON_PALETTE: Way[] = ['menu', 'rail', 'keys', 'screen'];

beforeAll(async () => {
  await loadApp();
  r = reachability();
  if (process.env.FINDABILITY_REPORT) {
    const rows = [...r.ways].map(([id, ways]) => `${id.padEnd(40)} ${ways.join(', ') || 'NOWHERE'}`);
    process.stdout.write(`\nReachability (${rows.length} commands)\n${rows.join('\n')}\n`);
  }
});
afterAll(() => SITUATIONS[0].set());

/** Nothing but the palette (or nothing at all) gets a person to it. */
const noWayIn = (id: string): boolean => !(r.ways.get(id) ?? []).some((x) => NON_PALETTE.includes(x));
/** A key and nothing else a person could see. */
const keyOnly = (id: string): boolean => {
  const w = r.ways.get(id) ?? [];
  return w.includes('keys') && !w.some((x) => x === 'menu' || x === 'rail' || x === 'screen');
};

describe('reachability audit', () => {
  it('looked at the real app, not an empty one', () => {
    expect(r.commands.length).toBeGreaterThan(300);
    const by = (w: Way) => [...r.ways.values()].filter((x) => x.includes(w)).length;
    for (const w of ['palette', 'menu', 'rail', 'keys', 'screen'] as Way[]) expect(by(w), w).toBeGreaterThan(0);
  });

  it('no command is reachable only from the palette or from nowhere, except the known ones', () => {
    const fresh = r.commands.map((c) => c.id).filter((id) => noWayIn(id) && !(id in PALETTE_ONLY) && !keyOnly(id));
    expect(fresh, 'give each a way in: a menu entry, a button in its panel, or a spot on a bar').toEqual([]);
  });

  it('no command is on a key and nowhere else, except the known ones', () => {
    const fresh = r.commands.map((c) => c.id).filter((id) => keyOnly(id) && !(id in KEYS_AND_PALETTE_ONLY));
    expect(fresh, 'a key is a shortcut, not a way to find it: add a menu entry or a button').toEqual([]);
  });

  it('the known lists only hold commands that still exist and are still stuck', () => {
    const ids = new Set(r.commands.map((c) => c.id));
    const gone = [...Object.keys(PALETTE_ONLY), ...Object.keys(KEYS_AND_PALETTE_ONLY)].filter((id) => !ids.has(id));
    expect(gone, 'no longer registered: delete the line').toEqual([]);
    const paid = Object.keys(PALETTE_ONLY).filter((id) => !noWayIn(id));
    expect(paid, 'now has a way in: delete the line').toEqual([]);
    const paidKeys = Object.keys(KEYS_AND_PALETTE_ONLY).filter((id) => !keyOnly(id));
    expect(paidKeys, 'now has a way in (or lost its key): delete the line').toEqual([]);
  });

  it('every tool is on the rail in some kind of layer, so none is only a command', () => {
    const tools = [...r.ways].filter(([id]) => id.startsWith('tools.'));
    expect(tools.length).toBeGreaterThan(20);
    const lost = tools.filter(([, w]) => !w.includes('rail') && !w.includes('menu')).map(([id]) => id);
    expect(lost).toEqual([]);
  });

  it('catches a command nobody can get to, so the audit cannot pass by looking at nothing', () => {
    registerCommand({ id: 'zz.nobodyCanFindMe', label: 'Nobody can find me', category: 'Test', run: () => {} });
    try {
      const again = reachability();
      expect(again.ways.get('zz.nobodyCanFindMe')).toEqual(['palette']);
    } finally {
      unregisterCommand('zz.nobodyCanFindMe');
    }
  });
});
