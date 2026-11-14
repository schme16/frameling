// Folders inside folders in PDF layers and in the Illustrator (.ai) data: nested layers, each level's own look, and
// pictures that leave out the folders they sit in.
import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import type { Doc, Layer, PathShape } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import * as edit from '../../src/effects/edit';
import { flatPlan, type FlatUnit } from '../../src/export/layered';
import { writePdf } from '../../src/export/pdf';

const rect = (id: string, x: number, fill: string): PathShape => ({ id, type: 'path', paths: [{ closed: true, points: [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }] }], fill, stroke: null, opacity: 1 });

/** Layers a, b, c, d (bottom first), each a box; P holds b and c, and Q (in P) holds c. */
function make(): { doc: Doc; p: string; q: string } {
  const doc = newDoc({ width: 100, height: 50, background: '#ffffff' });
  doc.length = 1;
  doc.layers = ['a', 'b', 'c', 'd'].map((n, i) => {
    const l = Object.assign(newVectorLayer(n.toUpperCase()), { id: n }) as Layer;
    doc.drawings['d' + n] = { id: 'd' + n, kind: 'vector', shapes: [rect('r' + n, i * 20, '#336699')] };
    l.cels = [{ id: 'c' + n, start: 0, length: 1, drawingId: 'd' + n }];
    return l;
  });
  const p = edit.makeFolder(doc, ['b', 'c'], 'P')!;
  const q = edit.makeFolder(doc, ['c'], 'Q')!;
  return { doc, p, q };
}

const shape = (u: FlatUnit): string =>
  u.kind === 'vector' ? u.layer.id : u.kind === 'picture' ? `[${u.layers.map((l) => l.id).join(',')}]` : `${u.folder.name}(${u.units.map(shape).join(' ')})`;

function aiData(bytes: Uint8Array): string {
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
const native = (doc: Doc) => writePdf(doc, { frames: [0], scale: 1, background: '#ffffff', title: 'T', native: true });

describe('nested folders in the flat plan (PDF and .ai)', () => {
  it('a folder unit inside a folder unit', () => {
    const { doc } = make();
    expect(flatPlan(doc).map(shape)).toEqual(['a', 'P(b Q(c))', 'd']);
  });

  it('a folder with effects inside a plain folder is one picture, knowing which folders it sits in', () => {
    const { doc, p, q } = make();
    doc.folders![q].effects = [{ id: 'e', kind: 'blur', values: { radius: 2 } }];
    const plan = flatPlan(doc);
    expect(plan.map(shape)).toEqual(['a', 'P(b [c])', 'd']);
    const outer = plan[1];
    if (outer.kind !== 'folder') throw new Error('no folder');
    expect(outer.units[1]).toMatchObject({ kind: 'picture', inside: [p] });
  });

  it('a mask in the outer folder flattens the whole folder, folders inside included', () => {
    const { doc, p } = make();
    doc.layers.splice(3, 0, Object.assign(newVectorLayer('M'), { id: 'm', mask: 'show' as const, folder: p }));
    expect(flatPlan(doc).map(shape)).toEqual(['a', '[b,c,m]', 'd']);
  });

  it('a hidden outer folder keeps its inner folder as hidden layers when asked, and drops them otherwise', () => {
    const { doc, p } = make();
    doc.folders![p].visible = false;
    expect(flatPlan(doc).map(shape)).toEqual(['a', 'd']);
    const plan = flatPlan(doc, 0, true);
    expect(plan.map(shape)).toEqual(['a', 'P(b Q(c))', 'd']);
    const outer = plan[1];
    if (outer.kind !== 'folder') throw new Error('no folder');
    expect(outer.hidden).toBe(true);
    const inner = outer.units[1];
    expect(inner).toMatchObject({ kind: 'folder', inHidden: true });
  });
});

describe('nested folders in a PDF', () => {
  it('lists the layers nested, an array per folder, top first', () => {
    const { doc } = make();
    const s = Buffer.from(writePdf(doc, { frames: [0], scale: 1, background: null, title: 'T' })).toString('latin1');
    // D, then P with [Q with [C], then B], then A.
    expect(s).toMatch(/\/Order \[\d+ 0 R \d+ 0 R \[\d+ 0 R \[\d+ 0 R\] \d+ 0 R\] \d+ 0 R\]/);
    for (const n of ['P', 'Q', 'A', 'B', 'C', 'D']) expect(s).toContain(`/Type /OCG /Name (${n})`);
  });

  it('asks for a nested picture without the folders around it', () => {
    const { doc, p, q } = make();
    doc.folders![q].effects = [{ id: 'e', kind: 'blur', values: { radius: 2 } }];
    const asked: { ids: string[]; inside?: string[] }[] = [];
    writePdf(doc, {
      frames: [0],
      scale: 1,
      background: null,
      title: 'T',
      picture: (_f, layers, _own, _reveal, inside) => (asked.push({ ids: layers.map((l) => l.id), inside }), { width: 1, height: 1, pixels: new Uint8ClampedArray(4) }),
    });
    expect(asked).toEqual([{ ids: ['c'], inside: [p] }]);
  });
});

describe('nested folders in the Illustrator data', () => {
  it('writes a layer inside a layer inside a layer, each with its own opacity', () => {
    const { doc, p, q } = make();
    doc.folders![p].opacity = 0.6;
    doc.folders![q].opacity = 0.4;
    const ai = aiData(native(doc));
    const names = [...ai.matchAll(/^\((.*)\) Ln$/gm)].map((m) => m[1]);
    expect(names).toEqual(['Background', 'A', 'P', 'B', 'Q', 'C', 'D']);
    const begin = (name: string) => ai.lastIndexOf('%AI5_BeginLayer', ai.indexOf(`(${name}) Ln`));
    const pBlock = ai.slice(begin('P'), begin('D'));
    // P holds B and Q, and Q holds C: both have layers inside ("1 AE").
    expect(pBlock.match(/1 AE/g)).toHaveLength(2);
    expect(pBlock.match(/%AI5_BeginLayer/g)).toHaveLength(4);
    expect(pBlock.match(/%AI5_EndLayer--/g)).toHaveLength(4);
    expect(pBlock).toContain('0 0.6 0 2 0 Xy');
    expect(pBlock).toContain('0 0.4 0 2 0 Xy');
    // Q ends before P does.
    expect(pBlock.indexOf('(Q) Ln')).toBeLessThan(pBlock.lastIndexOf('%AI5_EndLayer--'));
    expect(ai).toContain('%AI5_NumLayers: 4');
  });

  it('a hidden inner folder is a hidden layer inside its visible parent', () => {
    const { doc, q } = make();
    doc.folders![q].visible = false;
    const ai = aiData(native(doc));
    const at = ai.indexOf('(Q) Ln');
    const lb = ai.slice(ai.lastIndexOf('%AI5_BeginLayer', at), at);
    expect(lb).toMatch(/^%AI5_BeginLayer\n0 1 1 1 0 0 0 /);
    const pAt = ai.indexOf('(P) Ln');
    expect(ai.slice(ai.lastIndexOf('%AI5_BeginLayer', pAt), pAt)).toMatch(/^%AI5_BeginLayer\n1 1 1 1 0 0 1 /);
  });
});
