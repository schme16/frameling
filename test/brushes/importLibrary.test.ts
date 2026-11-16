// @vitest-environment jsdom
// Imported brushes in the library: they land in a group of their own with the names they had, apply as the pixel brush,
// and are still there, whole, after the brushes are saved and read back.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { readBrushFile } from '../../src/brushes/import';
import { brushesToText, parseBrushesText, sanitizeList } from '../../src/brushes/model';
import * as P from '../../src/brushes/presets';
import { startBrushPresets } from '../../src/brushes/presets';
import { currentSpec } from '../../src/dab/live';
import { toasts } from '../../src/ui/toast';

const fx = (n: string): Uint8Array => new Uint8Array(readFileSync(join(process.cwd(), 'test/fixtures/brushes', n)));
const read = (n: string, as: string) => {
  const r = readBrushFile(fx(n), n.endsWith('.gbr') ? as : (n.split('/').pop() as string));
  if (!r.ok) throw new Error(r.error);
  return r;
};

let stop: () => void = () => {};
beforeEach(() => {
  stop();
  localStorage.clear();
  resetStore(newDoc());
  for (const p of [...P.myBrushes()]) {
    P.applyPreset(p.id);
    P.deleteActive();
  }
  toasts.set(() => []);
  stop = startBrushPresets();
});

describe('imported brushes in the library', () => {
  it('land in the group, keep their names, and number a name that is taken', () => {
    const a = read('gimp/Charcoal-01.gbr', 'Charcoal-01.gbr');
    expect(P.addImportedBrushes(a.brushes, 'My GIMP brushes')).toBe(1);
    expect(P.addImportedBrushes(a.brushes, 'My GIMP brushes')).toBe(1);
    const mine = P.myBrushes();
    expect(mine.map((p) => p.name)).toEqual(['Charcoal 01', 'Charcoal 01 2']);
    expect(mine.every((p) => p.group === 'My GIMP brushes' && p.tool === 'pixel' && p.pixel?.kind === 'dab')).toBe(true);
  });

  it('can be picked and become the pixel brush, tip and all', () => {
    P.addImportedBrushes(read('gimp/Charcoal-01.gbr', 'x').brushes, 'G');
    const id = P.myBrushes()[0].id;
    expect(P.applyPreset(id)).toBe(true);
    const spec = currentSpec();
    expect(spec?.kind).toBe('dab');
    if (spec?.kind === 'dab') expect(spec.dab.picture?.soft).toBe(true);
  });

  it('come back whole after a save and a read (a file, and the browser storage)', () => {
    const set = [...read('gimp/Charcoal-01.gbr', 'x').brushes, ...read('gimp/Hardness-050.vbr', 'x').brushes, ...read('abr/photoshop_dynamics.abr', 'x').brushes, ...read('gimp/confetti.gih', 'x').brushes];
    expect(P.addImportedBrushes(set, 'Set')).toBe(set.length);
    const before = P.myBrushes();
    // The brushes file you can share.
    const parsed = parseBrushesText(brushesToText(before));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.presets).toHaveLength(before.length);
      parsed.presets.forEach((p, i) => expect(p.pixel).toEqual(before[i].pixel));
    }
    // What the browser keeps.
    const stored = JSON.parse(localStorage.getItem('frameling.brushPresets') ?? 'null');
    const again = sanitizeList(stored.presets);
    expect(again.map((p) => p.name)).toEqual(before.map((p) => p.name));
    again.forEach((p, i) => expect(p.pixel).toEqual(before[i].pixel));
  });

  it('says so when the library is full instead of adding nothing silently', () => {
    const one = read('gimp/Hardness-050.vbr', 'x').brushes;
    const many = Array.from({ length: 1001 }, (_, i) => ({ ...one[0], name: `B${i}` }));
    expect(P.addImportedBrushes(many, 'Big')).toBe(1000);
    expect(toasts.get().some((t) => /Only 1000 of 1001/.test(t.message))).toBe(true);
    expect(P.addImportedBrushes(one, 'More')).toBe(0);
  });
});
