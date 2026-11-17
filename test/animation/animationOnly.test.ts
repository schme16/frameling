// @vitest-environment jsdom
// What a picture with no animation leaves out of sight, and what happens when it is asked for anyway. The list is one
// small set (src/core/animationOnly.ts); the rest is how every place reads it.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ANIMATION_ONLY, RIG_KIT, animationOnlyOf, commandIsAnimationOnly, isAnimationOnly, toolForStill } from '../../src/core/animationOnly';
import { ADD_ANIMATION_FIRST, animationKind, gateEnabled, gateReason, offerWords } from '../../src/core/animationGate';
import { isAnimated } from '../../src/core/animation';
import { newDoc } from '../../src/core/doc';
import { allCommands, allPanels, allTools, getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { watchStillTool } from '../../src/animation/stillFallbacks';
import { floatsWithout, zoneWithout } from '../../src/ui/stillZone';
import type { FloatWin, ZoneState } from '../../src/ui/dockModel';
import { resolveMenus } from '../../src/ui/menus';
import { toasts } from '../../src/ui/toast';
import { commandEnabled, runCommand } from '../../src/ui/palette';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { loadApp } from '../findability/app';

const still = () => resetStore(newDoc({ animated: false }));
const animated = () => resetStore(newDoc({ animated: true }));
const cmd = (id: string) => getCommand(id)!;

beforeAll(async () => {
  await loadApp();
  syncDynamicCommands();
});

describe('the list', () => {
  it('names what the user asked to be hidden: the lip sync, Draw on and Clip flow panels and the motion tools', () => {
    expect(animationOnlyOf('panel').sort()).toEqual(['clip-flow', 'draw-on', 'lipsync']);
    expect(animationOnlyOf('tool').sort()).toEqual(['motion-path', 'record-move', 'shape-hints']);
    expect(animationOnlyOf('menu')).toEqual([]);
  });
  it('every panel and tool in it is a real one, so a rename cannot leave it hiding nothing', () => {
    const panels = new Set(allPanels().map((p) => p.id));
    const tools = new Set(allTools().map((t) => t.id));
    for (const id of animationOnlyOf('panel')) expect(panels.has(id), id).toBe(true);
    for (const id of animationOnlyOf('tool')) expect(tools.has(id), id).toBe(true);
    for (const id of animationOnlyOf('command')) expect(getCommand(id), id).toBeTruthy();
  });
  it('a rig, which a still can be posed with, is not in it: the rig tools, the Rig panel and the Rigging menu stay', () => {
    for (const e of RIG_KIT) expect(ANIMATION_ONLY.has(e), e).toBe(false);
    expect(isAnimationOnly('tool', 'bone')).toBe(false);
    expect(isAnimationOnly('menu', 'Extras')).toBe(false);
    expect(animationKind({ id: 'tools.pose', category: 'Tools' })).toBe('open');
    expect(animationKind({ id: 'rig.addBones', category: 'Rig' })).toBe('open');
    expect(animationKind({ id: 'view.panel.rig', category: 'View' })).toBe('open');
  });
  it('the rig kit is real ids, and adding it in one line is all it takes to hide the rig as well', () => {
    const tools = new Set(allTools().map((t) => t.id));
    for (const e of RIG_KIT.filter((x) => x.startsWith('tool:'))) expect(tools.has(e.slice(5)), e).toBe(true);
    const withRig = new Set([...ANIMATION_ONLY, ...RIG_KIT]);
    expect(commandIsAnimationOnly({ id: 'tools.bone', category: 'Tools' }, withRig)).toBe(true);
    expect(commandIsAnimationOnly({ id: 'rig.addBones', category: 'Rig' }, withRig)).toBe(true);
    expect(commandIsAnimationOnly({ id: 'view.panel.rig', category: 'View' }, withRig)).toBe(true);
    expect(isAnimationOnly('menu', 'Extras', withRig)).toBe(true);
  });
});

describe('which commands belong to it', () => {
  it('a panel, a tool, a whole category, a named command', () => {
    expect(commandIsAnimationOnly({ id: 'view.panel.lipsync', category: 'View' })).toBe(true);
    expect(commandIsAnimationOnly({ id: 'view.panel.draw-on', category: 'View' })).toBe(true);
    expect(commandIsAnimationOnly({ id: 'tools.motion-path', category: 'Tools' })).toBe(true);
    expect(commandIsAnimationOnly({ id: 'lipsync.auto', category: 'Lip sync' })).toBe(true);
    expect(commandIsAnimationOnly({ id: 'flow.open', category: 'Animate' })).toBe(true);
    expect(commandIsAnimationOnly({ id: 'view.panel.layers', category: 'View' })).toBe(false);
    expect(commandIsAnimationOnly({ id: 'tools.brush', category: 'Tools' })).toBe(false);
  });
  it('they are the offers kind, and the timeline ones keep theirs', () => {
    expect(animationKind({ id: 'view.panel.clip-flow', category: 'View' })).toBe('offers');
    expect(animationKind({ id: 'tools.record-move', category: 'Tools' })).toBe('offers');
    expect(animationKind({ id: 'view.panel.timeline', category: 'View' })).toBe('makes');
    expect(animationKind({ id: 'timeline.play', category: 'Timeline' })).toBe('needs');
  });
  it('an offered command is not greyed on a still, and has no greyed reason', () => {
    const s = still();
    for (const id of ['view.panel.lipsync', 'view.panel.draw-on', 'view.panel.clip-flow', 'tools.motion-path', 'tools.record-move', 'tools.shape-hints']) {
      expect(cmd(id), id).toBeTruthy();
      expect(gateReason(cmd(id), s.get()), id).toBeUndefined();
    }
    expect(gateEnabled({ id: 'tools.motion-path', category: 'Tools', enabled: (st) => st.doc.length > 1 }, s.get())).toBe(true);
    expect(commandEnabled(cmd('view.panel.lipsync'))).toBe(true);
    expect(gateReason(cmd('timeline.play'), s.get())).toBe(ADD_ANIMATION_FIRST);
  });
});

describe('choosing one on a still', () => {
  const offerOf = () => toasts.get().find((t) => t.message === offerWords(cmd('view.panel.draw-on').label));
  it('offers Add animation and changes nothing yet', () => {
    const s = still();
    toasts.set([]);
    expect(runCommand(cmd('view.panel.draw-on'))).toBe(true);
    const t = offerOf();
    expect(t?.action?.label).toBe('Add animation');
    expect(isAnimated(s.get().doc)).toBe(false);
  });
  it('the words say why and what happens next, with no em dash', () => {
    expect(offerWords('Draw on')).toMatch(/is for animations/);
    expect(offerWords('Draw on')).toMatch(/Add animation/);
    expect(offerWords('Draw on')).not.toMatch(/[–—]/);
  });
  it('pressing Add animation adds it, and then carries on to what was asked for', () => {
    const s = still();
    toasts.set([]);
    const run = vi.spyOn(cmd('tools.motion-path'), 'run');
    runCommand(cmd('tools.motion-path'));
    toasts.get().find((t) => t.message === offerWords(cmd('tools.motion-path').label))!.action!.run();
    expect(isAnimated(s.get().doc)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(s.get().ui.tool).toBe('motion-path');
  });
  it('on a drawing with animation it just runs', () => {
    const s = animated();
    toasts.set([]);
    runCommand(cmd('tools.shape-hints'));
    expect(s.get().ui.tool).toBe('shape-hints');
    expect(toasts.get()).toEqual([]);
  });
});

describe('the menus on a still', () => {
  const ids = () => resolveMenus().flatMap((m) => JSON.stringify(m.items).match(/"id":"[^"]+"/g) ?? []);
  it('leave out the Lip sync, Draw on and Clip flow entries and the motion tools, and keep the Rigging menu', () => {
    still();
    const all = ids().join(' ');
    expect(all).not.toMatch(/"id":"view\.panel\.(lipsync|draw-on|clip-flow)"/);
    expect(all).not.toMatch(/"id":"tools\.(motion-path|record-move|shape-hints)"/);
    expect(resolveMenus().some((m) => m.menu.title === 'Rigging')).toBe(true);
    expect(all).toMatch(/"id":"tools\.bone"/);
  });
  it('bring them back with animation', () => {
    animated();
    const all = ids().join(' ');
    expect(all).toMatch(/"id":"view\.panel\.lipsync"/);
    expect(all).toMatch(/"id":"tools\.motion-path"/);
  });
});

describe('the tool after animation goes away', () => {
  it('a tool that needs animation falls back to Select, and nothing else moves', () => {
    expect(toolForStill('motion-path', false)).toBe('select');
    expect(toolForStill('record-move', false)).toBe('select');
    expect(toolForStill('bone', false)).toBe('bone');
    expect(toolForStill('brush', false)).toBe('brush');
    expect(toolForStill('motion-path', true)).toBe('motion-path');
  });
  it('turning animation off, or undoing Add animation, switches the tool', () => {
    const s = animated();
    watchStillTool(s);
    s.setUi({ tool: 'motion-path' });
    expect(s.get().ui.tool).toBe('motion-path');
    s.update('Turn animation off', (d) => void (d.animated = false));
    expect(s.get().ui.tool).toBe('select');
    s.setUi({ tool: 'shape-hints' });
    s.undo();
    s.undo();
    expect(s.get().ui.tool).not.toBe('shape-hints');
  });
});

describe('the docked panels on a still', () => {
  const hide = new Set(['lipsync', 'draw-on']);
  const zone = (over: Partial<ZoneState> = {}): ZoneState => ({ tabs: ['tool-options', 'lipsync', 'colors'], active: 'lipsync', size: 300, collapsed: false, ...over });

  it('are left out of the tabs, the front one falls back to the first, and nothing is mutated', () => {
    const z = zone();
    const out = zoneWithout(z, hide);
    expect(out.tabs).toEqual(['tool-options', 'colors']);
    expect(out.active).toBe('tool-options');
    expect(z.tabs).toEqual(['tool-options', 'lipsync', 'colors']);
    expect(z.active).toBe('lipsync');
  });
  it('keeps the front one when it is not hidden, and returns the same zone when nothing is hidden', () => {
    expect(zoneWithout(zone({ active: 'colors' }), hide).active).toBe('colors');
    const plain = zone({ tabs: ['colors'], active: 'colors' });
    expect(zoneWithout(plain, hide)).toBe(plain);
  });
  it('a zone of nothing else holds nothing, so it leaves no gap', () => {
    const out = zoneWithout(zone({ tabs: ['lipsync', 'draw-on'], active: 'draw-on' }), hide);
    expect(out.tabs).toEqual([]);
    expect(out.active).toBeNull();
  });
  it('a stacked group left with nothing goes, and the others share its room', () => {
    const z = zone({ tabs: ['lipsync'], active: 'lipsync', more: [{ tabs: ['colors'], active: 'colors' }, { tabs: ['layers'], active: 'layers' }], shares: [0.5, 0.25, 0.25] });
    const out = zoneWithout(z, hide);
    expect(out.tabs).toEqual(['colors']);
    expect(out.more).toEqual([{ tabs: ['layers'], active: 'layers' }]);
    expect(out.shares).toEqual([0.5, 0.5]);
    const one = zoneWithout(zone({ tabs: ['lipsync'], active: 'lipsync', more: [{ tabs: ['colors'], active: 'colors' }], shares: [0.4, 0.6] }), hide);
    expect(one.more).toBeUndefined();
    expect(one.shares).toBeUndefined();
  });
  it('floating windows lose the panels, and a window with none left goes', () => {
    const f = (id: string, tabs: string[], active: string | null): FloatWin => ({ id, tabs, active, x: 0, y: 0, w: 300, h: 300 });
    const floats = [f('a', ['lipsync'], 'lipsync'), f('b', ['lipsync', 'colors'], 'lipsync'), f('c', ['colors'], 'colors')];
    const out = floatsWithout(floats, hide);
    expect(out.map((x) => x.id)).toEqual(['b', 'c']);
    expect(out[0].tabs).toEqual(['colors']);
    expect(out[0].active).toBe('colors');
    expect(out[1]).toBe(floats[2]);
    expect(floatsWithout([floats[2]], hide)).toEqual([floats[2]]);
  });
});

describe('nothing is lost', () => {
  it('every command of it is in the palette and has help or a description', () => {
    const family = allCommands().filter((c) => !c.hidden && commandIsAnimationOnly(c));
    expect(family.length).toBeGreaterThan(6);
    for (const c of family) expect(c.description || c.help, c.id).toBeTruthy();
  });
  it('turning animation off and on again leaves the layout as it was', async () => {
    const { dock } = await import('../../src/ui/dock');
    const before = JSON.stringify(dock.get().layout);
    const s = animated();
    s.update('Turn animation off', (d) => void (d.animated = false));
    s.update('Add animation', (d) => void (d.animated = true));
    expect(JSON.stringify(dock.get().layout)).toBe(before);
  });
});
