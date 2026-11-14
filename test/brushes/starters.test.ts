// The built-in brushes: every one draws and exports as plain vector shapes, and the groups come out in a sensible order.
import { getStroke } from 'perfect-freehand';
import { describe, expect, it } from 'vitest';
import { groupOf, groupsOf, MY_GROUP } from '../../src/brushes/library';
import { allPresets, STARTERS } from '../../src/brushes/model';
import { STARTER_GROUPS } from '../../src/brushes/starters';
import type { StrokeShape } from '../../src/core/format';
import { tipShapes, type OutlineFn } from '../../src/geometry/tipShapes';

const outline: OutlineFn = (s, b) => getStroke(s.points.map((p) => [p.x, p.y, p.p]), { size: b.size, thinning: b.thinning, smoothing: b.smoothing, streamline: b.streamline, simulatePressure: true, last: true });
const wave = Array.from({ length: 50 }, (_, i) => ({ x: 30 + i * 6, y: 120 + Math.sin(i / 7) * 30, p: 0.3 + 0.5 * Math.sin((i / 49) * Math.PI) }));

describe('the built-in brushes', () => {
  it('list their groups in the order the picker shows them, after My brushes', () => {
    const names = groupsOf(allPresets([{ id: 'm', name: 'Mine', tool: 'brush', brush: STARTERS[0].brush }])).map((g) => g.name);
    expect(names).toEqual([MY_GROUP, ...STARTER_GROUPS]);
  });
  it('put every brush in one of the groups', () => {
    for (const s of STARTERS) expect(STARTER_GROUPS).toContain(groupOf(s));
  });
  it('mix with a group of your own that has the same name, without a second group', () => {
    const mine = { id: 'm', name: 'Mine', tool: 'brush' as const, brush: STARTERS[0].brush, group: 'pencils' };
    const g = groupsOf(allPresets([mine])).find((x) => x.name.toLowerCase() === 'pencils')!;
    expect(g.brushes).toContain(mine);
    expect(groupsOf(allPresets([mine])).filter((x) => x.name.toLowerCase() === 'pencils')).toHaveLength(1);
  });
  it('every tipped one turns into plain fills and lines, and the rest need nothing doing', () => {
    for (const s of STARTERS) {
      const shape: StrokeShape = { id: 'x', type: 'stroke', points: wave, brush: s.brush, color: '#222222', opacity: 1 };
      const parts = tipShapes(shape, outline);
      if (!s.brush.tip) {
        expect(parts, s.name).toBeNull();
        continue;
      }
      expect(parts, s.name).not.toBeNull();
      for (const p of parts!) expect(['fill', 'path', 'stroke'], s.name).toContain(p.type);
      // Nothing but plain shapes comes out: no tip is left on any of them.
      for (const p of parts!) if (p.type === 'stroke') expect(p.brush.tip, s.name).toBeUndefined();
    }
  });
  it('keep the grain of a tipped brush from bloating a file', () => {
    const chalky = STARTERS.filter((s) => s.brush.tip?.kind === 'chalk' || s.brush.tip?.kind === 'charcoal');
    expect(chalky.length).toBeGreaterThan(8);
    for (const s of chalky) {
      const shape: StrokeShape = { id: 'x', type: 'stroke', points: wave, brush: s.brush, color: '#222222', opacity: 1 };
      const pts = (tipShapes(shape, outline) ?? []).reduce((n, p) => n + (p.type === 'fill' ? p.paths.reduce((m, q) => m + q.points.length, 0) : 0), 0);
      expect(pts, s.name).toBeLessThan(120000);
    }
  });
});
