// Illustrator's own data inside the .ai: layers, folders, artboards, gradients, pictures. The file is read back the way
// Illustrator reads it (the private streams of the page's /PieceInfo), so the checks are on what Illustrator would see.
import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import type { Doc, Gradient, LayerFolder, PathShape } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { aiString } from '../../src/export/ai-native';
import { PdfWriter, writePdf } from '../../src/export/pdf';
import { defaultSettings, outputExt, planExport, resolveRange } from '../../src/export/plan';
import { aiFramesOf, type ExportSettings } from '../../src/export/types';

const rect = (id: string, x: number, y: number, w: number, h: number, fill: string, extra: Partial<PathShape> = {}): PathShape => ({
  id,
  type: 'path',
  paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }],
  fill,
  stroke: null,
  opacity: 1,
  ...extra,
});

function layered(): Doc {
  const doc = newDoc({ width: 100, height: 50, background: '#ffffff' });
  const sky = Object.assign(newVectorLayer('Sky'), { id: 'a', folder: 'f1' });
  const hills = Object.assign(newVectorLayer('Hills (far)'), { id: 'b', folder: 'f1', opacity: 0.5, blend: 'multiply' as const });
  const top = Object.assign(newVectorLayer('Ünï 日本'), { id: 'c' });
  doc.folders = { f1: { id: 'f1', name: 'Scenery', visible: true, opacity: 0.7 } as LayerFolder };
  doc.drawings = {
    da: { id: 'da', kind: 'vector', shapes: [rect('r1', 0, 0, 100, 20, '#7ec8ff')] },
    db: { id: 'db', kind: 'vector', shapes: [rect('r2', 10, 30, 40, 10, '#00ff00')] },
    dc: { id: 'dc', kind: 'vector', shapes: [rect('r3', 60, 5, 20, 20, '#ff0000', { stroke: { color: '#000000', width: 2, join: 'miter', cap: 'butt' } })] },
  };
  for (const [l, d] of [[sky, 'da'], [hills, 'db'], [top, 'dc']] as const) l.cels = [{ id: 'c' + d, start: 0, length: 1, drawingId: d }];
  doc.layers = [sky, hills, top];
  doc.length = 1;
  return doc;
}

/** The Illustrator part of a .ai: the header (AIMetaData) and the document (AIPrivateData2..n joined), as text. */
function illustratorData(bytes: Uint8Array): { header: string; doc: string; raw: string; blocks: number; dict: string } {
  const s = Buffer.from(bytes).toString('latin1');
  const streams = new Map<number, Buffer>();
  const re = /(\d+) 0 obj\n<<([^\n]*?)>>\nstream\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const len = Number(/\/Length (\d+)/.exec(m[2])![1]);
    const raw = Buffer.from(bytes.subarray(m.index + m[0].length, m.index + m[0].length + len));
    streams.set(Number(m[1]), /FlateDecode/.test(m[2]) ? Buffer.from(unzlibSync(raw)) : raw);
  }
  const priv = /\/Private (\d+) 0 R/.exec(s);
  if (!priv) throw new Error('no Illustrator data');
  const dict = new RegExp(`\\n${priv[1]} 0 obj\\n<<(.*?)>>\\nendobj`, 's').exec(s)![1];
  const get = (key: string) => streams.get(Number(new RegExp(`/${key} (\\d+) 0 R`).exec(dict)![1]))!;
  const n = Number(/\/NumBlock (\d+)/.exec(dict)![1]);
  const parts: Buffer[] = [];
  for (let i = 2; i <= n; i++) parts.push(get(`AIPrivateData${i}`));
  const all = Buffer.concat(parts);
  return { header: get('AIMetaData').toString('latin1'), doc: all.toString('utf8').replace(/\r\n/g, '\n'), raw: all.toString('latin1'), blocks: n, dict };
}

const nativePdf = (doc: Doc, frames = [0]) => writePdf(doc, { frames, scale: 1, background: '#ffffff', title: 'T', native: true });

describe('Illustrator layers and folders', () => {
  it('writes every layer by name, a folder holding its layers, with opacity and blend on the right level', () => {
    const { doc } = illustratorData(nativePdf(layered()));
    const names = [...doc.matchAll(/^\((.*)\) Ln$/gm)].map((m) => m[1]);
    expect(names).toEqual(['Background', 'Scenery', 'Sky', 'Hills \\(far\\)', 'Ünï 日本']);
    // The folder is the layer that has layers inside it ("1 AE"), and ends after them.
    const scenery = doc.slice(doc.indexOf('(Scenery) Ln'), doc.lastIndexOf('%AI5_BeginLayer', doc.indexOf('(Ünï')));
    expect(scenery).toContain('1 AE');
    expect(scenery.match(/%AI5_BeginLayer/g)).toHaveLength(2);
    // Folder at 70 percent, the layer inside at 50 percent, multiply (blend 1): attributes come after the layer's art.
    expect(scenery).toContain('0 0.7 0 2 0 Xy');
    expect(scenery).toContain('1 0.5 0 2 0 Xy');
    expect(doc).toContain('%AI5_NumLayers: 3');
  });

  it('keeps a layer name with brackets and a backslash readable', () => {
    expect(aiString('a (b) \\ c')).toBe('(a \\(b\\) \\\\ c)');
    expect(aiString('two\nlines')).toBe('(two lines)');
  });

  it('draws in Illustrator operators: page up is y up, one outline with a fill and a line is one path', () => {
    const { doc } = illustratorData(nativePdf(layered()));
    // The red box: frameling y 5..25 on a 50 high page is 25..45 going up.
    const art = doc.slice(doc.indexOf('(Ünï'));
    expect(art).toContain('60 45 m');
    expect(art).toMatch(/\n80 45 L\n80 25 L\n60 25 L\n60 45 L\nb\n/);
    expect(art).toContain('0 0 0 1 0 0 0 XA');
    expect(art).toContain('2 w');
  });

  it('puts the PDF part in the same file for every other program', () => {
    const bytes = nativePdf(layered());
    const s = Buffer.from(bytes).toString('latin1');
    expect(s.startsWith('%PDF-')).toBe(true);
    expect(s).toContain('/Type /OCG /Name (Scenery)');
    // Folders nest in the PDF layer order too: the folder, then an array with its layers.
    expect(s).toMatch(/\/Order \[\d+ 0 R \d+ 0 R \[\d+ 0 R \d+ 0 R\] \d+ 0 R\]/);
    expect(s).toContain('/PieceInfo << /Illustrator');
  });

  it('adds no Illustrator data when asked for a plain PDF', () => {
    const bytes = writePdf(layered(), { frames: [0], scale: 1, background: null, title: 'T' });
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('AIPrivateData');
  });
});

describe('Illustrator artboards', () => {
  it('writes an artboard for each page, side by side, with the file holding one set of layers', () => {
    const doc = layered();
    doc.length = 3;
    doc.drawings.dd = { id: 'dd', kind: 'vector', shapes: [rect('r4', 5, 5, 10, 10, '#00ff00')] };
    doc.layers[2].cels = [
      { id: 'x0', start: 0, length: 1, drawingId: 'dc' },
      { id: 'x1', start: 1, length: 2, drawingId: 'dd' },
    ];
    const { doc: ai, blocks, dict } = illustratorData(nativePdf(doc, [0, 1, 2]));
    expect(ai.match(/\/RealPointRelToROrigin/g)).toHaveLength(6);
    expect(ai).toContain('0 50 /RealPointRelToROrigin');
    expect(ai).toContain('100 0 /RealPointRelToROrigin');
    expect(ai).toContain('124 50 /RealPointRelToROrigin');
    expect(ai).toContain('(Frame 3) /UnicodeString (Name)');
    // The same layer names once, with the art of every frame inside.
    expect([...ai.matchAll(/^\((.*)\) Ln$/gm)].map((m) => m[1])).toEqual(['Background', 'Scenery', 'Sky', 'Hills \\(far\\)', 'Ünï 日本']);
    // The second frame's box sits at its own artboard: x 5..15 plus 124.
    expect(ai).toContain('129 45 m');
    expect(blocks).toBeGreaterThan(1);
    expect(dict).toContain('/RoundtripVersion 17');
  });

  it('cuts a big document into blocks of 64 KB', () => {
    const doc = layered();
    doc.drawings.da = { id: 'da', kind: 'vector', shapes: Array.from({ length: 4000 }, (_, i) => rect('s' + i, i % 90, i % 40, 5, 5, '#123456')) };
    const bytes = nativePdf(doc);
    const { blocks } = illustratorData(bytes);
    expect(blocks).toBeGreaterThan(2);
    const sizes = [...Buffer.from(bytes).toString('latin1').matchAll(/AIPrivateData\d+ \d+ 0 R/g)];
    expect(sizes.length).toBe(blocks);
  });
});

const lin: Gradient = { kind: 'linear', stops: [{ at: 0, color: '#0000ff' }, { at: 0.4, color: '#00ff00ff' }, { at: 1, color: '#0000ff00' }], from: { x: 10, y: 0 }, to: { x: 90, y: 0 } };
const rad: Gradient = { kind: 'radial', stops: [{ at: 0, color: '#ffffff' }, { at: 1, color: '#ff0000' }], from: { x: 50, y: 25 }, to: { x: 70, y: 25 } };

describe('Illustrator gradients', () => {
  const withGradients = () => {
    const doc = layered();
    doc.drawings.dc = { id: 'dc', kind: 'vector', shapes: [rect('g1', 0, 0, 100, 20, '#ffffff', { fillGradient: lin }), rect('g2', 0, 25, 40, 25, '#ffffff', { fillGradient: rad })] };
    return doc;
  };

  it('defines each gradient once, with the stops and their see-through strength (linear from the far end)', () => {
    const { doc } = illustratorData(nativePdf(withGradients()));
    expect(doc).toContain('%AI5_BeginGradient: (Frameling gradient 1)');
    expect(doc).toContain('(Frameling gradient 1) 0 3 0 0 Bd');
    const stops = [...doc.matchAll(/^%_(.*) Bs$/gm)].map((m) => m[1].split(' ').slice(-5));
    // linear: ramp point 100, 40, 0 with opacity 0, 1, 1 (the first stop is the last listed)
    expect(stops.slice(0, 3).map((s) => [s[1], s[4]])).toEqual([['0', '100'], ['1', '40'], ['1', '0']]);
    // radial: from the centre out
    expect(doc).toContain('(Frameling gradient 2) 1 2 0 0 Bd');
    expect(stops.slice(3).map((s) => s[4])).toEqual(['0', '100']);
  });

  it('puts the gradient on its path with the matrices that place it (here a left to right run of 80 points)', () => {
    const { doc } = illustratorData(nativePdf(withGradients()));
    expect(doc).toMatch(/Bb\n1 \(Frameling gradient 1\) 0 0 0 1 1 0 0 1 0 0 1 Bg\n80 0 0 -24 10 \d+ Xm/);
    // Segments between the stops: 0 to 40 percent and 40 to 100 percent.
    expect(doc).toContain('32 0 0');
    expect(doc).toContain('48 0 0');
    expect(doc).toMatch(/\n20 0 0 -20 50 25 Bm\nf\n0 BB/);
  });
});

describe('Illustrator pictures', () => {
  const picture = (alpha: boolean) => {
    const w = new PdfWriter();
    const px = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    if (alpha) px[3] = 0;
    const im = w.image({ width: 4, height: 4, pixels: px }, false);
    const oc = w.beginLayer('Pic');
    const content = `1 0 0 -1 0 40 cm\n/OC /${oc} BDC\nq 40 0 0 -40 0 40 cm /${im} Do Q\nEMC`;
    w.endLayer();
    return w.finish([{ content, width: 40, height: 40 }], { title: 'P', creator: 'x' }, true);
  };

  it('writes the pixels as RGB, with an alpha plane behind them only when something is see-through', () => {
    const opaque = illustratorData(picture(false)).raw;
    const see = illustratorData(picture(true)).raw;
    const size = (d: string) => {
      const a = d.indexOf('XI\r\n', d.indexOf('%%BeginData')) + 4;
      return d.indexOf('%%EndData') - a;
    };
    expect(size(opaque)).toBe(4 * 4 * 3);
    expect(size(see)).toBe(4 * 4 * 4);
    expect(opaque).toContain('8 3 0 1 1 0 4 4 0 0');
    expect(see).toContain('8 3 1 17 1 0 4 4 0 0');
    // A 4 by 4 picture drawn 40 points wide: ten points a pixel, counted down from its top edge.
    expect(see).toContain('[ 10 0 0 10 0 40 ]');
  });
});

describe('what the Illustrator export is set to do', () => {
  const doc = layered();
  doc.length = 5;
  const base = (): ExportSettings => ({ ...defaultSettings(doc), format: 'ai', range: 'all' });

  it('is the frame being looked at unless something else is picked', () => {
    const s = base();
    expect(aiFramesOf(s)).toBe('one');
    expect(resolveRange(doc, s, 3)).toEqual({ start: 3, end: 3 });
    const p = planExport(doc, s, 3);
    expect(p.count).toBe(1);
    expect(p.name).toMatch(/-frame-4$/);
  });

  it('takes the whole range for files, pages and artboards', () => {
    for (const aiFrames of ['files', 'pages', 'artboards'] as const) {
      const s = { ...base(), aiFrames };
      expect(planExport(doc, s, 3).count).toBe(5);
    }
    expect(outputExt({ ...base(), aiFrames: 'files' })).toBe('zip');
    expect(outputExt({ ...base(), aiFrames: 'artboards' })).toBe('ai');
    expect(outputExt({ ...base(), format: 'pdf' })).toBe('pdf');
  });

  it('leaves the other formats alone', () => {
    expect(aiFramesOf({ format: 'pdf', aiFrames: 'files' })).toBe('one');
    expect(planExport(doc, { ...base(), format: 'pdf' }, 3).count).toBe(5);
  });
});

describe('see-through gradients in the PDF part', () => {
  it('paints the shading inside a form that carries the soft mask, not straight under the mask', () => {
    const doc = layered();
    doc.drawings.dc = { id: 'dc', kind: 'vector', shapes: [rect('g1', 0, 0, 100, 20, '#ffffff', { fillGradient: lin })] };
    const pdf = Buffer.from(writePdf(doc, { frames: [0], scale: 1, background: null, title: 'T' })).toString('latin1');
    const texts: string[] = [];
    const re = /stream\n([\s\S]*?)\nendstream/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pdf))) {
      try {
        texts.push(Buffer.from(unzlibSync(Buffer.from(m[1], 'latin1'))).toString('latin1'));
      } catch {
        // not text
      }
    }
    const all = texts.join('\n');
    expect(all).toMatch(/\/GS\d+ gs \/Fm\d+ Do/);
    // The form holds the clip and the shading; no page content paints the shading right under the mask.
    expect(all).toMatch(/W\* n \/Sh\d+ sh/);
    expect(all).not.toMatch(/\/GS\d+ gs\nW\* n/);
  });
});
