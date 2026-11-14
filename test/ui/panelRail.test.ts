// @vitest-environment jsdom
// What the right rail STARTS as: Clip flow and Draw on put away, Library at the end. And that none of it reaches into a
// layout somebody already has, or an old workspace file.
import { beforeEach, describe, expect, it } from 'vitest';
import { allPanels, getCommand, getPanel } from '../../src/core/registry';
import { builtinWorkspaces, dock, normaliseLayout, placedIds, reconcile, resetDock, resetLayout, showPanel, togglePanel, zoneOf, isVisible, type Layout } from '../../src/ui/dock';
import { parseWorkspaceText, workspaceToText } from '../../src/ui/workspaceFile';
import { planRight } from '../../src/ui/panelInfo';
import '../../src/renderer/features';

const AWAY = ['clip-flow', 'draw-on'];
beforeEach(() => resetDock());

/** A layout as it was saved before this change: Library third on the rail, Clip flow and Draw on placed, every panel known. */
function oldLayout(): Layout {
  const l = normaliseLayout({});
  l.zones.right.tabs = ['tool-options', 'colors', 'library', 'draw-on', 'clip-flow', 'layers', 'artboards', 'preview', 'quests', 'help'];
  l.zones.right.active = 'library';
  l.zones.bottom.tabs = ['timeline'];
  l.known = allPanels().map((p) => p.id);
  return l;
}

describe('the starting rail', () => {
  it('Clip flow and Draw on start put away in all three built-in workspaces, and are still real panels', () => {
    for (const w of builtinWorkspaces()) {
      for (const id of AWAY) {
        expect(w.layout.hidden, `${w.name} hides ${id}`).toContain(id);
        expect(placedIds(w.layout), `${w.name} does not place ${id}`).not.toContain(id);
        expect(w.layout.known, `${w.name} knows ${id}`).toContain(id);
      }
      // Nothing else on the rail was put away for them.
      expect(w.layout.zones.right.tabs).toEqual(expect.arrayContaining(['layers', 'artboards', 'library']));
    }
    for (const id of AWAY) expect(getPanel(id)?.startsAway).toBe(true);
  });

  it('only those two start away', () => {
    expect(allPanels().filter((p) => p.startsAway).map((p) => p.id).sort()).toEqual(AWAY);
  });

  it('Library is at the end of the new rail, after the built-in panels and before plugin panels (95)', () => {
    const lib = getPanel('library')!;
    expect(lib.order).toBe(92);
    // Its number lands on nothing else, so no other panel was moved by it.
    expect(allPanels().filter((p) => p.order === 92).map((p) => p.id)).toEqual(['library']);
    for (const p of allPanels()) if (p.id !== 'library' && (p.order ?? 50) < 95) expect(p.order ?? 50, p.id).toBeLessThan(92);
    const draw = builtinWorkspaces()[0].layout;
    const plan = planRight([{ tabs: draw.zones.right.tabs, active: null }], true, draw.railAt)[0];
    const lastGroup = plan.places[plan.places.length - 1];
    expect(lastGroup.group).toBe('more');
    expect(lastGroup.ids[lastGroup.ids.length - 1]).toBe('library');
    // Nothing is after it, and Layers and Artboards no longer sit behind it.
    expect(plan.places.flatMap((g) => g.ids).pop()).toBe('library');
    expect(plan.places.find((g) => g.group === 'make')?.ids).toEqual(['layers', 'artboards']);
  });

  it('a plugin panel that registers later still lands after Library', () => {
    const draw = builtinWorkspaces()[0].layout;
    const withPlugin: Layout = { ...draw, zones: { ...draw.zones, right: { ...draw.zones.right, tabs: [...draw.zones.right.tabs, 'plugin.x.p'] } } };
    const plan = planRight([{ tabs: withPlugin.zones.right.tabs, active: null }], true, withPlugin.railAt)[0];
    const more = plan.places.find((g) => g.group === 'more')!.ids;
    expect(more.indexOf('library')).toBeLessThan(more.indexOf('plugin.x.p'));
  });
});

describe('a layout somebody already has is left alone', () => {
  it('reconcile keeps every tab where it is, Clip flow and Draw on on the rail, Library in its old place', () => {
    const before = oldLayout();
    const after = reconcile(before);
    expect(after.zones.right.tabs).toEqual(before.zones.right.tabs);
    expect(after.hidden).toEqual([]);
    expect(after.railAt).toBeUndefined();
    expect(JSON.stringify(after.zones)).toBe(JSON.stringify(normaliseLayout(before).zones));
  });

  it('its rail still has Library first among the Make panels, as it was', () => {
    const l = reconcile(oldLayout());
    const plan = planRight([{ tabs: l.zones.right.tabs, active: null }], true, l.railAt)[0];
    expect(plan.places.find((g) => g.group === 'make')?.ids).toEqual(['library', 'layers', 'artboards']);
    expect(plan.places.find((g) => g.group === 'animate')?.ids).toEqual(expect.arrayContaining(['draw-on', 'clip-flow']));
  });

  it('a panel the person closed stays closed, and one they moved to a window stays there', () => {
    const l = oldLayout();
    l.zones.right.tabs = l.zones.right.tabs.filter((t) => t !== 'clip-flow');
    l.hidden = ['clip-flow'];
    const after = reconcile(l);
    expect(after.hidden).toEqual(['clip-flow']);
    expect(placedIds(after)).not.toContain('clip-flow');
  });

  it('a layout that never met Clip flow puts it away rather than onto the rail, and moves nothing else', () => {
    const l = oldLayout();
    l.zones.right.tabs = l.zones.right.tabs.filter((t) => t !== 'clip-flow' && t !== 'draw-on');
    l.known = l.known.filter((k) => !AWAY.includes(k));
    const rest = [...l.zones.right.tabs];
    const after = reconcile(l);
    expect(after.zones.right.tabs).toEqual(rest);
    expect(after.hidden.sort()).toEqual(AWAY);
    expect(after.known).toEqual(expect.arrayContaining(AWAY));
    // Met once, so a second pass changes nothing.
    expect(reconcile(after)).toEqual(after);
  });

  it('an old workspace file opens with its own arrangement', () => {
    const old = oldLayout();
    const text = workspaceToText({ id: 'mine', name: 'Mine', layout: old });
    expect(text).not.toContain('railAt');
    const r = parseWorkspaceText(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.workspace.layout.railAt).toBeUndefined();
    const l = reconcile(r.workspace.layout);
    expect(l.zones.right.tabs).toEqual(old.zones.right.tabs);
    expect(l.hidden).toEqual([]);
  });

  it('a new layout that is saved and read back keeps where its rail put Library', () => {
    const fresh = builtinWorkspaces()[0].layout;
    expect(fresh.railAt).toEqual({ library: 'more' });
    const r = parseWorkspaceText(workspaceToText({ id: 'mine', name: 'Mine', layout: fresh }));
    expect(r.ok && r.workspace.layout.railAt).toEqual({ library: 'more' });
    expect(normaliseLayout({ railAt: { library: 'nowhere', 'bad id!': 'more', help: 'learn' } }).railAt).toEqual({ help: 'learn' });
  });

  it('putting the layout back to how the workspace started is the one way to the new rail', () => {
    dock.set((s) => ({ ...s, layout: oldLayout() }));
    expect(dock.get().layout.railAt).toBeUndefined();
    resetLayout();
    expect(dock.get().layout.hidden).toEqual(expect.arrayContaining(AWAY));
    expect(dock.get().layout.railAt).toEqual({ library: 'more' });
  });
});

describe('opening a panel that is put away', () => {
  it('showPanel brings Clip flow and Draw on in from away, in front, and they leave the closed list', () => {
    for (const id of AWAY) {
      expect(isVisible(id)).toBe(false);
      expect(dock.get().layout.hidden).toContain(id);
      showPanel(id);
      expect(isVisible(id), id).toBe(true);
      expect(zoneOf(id)).toBe('right');
      expect(dock.get().layout.zones.right.active).toBe(id);
      expect(dock.get().layout.hidden).not.toContain(id);
    }
  });

  it('the Clip flow command in the palette and menus does it', () => {
    expect(isVisible('clip-flow')).toBe(false);
    getCommand('flow.open')!.run();
    expect(isVisible('clip-flow')).toBe(true);
    expect(dock.get().layout.zones.right.active).toBe('clip-flow');
  });

  it('togglePanel opens it from away too, and closes it again', () => {
    togglePanel('draw-on');
    expect(isVisible('draw-on')).toBe(true);
    togglePanel('draw-on');
    expect(isVisible('draw-on')).toBe(false);
    expect(dock.get().layout.hidden).toContain('draw-on');
  });
});
