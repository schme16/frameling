// Hidden layers inside folders that become one picture, and the picture count in the export note.
import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import type { Doc, LayerFolder, PathShape } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { flatPlan, pictureCount, type FlatUnit } from '../../src/export/layered';
import { aiString } from '../../src/export/ai-native';
import { writePdf } from '../../src/export/pdf';

const rect = (id: string, x: number, y: number, w: number, h: number, fill: string): PathShape => ({
  id,
  type: 'path',
  paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }],
  fill,
  stroke: null,
  opacity: 1,
});

const blur = [{ id: 'e1', kind: 'blur', values: { radius: 2 } }] as unknown as LayerFolder['effects'];

/** A folder with a blur holding a shown layer, a hidden layer and a folder that is switched off (with a layer in it). */
function effectFolder(): Doc {
  const doc = newDoc({ width: 100, height: 50, background: '#ffffff' });
  doc.folders = {
    fx: { id: 'fx', name: 'Glowy', visible: true, opacity: 1, effects: blur } as LayerFolder,
    sub: { id: 'sub', name: 'Spare', visible: false, opacity: 1, parent: 'fx' } as LayerFolder,
  };
  const mk = (name: string, id: string, extra: object) => {
    const l = Object.assign(newVectorLayer(name), { id }, extra);
    l.cels = [{ id: 'c' + id, start: 0, length: 1, drawingId: 'd' + id }];
    doc.drawings['d' + id] = { id: 'd' + id, kind: 'vector', shapes: [rect('r' + id, 5, 5, 20, 20, '#ff0000')] };
    return l;
  };
  doc.layers = [mk('Shown', 'a', { folder: 'fx' }), mk('Hid', 'b', { folder: 'fx', visible: false }), mk('Deep', 'c', { folder: 'sub' }), mk('Plain', 'd', {})];
  doc.length = 1;
  return doc;
}

const names = (u: FlatUnit): string[] => (u.kind === 'vector' ? [u.layer.name] : u.kind === 'picture' ? u.layers.map((l) => l.name) : u.units.flatMap(names));

describe('hidden layers in a folder that becomes one picture', () => {
  it('keeps them as hidden layers in a folder next to the picture when the plan keeps hidden layers', () => {
    const plan = flatPlan(effectFolder(), 0, true);
    const held = plan.find((u) => u.kind === 'folder' && u.folder.name === 'Glowy (hidden layers)');
    expect(held).toBeTruthy();
    expect(held!.hidden).toBe(true);
    expect(names(held!).sort()).toEqual(['Deep', 'Hid']);
    const pic = plan.find((u) => u.kind === 'picture');
    expect(pic && names(pic)).toEqual(['Shown']);
  });

  it('leaves the plain plan as it was: one picture of what is on', () => {
    const plan = flatPlan(effectFolder(), 0, false);
    expect(plan.filter((u) => u.kind === 'folder')).toHaveLength(0);
    expect(plan.map((u) => names(u))).toEqual([['Shown'], ['Plain']]);
  });

  it('a switched off folder with effects keeps its hidden layers too, and its picture shows only the layers that are on', () => {
    const doc = effectFolder();
    doc.folders!.fx.visible = false;
    const plan = flatPlan(doc, 0, true);
    const pics = plan.filter((u) => u.kind === 'picture');
    expect(pics.map(names)).toEqual([['Shown']]);
    expect(pics[0].hidden).toBe(true);
    expect(plan.some((u) => u.kind === 'folder' && names(u).sort().join() === 'Deep,Hid')).toBe(true);
  });

  it('the hidden layers arrive in Illustrator as hidden layers with their art, and the picture is only of the layers that are on', () => {
    const asked: string[][] = [];
    const picture = (_f: number, layers: { name: string }[]) => {
      asked.push(layers.map((l) => l.name));
      return { width: 1, height: 1, pixels: new Uint8Array(4) };
    };
    const bytes = writePdf(effectFolder(), { frames: [0], scale: 1, background: null, title: 'T', native: true, picture: picture as never });
    const doc = illustratorDoc(bytes);
    const lb = (name: string) => new RegExp(`%AI5_BeginLayer\\r?\\n(\\d) \\d \\d \\d \\d \\d \\d \\d+ [^\\n]*Lb\\r?\\n${aiString(name).replace(/[\\\\()]/g, '\\$&')} Ln`).exec(doc)?.[1];
    expect(lb('Glowy (hidden layers)')).toBe('0');
    expect(lb('Hid')).toBe('0');
    expect(lb('Deep')).toBe('0');
    expect(lb('Plain')).toBe('1');
    // The shown layer is the picture; the hidden layers are vector, so their art (red fill) is there.
    expect(asked).toEqual([['Shown']]);
    expect(doc.match(/ Xa/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('a folder with a visible mask keeps its hidden layers the same way', () => {
    const doc = effectFolder();
    doc.folders!.fx.effects = undefined;
    const m = Object.assign(newVectorLayer('Cutter'), { id: 'm', folder: 'fx', mask: 'show' as const });
    m.cels = [{ id: 'cm', start: 0, length: 1, drawingId: 'da' }];
    doc.layers.splice(1, 0, m);
    const plan = flatPlan(doc, 0, true);
    expect(plan.some((u) => u.kind === 'folder' && u.folder.name === 'Glowy (hidden layers)')).toBe(true);
  });
});

describe('the pictures counted in the export note', () => {
  it('counts hidden layers when the file keeps them, and pictures inside folders', () => {
    const doc = effectFolder();
    // Nothing in this document needs a picture except the folder's effect: one picture.
    expect(pictureCount(flatPlan(doc, 0, false))).toBe(1);
    expect(pictureCount(flatPlan(doc, 0, true))).toBe(1);
    // A hidden layer with an effect is a picture for the .ai only.
    const hid = doc.layers.find((l) => l.name === 'Plain')!;
    hid.visible = false;
    hid.effects = blur;
    expect(pictureCount(flatPlan(doc, 0, false))).toBe(1);
    expect(pictureCount(flatPlan(doc, 0, true))).toBe(2);
  });

  it('looks inside folders', () => {
    const doc = newDoc({ width: 100, height: 50 });
    doc.folders = { f: { id: 'f', name: 'F', visible: true, opacity: 1 } as LayerFolder };
    const l = Object.assign(newVectorLayer('Soft'), { id: 'a', folder: 'f', effects: blur });
    l.cels = [{ id: 'c', start: 0, length: 1, drawingId: 'd' }];
    doc.drawings.d = { id: 'd', kind: 'vector', shapes: [rect('r', 1, 1, 5, 5, '#000000')] };
    doc.layers = [l];
    expect(flatPlan(doc).some((u) => u.kind === 'picture')).toBe(false);
    expect(pictureCount(flatPlan(doc))).toBe(1);
  });
});

/** The Illustrator document text inside a .ai (the private data blocks joined). */
function illustratorDoc(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString('latin1');
  const streams = new Map<number, Buffer>();
  const re = /(\d+) 0 obj\n<<([^\n]*?)>>\nstream\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const len = Number(/\/Length (\d+)/.exec(m[2])![1]);
    const raw = Buffer.from(bytes.subarray(m.index + m[0].length, m.index + m[0].length + len));
    streams.set(Number(m[1]), /FlateDecode/.test(m[2]) ? Buffer.from(unzlibSync(raw)) : raw);
  }
  const priv = /\/Private (\d+) 0 R/.exec(s)!;
  const dict = new RegExp(`\\n${priv[1]} 0 obj\\n<<(.*?)>>\\nendobj`, 's').exec(s)![1];
  const n = Number(/\/NumBlock (\d+)/.exec(dict)![1]);
  const parts: Buffer[] = [];
  for (let i = 2; i <= n; i++) parts.push(streams.get(Number(new RegExp(`/AIPrivateData${i} (\\d+) 0 R`).exec(dict)![1]))!);
  return Buffer.concat(parts).toString('utf8').replace(/\r\n/g, '\n');
}
