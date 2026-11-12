// The snap line colours (one per target) have to be seen on the canvas and in the "Snapped to" note in every theme.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SNAP_TARGETS } from '../../src/canvas/snapModel';
import { BUILT_IN_THEMES } from '../../src/ui/themes/builtIn';
import { contrast } from '../../src/ui/themes/color';

const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/canvas/canvas.css'), 'utf8');
const all = [...css.matchAll(/--snap-([a-z]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]] as const);
const n = SNAP_TARGETS.length;
const sets = { dark: Object.fromEntries(all.slice(0, n)), light: Object.fromEntries(all.slice(n, 2 * n)), light2: Object.fromEntries(all.slice(2 * n, 3 * n)) };

describe('snap colours', () => {
  it('are set for every target in the dark set and both places the light set lives', () => {
    expect(all).toHaveLength(n * 3);
    for (const s of Object.values(sets)) for (const t of SNAP_TARGETS) expect(s[t.id], t.id).toMatch(/^#[0-9a-f]{6}$/i);
    expect(sets.light).toEqual(sets.light2);
  });
  it('are told apart (no two targets share a colour, bar the grid and its pixel cells)', () => {
    for (const s of [sets.dark, sets.light]) {
      const seen = Object.entries(s).filter(([k]) => k !== 'cells').map(([, v]) => v.toLowerCase());
      expect(new Set(seen).size).toBe(seen.length);
    }
  });
  it('show 3:1 on the canvas and on the panels of every theme', () => {
    for (const t of BUILT_IN_THEMES) {
      const set = sets[t.mode === 'dark' ? 'dark' : 'light'];
      for (const [k, v] of Object.entries(set)) for (const surface of ['canvas-bg', 'panel', 'raised']) expect(contrast(v, t.tokens[surface]), `${t.id} ${k} on ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });
  it('dark themes still read 3:1 on a white page', () => {
    for (const [k, v] of Object.entries(sets.dark)) expect(contrast(v, '#ffffff'), k).toBeGreaterThanOrEqual(3);
    for (const [k, v] of Object.entries(sets.light)) expect(contrast(v, '#ffffff'), k).toBeGreaterThanOrEqual(3);
  });
  it('carry a readable number on the gap tab', () => {
    for (const s of [sets.dark, sets.light]) expect(Math.max(contrast('#000000', s.spacing), contrast('#ffffff', s.spacing))).toBeGreaterThanOrEqual(4.5);
  });
});
