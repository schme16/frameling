// @vitest-environment jsdom
// Second review of the dock: edge cases a seeded random run found or that it points at.
import { beforeEach, describe, expect, it } from 'vitest';
import { getPanel, registerPanel, unregisterPanel } from '../../src/core/registry';
import * as D from '../../src/ui/dock';
import { emptyLayout, locate, MIN_SHARE, normaliseLayout, sharesOf, splitGroupsAt, type Layout } from '../../src/ui/dockModel';

const Nothing = () => null;

describe('stacked groups: a share is never nothing', () => {
  it('moving a line between two small groups leaves both with room', () => {
    const l = emptyLayout();
    l.zones.right = { tabs: ['a'], active: 'a', size: 300, collapsed: false, more: [{ tabs: ['b'], active: 'b' }, { tabs: ['c'], active: 'c' }], shares: [0.06, 0.06, 0.88] };
    for (const first of [0, 0.01, 0.06, 0.5, 1]) {
      const n = splitGroupsAt(l, 'right', 0, first);
      const sh = sharesOf(n.zones.right);
      expect(sh.every((v) => v > 0), `first=${first}: ${JSON.stringify(n.zones.right.shares)}`).toBe(true);
      expect(sh.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
    // Plenty of room: the old rule still holds.
    const big = emptyLayout();
    big.zones.right = { tabs: ['a'], active: 'a', size: 300, collapsed: false, more: [{ tabs: ['b'], active: 'b' }], shares: [0.5, 0.5] };
    expect(splitGroupsAt(big, 'right', 0, 0.01).zones.right.shares).toEqual([MIN_SHARE, 1 - MIN_SHARE]);
  });
});

describe('many floating windows', () => {
  const ids = Array.from({ length: 16 }, (_, i) => `many${i}`);
  beforeEach(() => {
    localStorage.clear();
    for (const id of ids) if (!getPanel(id)) registerPanel({ id, title: id, zone: 'right', icon: 'plus', component: Nothing });
    D.resetDock();
    D.syncPanels();
  });

  it('keeps every panel somewhere (a window, a zone, or closed) after more than twelve were floated', () => {
    for (const id of ids) D.floatPanel(id);
    D.syncPanels();
    const l: Layout = D.dock.get().layout;
    // Never more windows than a saved layout can hold: the rest of the panels share the last one.
    expect(l.floats.length).toBeLessThanOrEqual(12);
    expect(l.floats.flatMap((f) => f.tabs)).toHaveLength(16);
    for (const id of ids) {
      const at = locate(l, id);
      expect(at !== null || l.hidden.includes(id), `${id} is nowhere`).toBe(true);
    }
    // And a save and load keeps them too.
    const back = D.reconcile(normaliseLayout(JSON.parse(JSON.stringify(l))));
    for (const id of ids) expect(locate(back, id) !== null || back.hidden.includes(id), `${id} is nowhere after a reload`).toBe(true);
    for (const id of ids) unregisterPanel(id);
  });
});
