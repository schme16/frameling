// @vitest-environment jsdom
// Locking the tool rail and the panels. First the older saves (written before locks existed) must keep loading and
// saving back exactly as they were, and an old workspace file must read as it did; then the pure parts (what a lock
// is, how it is tidied, the words it says); then that it is kept per workspace and travels in a workspace file.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCK_KEY } from '../../src/ui/dock';
import { emptyLayout } from '../../src/ui/dockModel';
import type { ToolGroup } from '../../src/ui/toolArrange';
import { parseWorkspaceText, WORKSPACE_FORMAT, WORKSPACE_VERSION } from '../../src/ui/workspaceFile';
import { cleanLocks, isLockedIn, lockedReason, lockedWhy, looksAccidental, mergeLocks, sanitizeLockMap, savedLocks, withLock } from '../../src/ui/dockLock';

const OLD_RAILS: Record<string, ToolGroup[]> = {
  draw: [
    { id: 'draw', tools: ['pencil', 'brush', 'eraser', 'fill'] },
    { id: 'shapes', name: 'Blocking', tools: ['line', 'rect'] },
  ],
};
const oldDockSave = () => JSON.stringify({ layout: emptyLayout(), workspaceId: 'draw', user: [], rails: OLD_RAILS, railWidths: { draw: 180 }, v: 2 });

async function loadDock() {
  vi.resetModules();
  await import('../../src/renderer/features');
  return import('../../src/ui/dock');
}

beforeEach(() => localStorage.clear());

describe('a save from before locks existed', () => {
  it('loads unlocked, with nothing added to the state', async () => {
    localStorage.setItem(DOCK_KEY, oldDockSave());
    const d = await loadDock();
    expect(d.dock.get().rails).toEqual(OLD_RAILS);
    expect(Object.keys(d.dock.get()).sort()).toEqual(['layout', 'railWidths', 'rails', 'user', 'workspaceId']);
    expect(d.locksOf(d.dock.get())).toEqual({});
  });

  it('is written back the same when something else changes, with no locks in it', async () => {
    localStorage.setItem(DOCK_KEY, oldDockSave());
    const d = await loadDock();
    d.placeTools('right');
    const saved = JSON.parse(localStorage.getItem(DOCK_KEY)!);
    expect(saved.rails).toEqual(OLD_RAILS);
    expect(saved.railWidths).toEqual({ draw: 180 });
    expect('locks' in saved).toBe(false);
  });

  it('a workspace you saved then comes back the same through its file, still version 1', async () => {
    localStorage.setItem(DOCK_KEY, oldDockSave());
    const d = await loadDock();
    const ws = d.saveWorkspace('Old')!;
    expect(ws.locks).toBeUndefined();
    const text = JSON.parse(d.workspaceText(ws.id)!);
    expect(text.version).toBe(1);
    expect('locks' in text).toBe(false);
    const r = d.importWorkspace(JSON.stringify(text));
    expect(r.ok && r.workspace.locks).toBeUndefined();
    expect(r.ok && r.workspace.rail).toEqual(OLD_RAILS.draw);
    expect(r.ok && r.workspace.railWidth).toBe(180);
  });

  it('an old workspace file reads as it did', () => {
    const r = parseWorkspaceText(JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, name: 'Mine', layout: emptyLayout(), rail: OLD_RAILS.draw, railWidth: 150 }));
    expect(r.ok && r.workspace.rail).toEqual(OLD_RAILS.draw);
    expect(r.ok && r.workspace.railWidth).toBe(150);
    expect(r.ok && r.workspace.locks).toBeUndefined();
    expect(WORKSPACE_VERSION).toBe(1);
  });
});

describe('what a lock is', () => {
  it('tidies what it is given', () => {
    expect(cleanLocks({ tools: true, panels: false })).toEqual({ tools: true, panels: false });
    expect(cleanLocks({ tools: true, extra: 1 })).toEqual({ tools: true });
    expect(cleanLocks({ tools: 'yes', panels: 1 })).toBeUndefined();
    for (const bad of [null, undefined, 5, 'x', [], true, {}]) expect(cleanLocks(bad)).toBeUndefined();
  });
  it('a file only ever carries what is locked', () => {
    expect(cleanLocks({ tools: true, panels: false }, true)).toEqual({ tools: true });
    expect(cleanLocks({ tools: false }, true)).toBeUndefined();
    expect(savedLocks({ tools: true, panels: false })).toEqual({ tools: true });
    expect(savedLocks({ panels: false })).toBeUndefined();
    expect(savedLocks(undefined)).toBeUndefined();
  });
  it('a map of them keeps good workspaces and drops the rest', () => {
    expect(sanitizeLockMap({ draw: { tools: true }, 'bad id!': { tools: true }, __proto__: { tools: true }, pixel: 'x', animate: { panels: false } })).toEqual({ draw: { tools: true }, animate: { panels: false } });
    expect(sanitizeLockMap([{ tools: true }])).toEqual({});
    expect(sanitizeLockMap(null)).toEqual({});
  });
  it('your own choice sits on top of what the workspace brings', () => {
    expect(mergeLocks({ tools: true }, undefined)).toEqual({ tools: true });
    expect(mergeLocks({ tools: true, panels: true }, { tools: false })).toEqual({ tools: false, panels: true });
    expect(isLockedIn(mergeLocks({ tools: true }, { tools: false }), 'tools')).toBe(false);
    expect(isLockedIn(undefined, 'panels')).toBe(false);
  });
  it('locking and unlocking give back only what differs from what the workspace brings', () => {
    expect(withLock(undefined, undefined, 'tools', true)).toEqual({ tools: true });
    expect(withLock({ tools: true }, undefined, 'tools', false)).toBeUndefined();
    expect(withLock(undefined, { tools: true }, 'tools', false)).toEqual({ tools: false });
    expect(withLock({ tools: false }, { tools: true }, 'tools', true)).toBeUndefined();
    expect(withLock({ tools: true }, undefined, 'panels', true)).toEqual({ tools: true, panels: true });
  });
});

describe('what it says', () => {
  it('gives a plain reason for each thing it refuses, and the way out', () => {
    for (const kind of ['tools', 'panels'] as const) {
      for (const doing of ['move', 'size', 'arrange', 'edit', 'reset'] as const) {
        const r = lockedReason(kind, doing);
        expect(r).toMatch(/locked/);
        expect(r).toMatch(/Unlock/);
        expect(r).not.toMatch(/—/);
      }
    }
    expect(lockedReason('tools', 'reset')).toMatch(/back/);
    expect(lockedWhy('tools')).toMatch(/Unlock the tools/);
    expect(lockedWhy('panels')).toMatch(/Unlock the panels/);
  });
  it('tells a slip from a decision: a quick short drag is a slip', () => {
    expect(looksAccidental({ ms: 150, px: 300 })).toBe(true);
    expect(looksAccidental({ ms: 2000, px: 20 })).toBe(true);
    expect(looksAccidental({ ms: 1800, px: 400 })).toBe(false);
  });
});

describe('locks are kept per workspace', () => {
  it('are saved and come back after a restart', async () => {
    const d = await loadDock();
    d.setLock('tools', true);
    expect(d.locksOf(d.dock.get())).toEqual({ tools: true });
    const d2 = await loadDock();
    expect(d2.locksOf(d2.dock.get())).toEqual({ tools: true });
  });
  it('each workspace has its own', async () => {
    const d = await loadDock();
    d.setLock('tools', true);
    d.applyWorkspace('animate');
    expect(d.locksOf(d.dock.get())).toEqual({});
    d.setLock('panels', true);
    d.applyWorkspace('draw');
    expect(d.locksOf(d.dock.get())).toEqual({ tools: true });
    expect(d.dock.get().locks).toEqual({ draw: { tools: true }, animate: { panels: true } });
  });
  it('unlocking takes it away, and the dock save has no locks left in it', async () => {
    const d = await loadDock();
    d.setLock('tools', true);
    d.setLock('tools', false);
    expect(d.dock.get().locks).toBeUndefined();
    expect('locks' in JSON.parse(localStorage.getItem(DOCK_KEY)!)).toBe(false);
  });
  it('bad locks in a save are dropped and good ones kept', async () => {
    localStorage.setItem(DOCK_KEY, JSON.stringify({ layout: emptyLayout(), workspaceId: 'draw', user: [], v: 2, locks: { draw: { tools: true, panels: 'x' }, animate: 4 } }));
    const d = await loadDock();
    expect(d.dock.get().locks).toEqual({ draw: { tools: true } });
  });
  it('Reset layout leaves the lock alone', async () => {
    const d = await loadDock();
    d.setLock('tools', true);
    d.resetLayout();
    expect(d.locksOf(d.dock.get())).toEqual({ tools: true });
  });
});

describe('a saved workspace and its file carry the lock', () => {
  it('saving keeps it as the workspace default; the file stays version 1 and imports with it', async () => {
    const d = await loadDock();
    d.setLock('tools', true);
    d.setLock('panels', true);
    const ws = d.saveWorkspace('Steady')!;
    expect(ws.locks).toEqual({ tools: true, panels: true });
    expect(d.locksOf(d.dock.get())).toEqual({ tools: true, panels: true });
    const text = JSON.parse(d.workspaceText(ws.id)!);
    expect(text.version).toBe(1);
    expect(text.locks).toEqual({ tools: true, panels: true });
    const r = d.importWorkspace(JSON.stringify(text));
    expect(r.ok && r.workspace.locks).toEqual({ tools: true, panels: true });
  });
  it('unlocking in a workspace that brings a lock is kept, and survives a restart', async () => {
    const d = await loadDock();
    d.setLock('tools', true);
    d.saveWorkspace('Steady');
    d.setLock('tools', false);
    expect(d.locksOf(d.dock.get())).toEqual({ tools: false });
    const d2 = await loadDock();
    expect(d2.locksOf(d2.dock.get())).toEqual({ tools: false });
  });
  it('deleting the workspace takes its lock with it', async () => {
    const d = await loadDock();
    const ws = d.saveWorkspace('Gone')!;
    d.setLock('panels', true);
    expect(d.dock.get().locks).toEqual({ [ws.id]: { panels: true } });
    d.deleteWorkspace(ws.id);
    expect(d.dock.get().locks).toBeUndefined();
  });
  it('a file with a bad lock opens unlocked', () => {
    const r = parseWorkspaceText(JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, name: 'Mine', layout: emptyLayout(), locks: { tools: 'maybe' } }));
    expect(r.ok && r.workspace.locks).toBeUndefined();
  });
});
