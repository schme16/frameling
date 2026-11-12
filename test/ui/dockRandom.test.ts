// @vitest-environment jsdom
// The dock under random use (seeded): moves, splits, joins, floats, closing and opening, workspaces saved, applied, shared and
// deleted, features turned off and on. After every step the layout must hold together: every panel in exactly one place or
// closed, no empty groups or windows, shares that add up, and what is saved reads back the same.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPanel, registerPanel, unregisterPanel } from '../../src/core/registry';
import * as D from '../../src/ui/dock';
import { sanitizeGroups } from '../../src/ui/toolArrange';
import { groupsOf, MAX_GROUPS, normaliseLayout, ZONES, type DropTarget, type Layout } from '../../src/ui/dockModel';

const Nothing = () => null;
const IDS = ['timeline', 'layers', 'colours', 'help', 'tool-options', 'library', 'preview', 'slices', 'camera', 'rig', 'text', 'particles', ...Array.from({ length: 10 }, (_, i) => `plugin.p.x${i}`)];
const ZONE_OF: Record<string, 'left' | 'right' | 'bottom' | 'top'> = { timeline: 'bottom', layers: 'right', colours: 'right', help: 'right', 'tool-options': 'right', library: 'left', preview: 'right', slices: 'right', camera: 'left', rig: 'left', text: 'right', particles: 'top' };
IDS.forEach((id, i) => (ZONE_OF[id] ??= (['left', 'right', 'bottom', 'top'] as const)[i % 4]));
const def = (id: string) => ({ id, title: id, zone: ZONE_OF[id], order: IDS.indexOf(id), icon: 'plus', component: Nothing });

beforeAll(() => {
  for (const id of IDS) registerPanel(def(id));
});
beforeEach(() => {
  for (const id of IDS) if (!getPanel(id)) registerPanel(def(id));
  localStorage.clear();
  D.resetDock();
});

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const L = (): Layout => D.dock.get().layout;
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, k === 'shares' && Array.isArray(x) ? x.map((n) => Math.round(n * 1e6) / 1e6) : canon(x)])) : v);
const near = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/** Everything that must be true of a layout, with a message that says which. */
function check(l: Layout, registered: string[], where: string): void {
  const places = new Map<string, string[]>();
  const put = (id: string, at: string) => places.set(id, [...(places.get(id) ?? []), at]);
  for (const z of ZONES) {
    const zs = l.zones[z];
    const gs = groupsOf(zs);
    expect(gs.length, `${where}: ${z} has too many groups`).toBeLessThanOrEqual(MAX_GROUPS);
    gs.forEach((g, i) => {
      if (gs.length > 1 || g.tabs.length) expect(g.tabs.length, `${where}: empty group ${i} in ${z}`).toBeGreaterThan(0);
      expect(g.active === null ? g.tabs.length === 0 : g.tabs.includes(g.active), `${where}: ${z} group ${i} front tab is not in the group`).toBe(true);
      g.tabs.forEach((t) => put(t, `${z}#${i}`));
    });
    if (zs.more) {
      expect(zs.shares?.length, `${where}: ${z} shares do not match groups`).toBe(gs.length);
      expect(zs.shares!.reduce((a, b) => a + b, 0), `${where}: ${z} shares`).toBeCloseTo(1, 6);
      expect(zs.shares!.every((s) => s > 0), `${where}: ${z} share not above zero ${JSON.stringify(zs.shares)}`).toBe(true);
    } else expect(zs.shares, `${where}: ${z} has shares but one group`).toBeUndefined();
  }
  const ids = new Set<string>();
  for (const f of l.floats) {
    expect(f.tabs.length, `${where}: empty window ${f.id}`).toBeGreaterThan(0);
    expect(f.active !== null && f.tabs.includes(f.active), `${where}: window front tab`).toBe(true);
    expect(ids.has(f.id), `${where}: repeated window id`).toBe(false);
    ids.add(f.id);
    f.tabs.forEach((t) => put(t, `float:${f.id}`));
  }
  l.hidden.forEach((t) => put(t, 'hidden'));
  for (const id of registered) expect(places.get(id) ?? [], `${where}: ${id} is in ${JSON.stringify(places.get(id) ?? [])}`).toHaveLength(1);
  for (const [id, at] of places) {
    expect(registered.includes(id), `${where}: ${id} is in the layout but not registered (${at})`).toBe(true);
    expect(at.length, `${where}: ${id} in several places ${at}`).toBe(1);
  }
}

describe('the dock under random use (seeded)', () => {
  for (let seed = 1; seed <= 60; seed++) {
    it(`seed ${seed}`, () => {
      const r = rng(seed * 104729);
      const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
      const registered = () => IDS.filter((id) => getPanel(id));
      const log: string[] = [];
      const target = (): DropTarget => {
        const k = r();
        if (k < 0.45) return { zone: pick(ZONES), ...(r() < 0.5 ? { index: Math.floor(r() * 5) } : {}), ...(r() < 0.5 ? { group: Math.floor(r() * 4) } : {}), ...(r() < 0.4 ? { split: pick(['before', 'after'] as const) } : {}) };
        if (k < 0.7 && L().floats.length) return { float: pick(L().floats).id, ...(r() < 0.5 ? { index: Math.floor(r() * 4) } : {}) };
        if (k < 0.75) return { float: 'gone-window' };
        return { newFloat: { x: Math.floor(r() * 1400), y: Math.floor(r() * 900) } };
      };
      for (let step = 0; step < 90; step++) {
        const id = pick(IDS);
        const op = pick(['place', 'place', 'place', 'move', 'float', 'floatTo', 'dockBack', 'dockAll', 'closeFloat', 'hide', 'show', 'toggle', 'active', 'stack', 'join', 'joinAll', 'split', 'collapse', 'rename', 'save', 'apply', 'apply', 'delete', 'share', 'reset', 'featureOff', 'late', 'floatMany', 'rail', 'rail', 'railReset']);
        log.push(`${op}(${id})`);
        const f = L().floats.length ? pick(L().floats) : null;
        const zone = pick(ZONES);
        switch (op) {
          case 'place': if (getPanel(id)) D.placePanel(id, target()); break;
          case 'move': if (getPanel(id)) D.movePanel(id, zone, Math.floor(r() * 5)); break;
          case 'float': if (getPanel(id)) D.floatPanel(id); break;
          case 'floatMany': for (const x of IDS.slice(0, 14)) if (getPanel(x)) D.floatPanel(x); break;
          case 'floatTo': if (f) D.moveFloatTo(f.id, target()); break;
          case 'dockBack': if (f) D.dockFloatBack(f.id); break;
          case 'dockAll': D.dockEverythingBack(); break;
          case 'closeFloat': if (f) D.closeFloatWindow(f.id); break;
          case 'hide': D.hidePanel(id); break;
          case 'show': D.showPanel(id); break;
          case 'toggle': D.togglePanel(id); break;
          case 'active': D.setActive(zone, id); if (f) D.setFloatActive(f.id, pick(f.tabs)); break;
          case 'stack': D.stackPanelsIn(id, pick(IDS), zone, r()); break;
          case 'join': D.joinGroup(zone, 1 + Math.floor(r() * 3)); break;
          case 'joinAll': D.joinGroups(zone); break;
          case 'split': D.setGroupSplit(zone, Math.floor(r() * 3), r()); D.nudgeGroupSplit(zone, Math.floor(r() * 3), r() - 0.5); D.evenGroupSplit(zone, Math.floor(r() * 3)); break;
          case 'collapse': D.toggleCollapsed(zone); break;
          case 'rename': D.renamePanel(id, pick(['', 'Mine', 'x'.repeat(60)])); if (f) D.renameFloat(f.id, pick(['', 'Box'])); break;
          case 'save': D.saveWorkspace(pick(['A', 'B', 'C', 'A', 'D'])); break;
          case 'apply': D.applyWorkspace(pick(D.listWorkspaces()).id); break;
          case 'delete': { const u = D.dock.get().user; if (u.length) D.deleteWorkspace(pick(u).id); break; }
          case 'reset': D.resetLayout(); break;
          case 'rail': D.setToolGroups(pick([undefined, [{ id: 'mine', name: 'Mine', tools: ['pencil', 'brush'] }, { id: 'more', tools: ['eraser'] }], [{ id: 'one', tools: ['fill'] }]])); break;
          case 'railReset': D.resetToolGroups(); break;
          case 'share': {
            const ws = pick(D.listWorkspaces());
            const text = D.workspaceText(ws.id)!;
            const res = D.importWorkspace(text);
            if (res.ok) {
              // What comes back is what went out: the layout tidied against the panels there are.
              expect(near(res.workspace.layout, normaliseLayout(JSON.parse(text).layout)), `share ${ws.name}`).toBe(true);
              // Its tool rail comes along: the person's own for it, or the one it brings.
              const rail = D.dock.get().rails?.[ws.id] ?? ws.rail;
              expect(canon(res.workspace.rail), `share ${ws.name} rail`).toEqual(canon(rail ? sanitizeGroups(rail, true) : undefined));
              D.deleteWorkspace(res.workspace.id);
            }
            break;
          }
          case 'featureOff': {
            // A feature turned off and on again: the panel leaves and comes back to its place (or stays closed if it was).
            const p = getPanel(id);
            if (!p) break;
            const before = D.placeOf(id);
            const wasHidden = L().hidden.includes(id);
            D.parkPanels([id]);
            unregisterPanel(id);
            D.syncPanels();
            check(L(), registered(), `${log.join(' ')} [while off]`);
            registerPanel(p);
            D.replacePanels([id]);
            const after = D.placeOf(id);
            expect(wasHidden === L().hidden.includes(id), `${log.join(' ')}: closed panel ${id} came back open or the other way`).toBe(true);
            if (before && after) expect('zone' in before ? 'zone' in after && after.zone === before.zone : 'float' in after, `${log.join(' ')}: ${id} came back somewhere else`).toBe(true);
            break;
          }
          case 'late': {
            // A panel that is not registered yet, arriving (and going again).
            if (!getPanel(id)) {
              registerPanel(def(id));
              D.syncPanels();
            }
            break;
          }
        }
        const where = `step ${step}: ${log.join(' ')}`;
        check(L(), registered(), where);
        // Saved as written: what the store holds reads back the same, and tidying it again changes nothing.
        // Rails belong to workspaces that exist, and the open workspace is one of them.
        const known = D.listWorkspaces().map((w) => w.id);
        expect(known.includes(D.dock.get().workspaceId), `${where}: open workspace ${D.dock.get().workspaceId} does not exist`).toBe(true);
        for (const id of Object.keys(D.dock.get().rails ?? {})) expect(known.includes(id), `${where}: a rail for ${id}, which is gone`).toBe(true);
        const saved = JSON.parse(localStorage.getItem(D.DOCK_KEY) ?? 'null');
        if (saved) expect(canon(normaliseLayout(saved.layout)), `${where} (saved copy)`).toEqual(canon(L()));
        expect(canon(D.reconcile(L())), `${where} (reconcile changes it)`).toEqual(canon(L()));
      }
    });
  }
});
