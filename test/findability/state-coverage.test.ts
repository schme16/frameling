// @vitest-environment jsdom
// State coverage: what is on offer changes with the state of the app (a pixel layer, a selection, a symbol open,
// playing, a feature switched off). For every command, tool, panel and feature this records whether it is present,
// greyed out, or absent in each state, and fails on "absent and unexplained", which is what "hidden at the wrong
// times" means: it was there a moment ago, now it has gone, and nothing says why.
//
// Present with a reason always passes. A thing counts as explained when something a person can reach shows it greyed
// (the palette does, with a sentence and a link to its help), when a twin that does the same job stands in for it, when
// a "Turn on ..." entry finds it, or when the workspace's own description names it. Set FINDABILITY_REPORT=1 to print
// everything this found.
//
// What this cannot do: it reads the registry, the menus, the tool rail's rules and the dock layouts, not pixels. It
// cannot see a panel that is on screen but empty, a button greyed with no tooltip, or the narrow-screen layout (that
// is the window's width, which only the running app has). Those are the running-app half of this audit, in
// docs/testing.md. And "nothing open" is not a state of its own: Frameling always has a drawing, so the nearest state
// is a new empty one with the welcome sheet on top.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allCommands, allPanels, allTools, type Command } from '../../src/core/registry';
import { findLayer } from '../../src/core/doc';
import type { LayerKind } from '../../src/core/format';
import { store } from '../../src/core/store';
import { offFeatures, setFeatureOn, switchableFeatures } from '../../src/features/host';
import { builtinWorkspaces } from '../../src/ui/dock';
import { placedIds } from '../../src/ui/dockModel';
import { isStaleCommand, syncDynamicCommands } from '../../src/ui/dynamic';
import { resolveMenus, type MenuItem } from '../../src/ui/menus';
import { commandEnabled, paletteItems, rankPalette } from '../../src/ui/palette';
import { getPrefs } from '../../src/ui/prefs';
import { railFor, type RailTool } from '../../src/ui/toolArrange';
import { loadApp, reachability, SITUATIONS, type Reach, type Situation } from './app';
import { ABSENT_UNEXPLAINED, CEILINGS, PANELS_TUCKED_AWAY_SILENTLY } from './known-gaps';

type Cell = 'present' | 'greyed' | 'absent';

interface Snapshot {
  situation: Situation;
  kind: LayerKind | null;
  palette: Map<string, Cell>;
  menu: Map<string, Cell>;
  /** Tools on the rail, and whether the rail greys the ones that do not work here (otherwise it leaves them out). */
  rail: { shown: Set<string>; off: Set<string> };
}

const cellOf = (c: Command): Cell => (commandEnabled(c) ? 'present' : 'greyed');

function snapshot(situation: Situation): Snapshot {
  situation.set();
  syncDynamicCommands();
  const { doc, ui } = store().get();
  const kind = findLayer(doc, ui.activeLayerId)?.kind ?? null;
  const palette = new Map<string, Cell>();
  for (const it of paletteItems()) if (it.kind === 'command' && !isStaleCommand(it.id)) palette.set(it.id, cellOf(it.command));
  const menu = new Map<string, Cell>();
  const walk = (list: MenuItem[]) => {
    for (const i of list) {
      if (i.kind === 'command') menu.set(i.command.id, cellOf(i.command));
      else if (i.kind === 'submenu') walk(i.items);
    }
  };
  for (const m of resolveMenus()) walk(m.items);
  const r = railFor(allTools() as RailTool[], kind, undefined, getPrefs().toolsOffLayer === 'grey');
  return { situation, kind, palette, menu, rail: { shown: new Set(r.shown.map((id) => `tools.${id}`)), off: new Set(r.off.map((id) => `tools.${id}`)) } };
}

let shots: Snapshot[] = [];
let reach: Reach;
let commands: Command[] = [];

beforeAll(async () => {
  await loadApp();
  commands = allCommands().filter((c) => !isStaleCommand(c.id));
  reach = reachability();
  shots = SITUATIONS.map(snapshot);
});
afterAll(() => SITUATIONS[0].set());

const everywhere = (pick: (s: Snapshot) => Map<string, Cell>) => new Set(shots.flatMap((s) => [...pick(s).keys()]));

/** A tool command's twin: another tool with the same name that does the same job on the other kind of layer. */
const sameLabel = (a: Command, b: Command) => a.id !== b.id && a.label === b.label && a.id.startsWith('tools.') && b.id.startsWith('tools.');

/** Said once at the end of a run, for a person reading the output. */
const report: string[] = [];
const say = (line: string) => report.push(line);
afterAll(() => {
  if (process.env.FINDABILITY_REPORT) process.stdout.write(`\nState coverage\n${report.join('\n')}\n`);
});

describe('state coverage audit', () => {
  it('looked at every state, and each one is really different', () => {
    expect(shots.length).toBe(SITUATIONS.length);
    expect(SITUATIONS.length).toBeGreaterThanOrEqual(8);
    expect(commands.length).toBeGreaterThan(300);
    for (const s of shots) expect(s.palette.size, s.situation.id).toBeGreaterThan(300);
    // A situation that set nothing up would look the same as the blank one.
    expect(new Set(shots.map((s) => s.kind)).size).toBeGreaterThanOrEqual(3);
    const greyedIn = (id: string) => shots.find((s) => s.situation.id === id)!;
    const count = (s: Snapshot) => [...s.palette.values()].filter((c) => c === 'greyed').length;
    expect(count(greyedIn('vector-selected'))).toBeLessThan(count(greyedIn('vector')));
  });

  it('nothing vanishes from the palette without a twin standing in for it', () => {
    const everPresent = everywhere((s) => s.palette);
    const vanished: string[] = [];
    for (const s of shots) {
      for (const c of commands) {
        if (!everPresent.has(c.id) || s.palette.has(c.id)) continue;
        const twinStandsIn = commands.some((o) => sameLabel(c, o) && s.palette.has(o.id));
        if (!twinStandsIn) vanished.push(`${c.id} in ${s.situation.id}`);
      }
    }
    expect(vanished).toEqual([]);
  });

  it('every command left out of the palette has some other way in, or is on the known list', () => {
    const everPresent = everywhere((s) => s.palette);
    const lost = commands.filter((c) => !everPresent.has(c.id) && !commands.some((o) => sameLabel(c, o) && everPresent.has(o.id)));
    const unexplained = lost.filter((c) => !(reach.ways.get(c.id) ?? []).some((w) => w !== 'palette')).map((c) => c.id);
    say(`Left out of the palette and reached from nowhere else: ${unexplained.join(', ') || 'none'}`);
    expect(unexplained.filter((id) => !(id in ABSENT_UNEXPLAINED))).toEqual([]);
    expect(Object.keys(ABSENT_UNEXPLAINED).filter((id) => !unexplained.includes(id)), 'now explained or gone: delete the line').toEqual([]);
  });

  it('a greyed command is greyed with a reason: its help page, which the palette links to', () => {
    // The palette says "can't be used right now" and offers "Read about it" (help id). A greyed command with no help
    // id gets a vaguer sentence. The help audit already fails a command with no help id; this is the same fact from
    // the point of view of the person who just pressed a greyed row.
    const everGreyed = new Set(shots.flatMap((s) => [...s.palette].filter(([, c]) => c === 'greyed').map(([id]) => id)));
    const vague = commands.filter((c) => everGreyed.has(c.id) && !c.help).map((c) => c.id);
    say(`Commands greyed in at least one state, each with only the shared sentence plus a link to its help page, no reason written for it: ${everGreyed.size}`);
    expect(vague).toEqual([]);
  });

  it('tools that leave the rail on another kind of layer are counted, and the number only goes down', () => {
    const onRailSomewhere = everywhere((s) => new Map([...s.rail.shown].map((id) => [id, 'present'] as [string, Cell])));
    // Tools that share a slot (Select and Pixel select) are one button: the one that works here stands in, so nothing went.
    const slotOf = (id: string) => allTools().find((t) => `tools.${t.id}` === id)?.slot;
    const standsIn = (s: Snapshot, id: string) => !!slotOf(id) && [...s.rail.shown].some((o) => slotOf(o) === slotOf(id));
    const gone = (s: Snapshot) => [...onRailSomewhere].filter((id) => !s.rail.shown.has(id) && !s.rail.off.has(id) && !standsIn(s, id));
    const now = Object.fromEntries(shots.map((s) => [s.situation.id, gone(s).length]));
    for (const s of shots) if (gone(s).length) say(`Tools that vanish from the rail on ${s.kind ?? 'no'} layer (${s.situation.id}), pref "${getPrefs().toolsOffLayer}": ${gone(s).map((x) => x.slice(6)).join(', ')}`);
    expect(now).toEqual(CEILINGS.railToolsVanish);
  });

  it('commands that leave the menus in some state are counted, and the number only goes down', () => {
    const inAMenu = everywhere((s) => s.menu);
    // A twin (Select and Pixel select) stands in for the one that is not shown, so nothing went.
    const byId = new Map(commands.map((c) => [c.id, c]));
    const standsIn = (s: Snapshot, id: string) => [...s.menu.keys()].some((o) => byId.get(o) && byId.get(id) && sameLabel(byId.get(o)!, byId.get(id)!));
    const gone = (s: Snapshot) => [...inAMenu].filter((id) => !s.menu.has(id) && !standsIn(s, id));
    const now = Object.fromEntries(shots.map((s) => [s.situation.id, gone(s).length]));
    for (const s of shots) if (gone(s).length) say(`Leave the menus in ${s.situation.id}: ${gone(s).slice(0, 12).join(', ')}${gone(s).length > 12 ? ` and ${gone(s).length - 12} more` : ''}`);
    expect(now).toEqual(CEILINGS.menuCommandsVanish);
  });

  it('greyed menu items are counted (they say nothing when pressed)', () => {
    // Pressing a greyed palette row explains itself; pressing a greyed menu item does nothing and says nothing.
    const greyed = (s: Snapshot) => [...s.menu].filter(([, c]) => c === 'greyed').length;
    for (const s of shots) say(`Greyed menu items with no reason, ${s.situation.id}: ${greyed(s)}`);
    expect(shots.some((s) => greyed(s) > 0)).toBe(true);
  });

  it('a workspace that tucks panels away names them, or is on the known list', () => {
    const silent: Record<string, string[]> = {};
    for (const w of builtinWorkspaces()) {
      const placed = new Set(placedIds(w.layout));
      const about = (w.about ?? '').toLowerCase();
      const missing = allPanels().filter((p) => !placed.has(p.id) && !about.includes(p.title.toLowerCase())).map((p) => p.id);
      if (missing.length) silent[w.id] = missing;
    }
    for (const [w, ids] of Object.entries(silent)) say(`The ${w} workspace puts ${ids.join(', ')} out of sight and does not say so`);
    expect(silent).toEqual(PANELS_TUCKED_AWAY_SILENTLY);
  });

  describe('each optional feature turned off', () => {
    const turnedOff: Record<string, { commands: string[]; panels: string[]; tools: string[]; lost: string[] }> = {};

    beforeAll(() => {
      const all = switchableFeatures();
      // Newest first, so a feature goes before the ones it needs.
      for (const f of [...all].reverse()) setFeatureOn(f.id, false, { remember: false });
      syncDynamicCommands();
      const off = offFeatures();
      const items = paletteItems();
      const found = (q: string, id: string) => rankPalette(q, items, [], 5).some((h) => h.item.id === id);
      for (const f of off) {
        const own = { commands: (f.commands ?? []).filter((c) => !c.hidden), panels: f.panels ?? [], tools: f.tools ?? [] };
        // Each thing the feature adds is asked for by its own name; the palette's "Turn on" entry should come up.
        const lost = [
          ...own.commands.filter((c) => !found(c.label, `features.turnOn.${f.id}`)).map((c) => `command "${c.label}"`),
          ...own.panels.filter((p) => !found(p.title, `features.turnOn.${f.id}`)).map((p) => `panel "${p.title}"`),
          ...own.tools.filter((t) => !found(t.label, `features.turnOn.${f.id}`)).map((t) => `tool "${t.label}"`),
        ];
        turnedOff[f.id] = { commands: own.commands.map((c) => c.id), panels: own.panels.map((p) => p.id), tools: own.tools.map((t) => t.id), lost };
      }
    });
    afterAll(() => {
      for (const f of switchableFeatures()) setFeatureOn(f.id, true, { remember: false });
      syncDynamicCommands();
    });

    it('there are optional features, and they take things with them', () => {
      expect(Object.keys(turnedOff).length).toBeGreaterThanOrEqual(5);
      const taken = Object.values(turnedOff).reduce((n, f) => n + f.commands.length + f.panels.length + f.tools.length, 0);
      expect(taken).toBeGreaterThan(50);
    });

    it('everything a feature takes away can be found again by typing its name: a "Turn on" entry comes up', () => {
      const lost = Object.entries(turnedOff).flatMap(([id, f]) => f.lost.map((what) => `${id}: ${what}`));
      for (const l of lost) say(`Feature off, not found by its own name: ${l}`);
      expect(lost).toEqual([]);
    });
  });
});
