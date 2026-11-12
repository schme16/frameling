// @vitest-environment jsdom
// A plugin's canvas guide offers its straight lines and boxes to the snapping system, under its own "Plugin guides" tick,
// and only while the plugin is on and still allowed to draw on the canvas.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { newDoc } from '../../src/core/doc';
import type { ToolPointer } from '../../src/core/registry';
import { getTool } from '../../src/core/registry';
import { resetStore } from '../../src/core/store';
import { setSnapPick } from '../../src/canvas/snapOps';
import { setViewSettings } from '../../src/canvas/viewSettings';
import { getSnapLines } from '../../src/canvas/snap';
import { GUIDE_SNAP_LIMIT, guideSnapLines } from '../../src/plugins/drawlist';
import { installFrom, resetPluginsForTests, setApprover, setOverlayRequester, setPower, setSandboxStarterForTests } from '../../src/plugins/manager';
import { decide } from '../../src/plugins/powers';
import { memoryLibrary, setLibraryForTests } from '../../src/platform/library';
import { closeAll, runPlugin, settle } from './harness';

const CODE = `
frameling.tools.register({ id: 'pen', label: 'Pen', snap: true }, async () => undefined);
frameling.canvas.overlay([{ type: 'line', x1: 120, y1: 0, x2: 120, y2: 100 }, { type: 'rect', x: 10, y: 30, w: 40, h: 20 }, { type: 'line', x1: 0, y1: 0, x2: 50, y2: 50 }]);`;

const ptr = (x: number, y: number, over: Partial<ToolPointer> = {}): ToolPointer => ({ x, y, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0, ...over });
const ctx = { zoom: 1, requestOverlay: () => undefined, hint: () => undefined };

beforeEach(async () => {
  localStorage.clear();
  setLibraryForTests(memoryLibrary);
  setSandboxStarterForTests(async (pkg) => runPlugin(pkg.code, { id: pkg.manifest.id }).transport);
  setOverlayRequester(() => undefined);
  setApprover(async (m) => {
    const d = decide(m, ['tools', 'canvas'], false);
    return { permissions: d.permissions, network: d.network };
  });
  resetStore(newDoc({ width: 400, height: 300 }));
  setViewSettings({ snap: true });
  await installFrom({ 'manifest.json': strToU8(JSON.stringify({ id: 'guide-plug', name: 'Guide plug', version: '1.0.0', apiVersion: 2, permissions: ['tools', 'canvas'] })), 'main.js': strToU8(CODE) });
  await settle();
});

afterEach(async () => {
  resetPluginsForTests();
  setApprover(null);
  setSnapPick('vector', 'plugins', true);
  for (const e of await memoryLibrary.list('plugins')) await memoryLibrary.remove('plugins', e.id);
  setLibraryForTests(null);
  closeAll();
});

/** The x a pen point near `x` lands on. */
function movedTo(x: number, y = 200, over: Partial<ToolPointer> = {}): number {
  getTool('plugin.guide-plug.tool.pen')!.move!(ptr(x, y, over), ctx);
  return getSnapLines().length ? getSnapLines()[0].at : x;
}

describe('plugin guides as snap lines', () => {
  it('pull a point onto a straight line of the guide, and say it is a plugin guide', () => {
    expect(movedTo(122)).toBe(120);
    expect(getSnapLines()[0]).toMatchObject({ axis: 'x', at: 120, kind: 'plugins' });
  });

  it('offer the edges and middle of a box, but nothing from a slanted line', () => {
    expect(movedTo(31)).toBe(30);
    expect(movedTo(48)).toBe(50);
    expect(guideSnapLines([{ type: 'line', x1: 0, y1: 0, x2: 50, y2: 50 }])).toEqual({ x: [], y: [] });
  });

  it('stop when the Plugin guides tick is off, snapping is off, or Ctrl is held', () => {
    setSnapPick('vector', 'plugins', false);
    expect(movedTo(122)).toBe(122);
    setSnapPick('vector', 'plugins', true);
    expect(movedTo(122, 200, { mod: true })).toBe(122);
    setViewSettings({ snap: false });
    expect(movedTo(122)).toBe(122);
  });

  it('go away when the plugin loses its canvas power', async () => {
    expect(movedTo(122)).toBe(120);
    await setPower('guide-plug', 'canvas', false);
    await settle();
    expect(movedTo(122)).toBe(122);
  });
});

describe('guideSnapLines', () => {
  it('takes lines, polygon sides, boxes and ellipses, each value once', () => {
    const r = guideSnapLines([
      { type: 'line', x1: 5, y1: 0, x2: 5, y2: 9 },
      { type: 'line', x1: 0, y1: 7, x2: 9, y2: 7 },
      { type: 'polygon', points: [[0, 0], [10, 0], [10, 10]] },
      { type: 'ellipse', cx: 50, cy: 50, rx: 10, ry: 5 },
      { type: 'text', x: 1, y: 1, text: 'no' },
      { type: 'handle', id: 'h', x: 77, y: 77 },
    ]);
    expect(r.x.sort((a, b) => a - b)).toEqual([5, 10, 40, 50, 60]);
    expect(r.y.sort((a, b) => a - b)).toEqual([0, 7, 45, 50, 55]);
  });

  it('is capped, so a busy guide cannot slow every drag', () => {
    const lines = Array.from({ length: 900 }, (_, i) => ({ type: 'line' as const, x1: i, y1: 0, x2: i, y2: 5 }));
    expect(guideSnapLines(lines).x.length).toBe(GUIDE_SNAP_LIMIT);
  });
});
