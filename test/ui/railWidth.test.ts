// @vitest-environment jsdom
// The tool rail's width. First the older saves (written before the width existed) must keep loading and saving back
// exactly as they were; then the width is checked: its limits, how many buttons fit across, what it takes to fit the
// group names, and that it is kept per workspace, in a saved workspace and its file.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCK_KEY } from '../../src/ui/dock';
import { emptyLayout } from '../../src/ui/dockModel';
import type { ToolGroup } from '../../src/ui/toolArrange';
import { parseWorkspaceText, WORKSPACE_FORMAT, WORKSPACE_VERSION } from '../../src/ui/workspaceFile';

const OLD_RAILS: Record<string, ToolGroup[]> = {
  draw: [
    { id: 'draw', tools: ['pencil', 'brush', 'eraser', 'fill'] },
    { id: 'shapes', name: 'Blocking', tools: ['line', 'rect'] },
  ],
};
const oldDockSave = () => JSON.stringify({ layout: emptyLayout(), workspaceId: 'draw', user: [], rails: OLD_RAILS, v: 2 });

async function loadDock() {
  vi.resetModules();
  await import('../../src/renderer/features');
  return import('../../src/ui/dock');
}

beforeEach(() => localStorage.clear());

describe('a save from before the rail had a width', () => {
  it('loads as it was, with no width', async () => {
    localStorage.setItem(DOCK_KEY, oldDockSave());
    const d = await loadDock();
    expect(d.dock.get().rails).toEqual(OLD_RAILS);
    expect(Object.keys(d.dock.get()).sort()).toEqual(['layout', 'rails', 'user', 'workspaceId']);
  });

  it('is written back the same when something else changes', async () => {
    localStorage.setItem(DOCK_KEY, oldDockSave());
    const d = await loadDock();
    d.placeTools('right');
    const saved = JSON.parse(localStorage.getItem(DOCK_KEY)!);
    expect(saved.rails).toEqual(OLD_RAILS);
    expect('railWidths' in saved).toBe(false);
  });

  it('a workspace you saved then still comes back the same through its file', async () => {
    localStorage.setItem(DOCK_KEY, oldDockSave());
    const d = await loadDock();
    const ws = d.saveWorkspace('Old')!;
    expect(ws.railWidth).toBeUndefined();
    const text = JSON.parse(d.workspaceText(ws.id)!);
    expect(text.version).toBe(1);
    expect('railWidth' in text).toBe(false);
    const r = d.importWorkspace(JSON.stringify(text));
    expect(r.ok && r.workspace.railWidth).toBeUndefined();
    expect(r.ok && r.workspace.rail).toEqual(OLD_RAILS.draw);
  });

  it('an old workspace file reads as it did', () => {
    const r = parseWorkspaceText(JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, name: 'Mine', layout: emptyLayout(), rail: OLD_RAILS.draw }));
    expect(r.ok && r.workspace.rail).toEqual(OLD_RAILS.draw);
    expect(r.ok && r.workspace.railWidth).toBeUndefined();
    expect(WORKSPACE_VERSION).toBe(1);
  });
});

// ---------------------------------------------------------------- the width itself

import { readFileSync } from 'node:fs';
import { acrossFor, buttonsAcross, chosenRailWidth, cleanRailWidth, clampRailWidth, columnStep, fitRailWidth, minRailWidth, naturalRailWidth, railSizes, railWidthNow, RAIL_MAX, type RailSizes } from '../../src/ui/toolRailWidth';
import { sanitizeWorkspace } from '../../src/ui/dockModel';

const cosy = railSizes('cosy', 'medium');
const sizesList = (['cosy', 'crisp'] as const).flatMap((l) => (['small', 'medium', 'large'] as const).map((s): [string, RailSizes] => [`${l} ${s}`, railSizes(l, s)]));

describe('the limits', () => {
  it('the narrowest is one button across, and the widest is room for the longest usual group name', () => {
    expect(minRailWidth(cosy)).toBe(50);
    expect(RAIL_MAX).toBe(280);
    // "Colour and pixel extras" measured on screen: 172px with its room, 196px while changing (a fold arrow beside it).
    expect(RAIL_MAX).toBeGreaterThanOrEqual(196 * 1.4);
  });
  it('holds a width to them, in whole pixels', () => {
    expect(clampRailWidth(10, cosy)).toBe(50);
    expect(clampRailWidth(999, cosy)).toBe(280);
    expect(clampRailWidth(120.6, cosy)).toBe(121);
    expect(clampRailWidth(NaN, cosy)).toBe(50);
    expect(clampRailWidth(Infinity, cosy)).toBe(50);
  });
  it('the narrowest is never wider than the natural width, in any size or look', () => {
    for (const [, s] of sizesList) {
      expect(minRailWidth(s)).toBeLessThanOrEqual(naturalRailWidth(s, 'two'));
      expect(minRailWidth(s)).toBe(naturalRailWidth(s, 'stacked'));
      expect(RAIL_MAX).toBeGreaterThan(naturalRailWidth(s, 'two'));
    }
  });
});

describe('the natural width is what the rail already was', () => {
  it('two across is 94px and one per group is 50px in the cosy look at the middle size', () => {
    expect(naturalRailWidth(cosy, 'two')).toBe(94);
    expect(naturalRailWidth(cosy, 'stacked')).toBe(50);
  });
  it('the sizes agree with the rail\'s CSS', () => {
    const css = readFileSync('src/ui/ui.css', 'utf8');
    const rule = (sel: string) => {
      const m = css.match(new RegExp(`${sel.replace(/[.[\]]/g, '\\$&')} \\{([^}]*)\\}`));
      return m ? m[1] : '';
    };
    const px = (body: string, v: string) => Number(body.match(new RegExp(`${v}: (\\d+)px`))?.[1]);
    const cases: [string, string, RailSizes][] = [
      ['.ui-tools', 'cosy medium', railSizes('cosy', 'medium')],
      [".ui-tools.is-size-small", 'cosy small', railSizes('cosy', 'small')],
      [".ui-tools.is-size-large", 'cosy large', railSizes('cosy', 'large')],
      [":root[data-look='crisp'] .ui-tools", 'crisp medium', railSizes('crisp', 'medium')],
      [":root[data-look='crisp'] .ui-tools.is-size-small", 'crisp small', railSizes('crisp', 'small')],
      [":root[data-look='crisp'] .ui-tools.is-size-large", 'crisp large', railSizes('crisp', 'large')],
    ];
    for (const [sel, name, s] of cases) {
      const body = rule(sel);
      expect(px(body, '--tool'), `${name} --tool`).toBe(s.tool);
      expect(px(body, '--tool-pad'), `${name} --tool-pad`).toBe(s.pad);
    }
  });
});

describe('how many buttons fit across', () => {
  it('two at the natural width, then one more for every button of width', () => {
    expect(buttonsAcross(94, cosy)).toBe(2);
    expect(buttonsAcross(94 + columnStep(cosy) - 1, cosy)).toBe(2);
    expect(buttonsAcross(94 + columnStep(cosy), cosy)).toBe(3);
    expect(buttonsAcross(94 + columnStep(cosy) * 2, cosy)).toBe(4);
  });
  it('is one at the narrowest, and never less than one', () => {
    expect(buttonsAcross(minRailWidth(cosy), cosy)).toBe(1);
    expect(buttonsAcross(0, cosy)).toBe(1);
    expect(buttonsAcross(-50, cosy)).toBe(1);
    expect(buttonsAcross(NaN, cosy)).toBe(1);
  });
  it('whatever it fits, the buttons are never wider than the rail', () => {
    for (const [name, s] of sizesList) {
      for (let w = minRailWidth(s); w <= RAIL_MAX; w += 3) {
        const n = buttonsAcross(w, s);
        // The group's own room: its padding, and the rail's edge margin, are what pad minus a gap leaves.
        expect(n * s.tool + (n - 1) * s.gap, `${name} at ${w}`).toBeLessThanOrEqual(w);
      }
    }
  });
  it('widens in step: more width never gives fewer across', () => {
    for (const [, s] of sizesList) {
      let last = 0;
      for (let w = 0; w <= 400; w++) {
        const n = buttonsAcross(w, s);
        expect(n).toBeGreaterThanOrEqual(last);
        last = n;
      }
    }
  });
  it('the one-per-group style is one across at any width', () => {
    expect(acrossFor(280, cosy, 'stacked')).toBe(1);
    expect(acrossFor(280, cosy, 'two')).toBe(6);
  });
});

describe('fitting the group names', () => {
  it('takes the room the widest name wants', () => {
    expect(fitRailWidth(190.2, cosy, 'two')).toBe(191);
  });
  it('is never narrower than the natural width, and never past the widest', () => {
    expect(fitRailWidth(40, cosy, 'two')).toBe(94);
    expect(fitRailWidth(40, cosy, 'stacked')).toBe(50);
    expect(fitRailWidth(900, cosy, 'two')).toBe(280);
    expect(fitRailWidth(NaN, cosy, 'two')).toBe(94);
  });
});

describe('what is kept as a width', () => {
  it('the natural width is kept as no width, so the rail goes on following its style and size', () => {
    expect(chosenRailWidth(94, cosy, 'two')).toBeUndefined();
    expect(chosenRailWidth(50, cosy, 'stacked')).toBeUndefined();
    expect(chosenRailWidth(94, cosy, 'stacked')).toBe(94);
    expect(chosenRailWidth(200, cosy, 'two')).toBe(200);
    expect(chosenRailWidth(5000, cosy, 'two')).toBe(280);
  });
  it('a width of nothing is the natural one', () => {
    expect(railWidthNow(undefined, cosy, 'two')).toBe(94);
    expect(railWidthNow(undefined, cosy, 'stacked')).toBe(50);
    expect(railWidthNow(200, cosy, 'two')).toBe(200);
    expect(railWidthNow(9, cosy, 'two')).toBe(50);
  });
  it('a width from outside is made safe', () => {
    expect(cleanRailWidth(200)).toBe(200);
    expect(cleanRailWidth(200.4)).toBe(200);
    expect(cleanRailWidth(5000)).toBe(280);
    for (const bad of [0, 5, -40, NaN, Infinity, '200', null, undefined, {}, [], true]) expect(cleanRailWidth(bad)).toBeUndefined();
  });
});

describe('the width is kept per workspace', () => {
  it('is saved and comes back after a restart', async () => {
    const d = await loadDock();
    d.setRailWidth(210);
    expect(d.railWidthOf(d.dock.get())).toBe(210);
    const d2 = await loadDock();
    expect(d2.railWidthOf(d2.dock.get())).toBe(210);
  });
  it('each workspace has its own, and the others stay as they were', async () => {
    const d = await loadDock();
    d.setRailWidth(210);
    d.applyWorkspace('animate');
    expect(d.railWidthOf(d.dock.get())).toBeUndefined();
    d.setRailWidth(150);
    d.applyWorkspace('draw');
    expect(d.railWidthOf(d.dock.get())).toBe(210);
    expect(d.dock.get().railWidths).toEqual({ draw: 210, animate: 150 });
  });
  it('setting nothing takes it away, and the dock save has no width left in it', async () => {
    const d = await loadDock();
    d.setRailWidth(210);
    d.setRailWidth(undefined);
    expect(d.dock.get().railWidths).toBeUndefined();
    expect('railWidths' in JSON.parse(localStorage.getItem(DOCK_KEY)!)).toBe(false);
  });
  it('while it is being pulled it is not written, until it lets go', async () => {
    const d = await loadDock();
    d.setRailWidth(120, false);
    d.setRailWidth(160, false);
    expect(d.railWidthOf(d.dock.get())).toBe(160);
    expect(localStorage.getItem(DOCK_KEY)).toBeNull();
    d.flushDock();
    expect(JSON.parse(localStorage.getItem(DOCK_KEY)!).railWidths).toEqual({ draw: 160 });
  });
  it('bad widths in a save are dropped and good ones kept', async () => {
    localStorage.setItem(DOCK_KEY, JSON.stringify({ layout: emptyLayout(), workspaceId: 'draw', user: [], v: 2, railWidths: { draw: 200, animate: 'wide', pixel: -3, __proto__: 150, 'bad id!': 100 } }));
    const d = await loadDock();
    expect(d.dock.get().railWidths).toEqual({ draw: 200 });
  });
  it('a save with railWidths that is not a map is ignored', async () => {
    localStorage.setItem(DOCK_KEY, JSON.stringify({ layout: emptyLayout(), workspaceId: 'draw', user: [], v: 2, railWidths: [200] }));
    const d = await loadDock();
    expect(d.dock.get().railWidths).toBeUndefined();
  });
});

describe('a saved workspace and its file carry the width', () => {
  it('saving the workspace keeps the width as its default; pulling again changes only your copy', async () => {
    const d = await loadDock();
    d.setRailWidth(200);
    const ws = d.saveWorkspace('Wide')!;
    expect(ws.railWidth).toBe(200);
    // Draw keeps what you pulled there; the new workspace starts from the saved width with nothing of its own on top.
    expect(d.dock.get().railWidths).toEqual({ draw: 200 });
    expect(d.railWidthOf(d.dock.get())).toBe(200);
    d.setRailWidth(120);
    expect(d.railWidthOf(d.dock.get())).toBe(120);
    // Reset layout goes back to what it was saved with.
    d.resetLayout();
    expect(d.railWidthOf(d.dock.get())).toBe(200);
  });
  it('going back to the natural width in a workspace that brings a width is kept, not lost', async () => {
    const d = await loadDock();
    d.setRailWidth(200);
    d.saveWorkspace('Wide');
    const { setToolRailWidth } = await import('../../src/ui/toolRail');
    setToolRailWidth(94);
    expect(d.railWidthOf(d.dock.get())).toBe(94);
    d.setRailWidth(undefined);
    expect(d.railWidthOf(d.dock.get())).toBe(200);
  });
  it('the file has the width, stays at version 1, and imports with it', async () => {
    const d = await loadDock();
    d.setRailWidth(200);
    const ws = d.saveWorkspace('Wide')!;
    const text = JSON.parse(d.workspaceText(ws.id)!);
    expect(text.version).toBe(1);
    expect(text.railWidth).toBe(200);
    const r = d.importWorkspace(JSON.stringify(text));
    expect(r.ok && r.workspace.railWidth).toBe(200);
  });
  it('the layout as it is now goes out with the width you pulled it to', async () => {
    const d = await loadDock();
    d.setRailWidth(170);
    expect(JSON.parse(d.workspaceText()!).railWidth).toBe(170);
  });
  it('deleting a workspace takes its width with it', async () => {
    const d = await loadDock();
    d.setRailWidth(200);
    const ws = d.saveWorkspace('Gone')!;
    d.setRailWidth(130);
    d.deleteWorkspace(ws.id);
    expect(d.dock.get().railWidths).toEqual({ draw: 200 });
  });
  it('a file with a bad width opens without it', () => {
    for (const bad of ['wide', -5, 0, null, {}]) {
      const r = parseWorkspaceText(JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, name: 'Odd', layout: emptyLayout(), railWidth: bad }));
      expect(r.ok && r.workspace.railWidth).toBeUndefined();
    }
    expect(sanitizeWorkspace({ id: 'a', name: 'A', layout: emptyLayout(), railWidth: 9999 })?.railWidth).toBe(280);
  });
});

describe('Put the tools back puts the width back too', () => {
  it('goes back to the workspace default, and Undo brings the width again', async () => {
    const d = await loadDock();
    const rail = await import('../../src/ui/toolRail');
    d.setRailWidth(220);
    expect(rail.toolbarIsChanged()).toBe(true);
    rail.putToolsBack();
    expect(d.railWidthOf(d.dock.get())).toBeUndefined();
    expect(rail.toolbarIsChanged()).toBe(false);
  });
});
