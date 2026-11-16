// Dashes, arrow heads and changing widths in every writer: which keep them as they are, and what the others do instead.
import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import type { Doc, PathShape, PathStroke } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { frameToSvg } from '../../src/export/svg';
import { animatedSvg } from '../../src/export/svg-anim';
import { docToLottie, expandLine } from '../../src/export/lottie';
import { writePdf } from '../../src/export/pdf';

const stroke = (extra: Partial<PathStroke> = {}): PathStroke => ({ color: '#112233', width: 4, join: 'round', cap: 'butt', ...extra });
const line = (id: string, st: PathStroke | null, extra: Partial<PathShape> = {}): PathShape => ({
  id,
  type: 'path',
  paths: [{ closed: false, points: [{ x: 10, y: 20 }, { x: 90, y: 20 }] }],
  fill: null,
  stroke: st,
  opacity: 1,
  ...extra,
});

function docWith(...frames: PathShape[][]): Doc {
  const doc = newDoc({ width: 100, height: 40, background: null });
  const l = Object.assign(newVectorLayer('Lines'), { id: 'L' });
  doc.drawings = {};
  l.cels = frames.map((shapes, i) => {
    doc.drawings[`d${i}`] = { id: `d${i}`, kind: 'vector', shapes };
    return { id: `c${i}`, start: i, length: 1, drawingId: `d${i}` };
  });
  doc.layers = [l];
  doc.length = frames.length;
  return doc;
}

function pdfText(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString('latin1');
  let out = '';
  const re = /stream\n([\s\S]*?)\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    try {
      out += Buffer.from(unzlibSync(Buffer.from(m[1], 'latin1'))).toString('latin1') + '\n';
    } catch {
      // not every stream is text
    }
  }
  return out;
}

describe('SVG', () => {
  it('writes real dashes', () => {
    const svg = frameToSvg(docWith([line('a', stroke({ dash: [3, 2] }))]), 0);
    expect(svg).toContain('stroke-dasharray="12 8"');
    expect(svg).not.toContain('stroke-dashoffset');
  });

  it('writes the offset when there is one, and dots as tiny dashes with round ends', () => {
    const svg = frameToSvg(docWith([line('a', stroke({ cap: 'round', dash: [0.01, 2], dashOffset: 1 }))]), 0);
    expect(svg).toContain('stroke-dasharray="0.04 8"');
    expect(svg).toContain('stroke-dashoffset="4"');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it('a plain line has no dash attributes at all, so old files are byte for byte what they were', () => {
    const svg = frameToSvg(docWith([line('a', stroke())]), 0);
    expect(svg).not.toContain('dash');
  });

  it('arrow heads are shapes of their own, and the line stops short of a solid one', () => {
    const svg = frameToSvg(docWith([line('a', stroke({ arrowEnd: 'triangle' }))]), 0);
    const paths = [...svg.matchAll(/<path d="([^"]+)"([^>]*)\/>/g)];
    expect(paths).toHaveLength(2);
    // The line: stroked, ends before x = 90. The head: filled, with the line's colour.
    expect(paths[0][2]).toContain('stroke="#112233"');
    expect(paths[1][2]).toContain('fill="#112233"');
    expect(paths[1][1]).toMatch(/^M90 20/);
    const lineEnd = /L(\d+(?:\.\d+)?) 20/.exec(paths[0][1]);
    expect(Number(lineEnd![1])).toBeLessThan(90);
  });

  it('a changing width is the filled outline of the line: no stroke left', () => {
    const svg = frameToSvg(docWith([line('a', stroke({ widths: [{ at: 0, w: 0.2 }, { at: 0.5, w: 1.5 }, { at: 1, w: 0.2 }] }))]), 0);
    expect(svg).toContain('fill="#112233"');
    expect(svg).not.toContain('stroke=');
  });

  it('the moving SVG keeps dashes and arrows too', () => {
    const svg = animatedSvg(docWith([line('a', stroke({ dash: [3, 2], arrowEnd: 'dot' }))]), {});
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toMatch(/fill="#112233"/);
  });
});

describe('PDF', () => {
  const pdf = (doc: Doc) => pdfText(writePdf(doc, { frames: [0], scale: 1, background: null, title: 'T' }));

  it('uses PDF\'s own dash operator, in document pixels', () => {
    expect(pdf(docWith([line('a', stroke({ dash: [3, 2], dashOffset: 1 }))]))).toContain('[12 8] 4 d');
  });

  it('writes no dash operator for a plain line', () => {
    expect(pdf(docWith([line('a', stroke())]))).not.toMatch(/\sd\n/);
  });

  it('cuts a dashed gradient line into dashes (PDF can only shade areas)', () => {
    const g = { kind: 'linear' as const, stops: [{ at: 0, color: '#ff0000' }, { at: 1, color: '#0000ff' }], from: { x: 0, y: 0 }, to: { x: 100, y: 0 } };
    const text = pdf(docWith([line('a', stroke({ dash: [3, 2] }), { strokeGradient: g })]));
    expect(text).not.toContain('] 0 d');
    // The dashes are in the shape that is shaded: several separate pieces, not one long line.
    expect((text.match(/ m\n/g) ?? []).length).toBeGreaterThan(3);
  });

  it('draws arrow heads as filled shapes', () => {
    const text = pdf(docWith([line('a', stroke({ arrowEnd: 'triangle' }))]));
    expect(text).toMatch(/90 20 m/);
    expect(text).toContain('f*');
  });
});

describe('Lottie', () => {
  const stroked = (shapes: unknown[]): any[] => (shapes as any[]).flatMap((g) => g.it ?? []).filter((i) => i.ty === 'st' || i.ty === 'gs');
  const groups = (doc: Doc): any[] => (docToLottie(doc).layers as any[]).flatMap((l) => l.shapes ?? []);

  it('writes real dashes: a dash, a gap, and an offset', () => {
    const st = stroked(groups(docWith([line('a', stroke({ dash: [3, 2], dashOffset: 1 }))])));
    expect(st).toHaveLength(1);
    expect(st[0].d.map((x: any) => [x.n, x.v.k])).toEqual([['d', 12], ['g', 8], ['o', 4]]);
  });

  it('a dash and dot pattern names every entry differently (lottie-web draws nothing when two share a name)', () => {
    const st = stroked(groups(docWith([line('a', stroke({ cap: 'round', dash: [4, 2, 0.01, 2] }))])));
    const names = st[0].d.map((x: any) => x.nm);
    expect(names).toEqual(['Dash', 'Gap', 'Dash 2', 'Gap 2', 'Offset']);
    expect(new Set(names).size).toBe(names.length);
    expect(st[0].d.map((x: any) => x.n)).toEqual(['d', 'g', 'd', 'g', 'o']);
  });

  it('a plain line has no dash list', () => {
    const st = stroked(groups(docWith([line('a', stroke())])));
    expect(st[0].d).toBeUndefined();
  });

  it('arrow heads are shapes of their own, one slot for the line and one for the head', () => {
    const g = groups(docWith([line('a', stroke({ arrowEnd: 'triangle' }))]));
    expect(g).toHaveLength(2);
    const kinds = g.map((x) => x.it.map((i: any) => i.ty).join(','));
    expect(kinds).toContain('sh,fl,tr');
    expect(kinds.some((k: string) => k.includes('st'))).toBe(true);
  });

  it('frames with and without an arrow keep the same slots, and the arrow fades where it is not', () => {
    const cols = expandLine({ tints: [] }, [line('a', stroke({ arrowEnd: 'triangle' })), line('a', stroke())]);
    // The line and the head, each on both frames.
    expect(cols).toHaveLength(2);
    expect(cols.every((c) => c.length === 2)).toBe(true);
    const head = cols.find((c) => (c[0][0] as any).look.fill)!;
    expect((head[0][0] as any).look.fill.o).toBe(100);
    expect((head[1][0] as any).look.fill.o).toBe(0);
  });

  it('a changing width becomes a filled outline: no stroke item for it', () => {
    const g = groups(docWith([line('a', stroke({ widths: [{ at: 0, w: 0.2 }, { at: 0.5, w: 1.5 }, { at: 1, w: 0.2 }] }))]));
    expect(stroked(g)).toHaveLength(0);
    expect(g.some((x) => x.it.some((i: any) => i.ty === 'fl'))).toBe(true);
  });
});

describe('Illustrator (.ai)', () => {
  /** The document part of a .ai, as text (the private streams Illustrator reads). */
  function aiText(bytes: Uint8Array): string {
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
    return Buffer.concat(parts).toString('utf8');
  }
  const ai = (doc: Doc) => aiText(writePdf(doc, { frames: [0], scale: 1, background: null, title: 'T', native: true }));

  it('keeps dashes as real dashes', () => {
    expect(ai(docWith([line('a', stroke({ dash: [3, 2], dashOffset: 1 }))]))).toContain('[12 8]4 d');
  });

  it('a plain line keeps the empty dash list it always had', () => {
    expect(ai(docWith([line('a', stroke())]))).toContain('[]0 d');
  });

  it('writes arrow heads as paths of their own', () => {
    const text = ai(docWith([line('a', stroke({ arrowEnd: 'triangle' }))]));
    expect((text.match(/\n[fFbBsS]\n/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
