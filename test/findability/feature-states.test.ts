// @vitest-environment jsdom
// Feature states: the document situations in state-coverage never turn a FEATURE on or off, or start a vote, so the
// commands of the audience family were only ever seen idle, or greyed for the one reason a test run has (no desktop).
// An audit that reports "336 greyed, 0 silent" while looking at none of that is reassuring and wrong.
//
// This looks at every feature's commands in the states the feature really has (FEATURE_STATES in app.ts: no desktop,
// just installed, live, a vote going, a prompt in hand...) and with each feature switched off, one at a time. It fails
// when a greyed command says nothing or says something untrue for the state it is in, when a state set up nothing,
// when a command is never on in any state anybody tried, and when switching a feature off leaves something behind or
// switching it on again does not put everything back. Set FINDABILITY_REPORT=1 to print what it found.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allCommands, allPanels, getHelp, type Command } from '../../src/core/registry';
import { reasonFor } from '../../src/core/commandReasons';
import { store } from '../../src/core/store';
import { setFeatureOn, switchableFeatures } from '../../src/features/host';
import type { FeatureDescriptor } from '../../src/features/feature';
import { resolveMenus, type MenuItem } from '../../src/ui/menus';
import { commandEnabled, paletteItems } from '../../src/ui/palette';
import { isStaleCommand, syncDynamicCommands } from '../../src/ui/dynamic';
import { FEATURE_STATES, inFeatureState, loadApp, quietWorld, SITUATIONS, type FeatureState } from './app';
import { NEVER_SEEN_WORKING } from './known-gaps';

type Seen = { enabled: boolean; reason: string | undefined; inMenu: boolean };
interface Look {
  state: FeatureState;
  /** Every command of every switchable feature, as the palette and menus show it in this state. */
  cmds: Map<string, Seen>;
  /** The sentence each greyed command gives, by id. */
  says: Map<string, string | undefined>;
}

const featureCommands = (): { f: FeatureDescriptor; c: Command }[] => switchableFeatures().flatMap((f) => (f.commands ?? []).filter((c) => !c.hidden).map((c) => ({ f, c })));

const menuCommandIds = (): Set<string> => {
  const ids = new Set<string>();
  const walk = (list: MenuItem[]) => {
    for (const i of list) {
      if (i.kind === 'command') ids.add(i.command.id);
      else if (i.kind === 'submenu') walk(i.items);
    }
  };
  for (const m of resolveMenus()) walk(m.items);
  return ids;
};

function look(state: FeatureState): Look {
  return inFeatureState(state, () => {
    const inPalette = new Set(paletteItems().filter((i) => i.kind === 'command' && !isStaleCommand(i.id)).map((i) => i.id));
    const inMenu = menuCommandIds();
    const cmds = new Map<string, Seen>();
    const says = new Map<string, string | undefined>();
    for (const { c } of featureCommands()) {
      if (!inPalette.has(c.id)) continue;
      const enabled = commandEnabled(c);
      const reason = enabled ? undefined : reasonFor(c, store().get());
      cmds.set(c.id, { enabled, reason, inMenu: inMenu.has(c.id) });
      if (!enabled) says.set(c.id, reason);
    }
    return { state, cmds, says };
  });
}

/** What is wrong with a sentence that says what would turn a greyed command on, or null. */
export function reasonProblem(reason: string | undefined, desktop: boolean): string | null {
  if (!reason) return 'says nothing';
  if (/[–—]/.test(reason)) return 'has a dash';
  if (reason.length > 110) return `is ${reason.length} characters, a tooltip should be a line`;
  if (!/[.?!]$/.test(reason)) return 'does not end like a sentence';
  if (desktop && /desktop app/i.test(reason)) return 'blames the missing desktop app while the desktop app is here';
  return null;
}

let looks: Look[] = [];
let everWorked = new Set<string>();

beforeAll(async () => {
  await loadApp();
  looks = FEATURE_STATES.map(look);
  // Everything any document situation or feature state switched on.
  for (const s of SITUATIONS) {
    s.set();
    syncDynamicCommands();
    for (const { c } of featureCommands()) if (commandEnabled(c)) everWorked.add(c.id);
  }
  SITUATIONS[0].set();
  for (const l of looks) for (const [id, v] of l.cmds) if (v.enabled) everWorked.add(id);
});
afterAll(() => {
  quietWorld();
  SITUATIONS[0].set();
});

const report: string[] = [];
afterAll(() => {
  if (process.env.FINDABILITY_REPORT) process.stdout.write(`\nFeature states\n${report.join('\n')}\n`);
});

describe('feature states: each state is what it says', () => {
  it('there are states for no desktop, a fresh install, live, and things going on', () => {
    expect(FEATURE_STATES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(FEATURE_STATES.map((s) => s.id)).size).toBe(FEATURE_STATES.length);
    for (const s of FEATURE_STATES) report.push(`State ${s.id}: ${s.about}`);
  });

  it('every state turns on and greys exactly what it claims, so a state that set up nothing cannot pass', () => {
    const wrong: string[] = [];
    for (const l of looks) {
      for (const id of l.state.proves.on ?? []) if (!l.cmds.get(id)?.enabled) wrong.push(`${l.state.id}: ${id} should be on and is ${l.cmds.has(id) ? 'grey' : 'missing'}`);
      for (const id of l.state.proves.grey ?? []) if (l.cmds.get(id)?.enabled !== false) wrong.push(`${l.state.id}: ${id} should be grey and is ${l.cmds.has(id) ? 'on' : 'missing'}`);
    }
    expect(wrong).toEqual([]);
  });

  it('the states are different from each other', () => {
    const sig = (l: Look) => [...l.cmds].filter(([, v]) => v.enabled).map(([id]) => id).sort().join(',');
    const sigs = looks.map(sig);
    expect(new Set(sigs).size).toBe(sigs.length);
  });
});

describe('feature states: greyed commands tell the truth', () => {
  it('in every state, every greyed command says what would turn it on, in a plain sentence that is true there', () => {
    const bad: string[] = [];
    let greyed = 0;
    for (const l of looks) {
      for (const [id, why] of l.says) {
        greyed++;
        const p = reasonProblem(why, l.state.desktop);
        if (p) bad.push(`${id} in ${l.state.id}: ${p}${why ? ` ("${why}")` : ''}`);
      }
    }
    report.push(`Greyed command-states looked at: ${greyed}`);
    expect(bad).toEqual([]);
  });

  it('a command grey for different reasons says different things, which are the right ones', () => {
    // A reason that reads the state (a vote is going / close the last result) must say so in the state it is for.
    const says = (state: string, id: string) => looks.find((l) => l.state.id === state)?.says.get(id) ?? '';
    expect(says('vote-going', 'votes.start')).toMatch(/already going/i);
    expect(says('vote-result', 'votes.start')).toMatch(/close the last result/i);
    expect(says('round-going', 'guess.start')).toMatch(/already going/i);
    expect(says('no-desktop', 'streamdoor.copyKey')).toMatch(/desktop app/i);
    expect(says('desktop-just-installed', 'streamdoor.copyAddress')).toMatch(/audience features on/i);
    expect(says('desktop-just-installed', 'streamoverlay.test')).toMatch(/audience features on/i);
    expect(says('twitch-connected', 'twitch.connect')).toMatch(/already connected/i);
    expect(says('no-desktop', 'twitch.connect')).toMatch(/desktop app/i);
  });

  it('every command of every feature is on in at least one state, or is on the known list that only shrinks', () => {
    const never = featureCommands().filter(({ c }) => !everWorked.has(c.id)).map(({ c }) => c.id);
    report.push(`Feature commands never seen on in any state: ${never.length}`);
    expect(never.filter((id) => !(id in NEVER_SEEN_WORKING)), 'no state anybody tried makes this command work: add a state in app.ts that does').toEqual([]);
    expect(Object.keys(NEVER_SEEN_WORKING).filter((id) => !never.includes(id)), 'a state turns it on now, or it is gone: delete the line').toEqual([]);
  });
});

describe('feature states: each feature switched off, one at a time', () => {
  /** The features that need `id`, deepest first, so they can be switched off before it. */
  const usersOf = (id: string, seen = new Set<string>()): string[] => {
    const out: string[] = [];
    for (const f of switchableFeatures()) if ((f.requires ?? []).includes(id) && !seen.has(f.id)) {
      seen.add(f.id);
      out.push(...usersOf(f.id, seen), f.id);
    }
    return out;
  };
  const snapshot = () => {
    syncDynamicCommands();
    return { palette: [...new Set(paletteItems().filter((i) => i.kind === 'command' && !isStaleCommand(i.id)).map((i) => i.id))].sort(), menu: [...menuCommandIds()].sort() };
  };

  it('what it adds goes away with it and comes back whole', () => {
    quietWorld();
    SITUATIONS[0].set();
    const before = snapshot();
    const problems: string[] = [];
    for (const f of switchableFeatures()) {
      const gone = [...usersOf(f.id), f.id];
      for (const id of gone) setFeatureOn(id, false, { remember: false });
      const off = snapshot();
      const own = (f.commands ?? []).filter((c) => !c.hidden).map((c) => c.id);
      for (const id of own) {
        if (off.palette.includes(id)) problems.push(`${f.id} off: "${id}" is still in the palette`);
        if (off.menu.includes(id)) problems.push(`${f.id} off: "${id}" is still in a menu`);
      }
      for (const p of f.panels ?? []) if (allPanels().some((x) => x.id === p.id)) problems.push(`${f.id} off: panel "${p.id}" is still there`);
      for (const h of f.help ?? []) if (getHelp(h.id)) problems.push(`${f.id} off: help topic "${h.id}" is still listed`);
      if (!off.palette.includes(`features.turnOn.${f.id}`)) problems.push(`${f.id} off: nothing in the palette offers to turn it back on`);
      // Every list in the menus still has something in it, and none starts or ends with a line.
      for (const m of resolveMenus()) {
        const walk = (items: MenuItem[], path: string): void => {
          if (!items.some((i) => i.kind === 'command' || i.kind === 'submenu')) problems.push(`${f.id} off: ${path} is an empty list`);
          if (items[0]?.kind === 'separator' || items[items.length - 1]?.kind === 'separator') problems.push(`${f.id} off: ${path} starts or ends with a line`);
          for (let i = 1; i < items.length; i++) if (items[i].kind === 'separator' && items[i - 1].kind === 'separator') problems.push(`${f.id} off: ${path} has two lines in a row`);
          for (const i of items) if (i.kind === 'submenu') walk(i.items, `${path} > ${i.label}`);
        };
        walk(m.items, m.menu.label);
      }
      try {
        for (const id of [...gone].reverse()) setFeatureOn(id, true, { remember: false });
      } catch (e) {
        problems.push(`${f.id} cannot be switched back on: ${e instanceof Error ? e.message : String(e)}`);
      }
      const back = snapshot();
      if (JSON.stringify(back) !== JSON.stringify(before)) {
        const lost = [...before.palette.filter((x) => !back.palette.includes(x)), ...before.menu.filter((x) => !back.menu.includes(x))];
        const extra = [...back.palette.filter((x) => !before.palette.includes(x)), ...back.menu.filter((x) => !before.menu.includes(x))];
        problems.push(`${f.id} switched off and on again: ${lost.length ? `lost ${lost.slice(0, 5).join(', ')}` : ''}${extra.length ? ` gained ${extra.slice(0, 5).join(', ')}` : ''}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
