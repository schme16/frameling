// Live text and real gradient lines in the Illustrator data of a .ai: what is written, so Illustrator keeps the text editable.
import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import type { Doc, Gradient, PathShape, TextShape } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { ascii85Lines, psFontName, textEngineData } from '../../src/export/ai-text';
import { writePdf } from '../../src/export/pdf';

const grad: Gradient = { kind: 'linear', from: { x: 10, y: 0 }, to: { x: 150, y: 0 }, stops: [{ at: 0, color: '#ff8800' }, { at: 1, color: '#0088ff' }] };

const text = (id: string, t: string, x: number, y: number, extra: Partial<TextShape> = {}): TextShape => ({
  id,
  type: 'text',
  text: t,
  font: 'Arial',
  size: 20,
  weight: 400,
  color: '#ff3366',
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  opacity: 1,
  transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 },
  ...extra,
});

function docWith(shapes: (TextShape | PathShape)[]): Doc {
  const doc = newDoc({ width: 320, height: 180, background: '#ffffff' });
  const l = Object.assign(newVectorLayer('Words'), { id: 'l' });
  l.cels = [{ id: 'c', start: 0, length: 1, drawingId: 'd' }];
  doc.drawings = { d: { id: 'd', kind: 'vector', shapes } };
  doc.layers = [l];
  doc.length = 1;
  return doc;
}

const ai = (doc: Doc, native = true) => writePdf(doc, { frames: [0], scale: 1, background: '#ffffff', title: 'T', native });

/** Every stream of the file, decoded where it is compressed. */
function streams(bytes: Uint8Array): string[] {
  const s = Buffer.from(bytes).toString('latin1');
  const out: string[] = [];
  const re = /<<([^\n]*?)>>\nstream\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const len = Number(/\/Length (\d+)/.exec(m[1])![1]);
    const raw = Buffer.from(bytes.subarray(m.index + m[0].length, m.index + m[0].length + len));
    out.push((/FlateDecode/.test(m[1]) ? Buffer.from(unzlibSync(raw)) : raw).toString('latin1'));
  }
  return out;
}

/** Illustrator's document text (the private data blocks joined). */
function illustratorDoc(bytes: Uint8Array): string {
  const all = streams(bytes);
  const i = all.findIndex((t) => t.startsWith('%!PS-Adobe'));
  // The header is the first; the document is every block after the preview block.
  const blocks = all.slice(i + 1).filter((t) => !t.startsWith('%PDF') && !t.startsWith('<?xpacket'));
  return blocks.join('').replace(/\r\n/g, '\n');
}

function a85decode(lines: string[]): string {
  const body = lines.map((l) => l.slice(1)).join('');
  const end = body.indexOf('~>');
  const src = body.slice(0, end);
  let out = '';
  let group: number[] = [];
  for (const ch of src) {
    if (ch === 'z') {
      out += '\0\0\0\0';
      continue;
    }
    group.push(ch.charCodeAt(0) - 33);
    if (group.length === 5) {
      let v = 0;
      for (const d of group) v = v * 85 + d;
      out += String.fromCharCode((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group = [];
    }
  }
  if (group.length) {
    const k = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const d of group) v = v * 85 + d;
    const four = String.fromCharCode((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
    out += four.slice(0, k - 1);
  }
  return out;
}

/** The text engine's document inside a .ai, decoded. */
function engine(bytes: Uint8Array): string {
  const doc = illustratorDoc(bytes);
  const a = doc.indexOf('/AI11TextDocument : /ASCII85Decode ,\n');
  const lines = doc.slice(a).split('\n').slice(1);
  const end = lines.findIndex((l) => l.includes('~>'));
  return a85decode(lines.slice(0, end + 1));
}

const utf16 = (s: string) => 'þÿ' + [...s].map((c) => String.fromCharCode(0, c.charCodeAt(0))).join('');

describe('font names', () => {
  it('spells the PostScript name the way Illustrator knows it', () => {
    expect(psFontName('Nunito', 800, false)).toBe('Nunito-ExtraBold');
    expect(psFontName('Nunito', 400, false)).toBe('Nunito-Regular');
    expect(psFontName('Nunito', 600, true)).toBe('Nunito-SemiBoldItalic');
    expect(psFontName('Inter', 400, true)).toBe('Inter-Italic');
    expect(psFontName('Source Sans Pro', 300, false)).toBe('SourceSansPro-Light');
    expect(psFontName('Arial', 400, false)).toBe('ArialMT');
    expect(psFontName('Arial', 700, false)).toBe('Arial-BoldMT');
    expect(psFontName('Arial', 700, true)).toBe('Arial-BoldItalicMT');
    expect(psFontName('Times New Roman', 400, true)).toBe('TimesNewRoman-ItalicPSMT');
    expect(psFontName('Verdana', 700, false)).toBe('Verdana-Bold');
    expect(psFontName('Nunito', 850, false)).toBe('Nunito-Black');
  });
});

describe('ASCII85', () => {
  it('decodes back to the bytes it was given, in lines Illustrator can read', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', 'hello þÿ\0\0\0\0 world', 'x'.repeat(1000)]) {
      const lines = ascii85Lines(s);
      expect(lines.every((l) => l.startsWith('%') && l.length <= 99)).toBe(true);
      expect(a85decode(lines)).toBe(s);
    }
  });
});

describe('live text in the Illustrator data', () => {
  const doc = () =>
    docWith([
      text('t1', 'Hello Illustrator', 10, 45, { size: 36, weight: 700 }),
      text('t2', 'Two lines\nof centred', 160, 90, { align: 'center', color: '#1d1b26', letterSpacing: 2, lineHeight: 1.5 }),
      text('t3', 'Italic', 10, 150, { font: 'Nunito', weight: 800, italic: true, opacity: 0.5, transform: { x: 10, y: 150, scaleX: 1.5, scaleY: 1.5, rotation: -12, skew: 0 } }),
    ]);

  it('writes a text frame for each text, with the words, the font, the size and the colour', () => {
    const bytes = ai(doc());
    const d = illustratorDoc(bytes);
    expect(d.match(/\/AI11Text :/g)).toHaveLength(3);
    expect(d).toContain('0 /StoryIndex ,');
    expect(d).toContain('2 /StoryIndex ,');
    expect(d).toContain('%AI11_BeginTextDocument');
    expect(d).toContain('%AI3_BeginEncoding: _Arial-BoldMT Arial-BoldMT');
    const e = engine(bytes);
    for (const w of ['Hello Illustrator\r', 'Two lines\rof centred\r', 'Italic\r']) expect(e).toContain(utf16(w));
    for (const f of ['Arial-BoldMT', 'ArialMT', 'NunitoItalic-ExtraBold']) expect(e).toContain(utf16(f));
    // Sizes are reals: the engine reads a whole number as something else.
    expect(e).toMatch(/\/1 36\.0 \/5 43\.2 \/8 0 /);
    expect(e).toContain('/53 << /99 /SimplePaint /0 << /0 1 /1 [ 1.0 1.0 0.2 0.4 ] >> >>');
    // Space between letters (2 of 20 is 100 thousandths), line spacing 1.5 of 20, centred.
    expect(e).toMatch(/\/1 20\.0 \/5 30\.0 \/8 100 /);
    expect(e).toContain('/5 << /0 2 >>');
  });

  it('puts each frame where the text is: the matrix carries the first baseline to its place, turned and sized', () => {
    const e = engine(ai(doc()));
    // Text at (10, 45) on a 180 high page: 10 across, 135 up, so the matrix moves by (10, -135) in the engine's y down space.
    expect(e).toContain('/2 << /2 [ 1.0 0.0 0.0 1.0 10.0 -135.0 ] >>');
    expect(e).toContain('/2 << /2 [ 1.0 0.0 0.0 1.0 160.0 -90.0 ] >>');
    // The third is scaled evenly by 1.5, so its font size is 30 (20 x 1.5) and the matrix only turns it: 12 degrees counter clockwise.
    expect(e).toMatch(/\/1 30\.0 \/5 36\.0/);
    expect(e).toMatch(/\/2 \[ 0\.978\d* -0\.207\d* 0\.207\d* 0\.978\d* -?\d+\.\d+ -?\d+\.\d+ \]/);
    // The frames sit at the text space's origin, and name their own ids.
    expect(e).toMatch(/\/0 \[ 8031\.5 8281\.5 \]/);
  });

  it('keeps the outlines in the PDF part, and marks the text there so other programs ignore it', () => {
    const bytes = ai(doc());
    const all = streams(bytes).join('\n');
    expect(all).toContain('/FrText << /I 1 >> BDC');
    expect(all).toContain('/FrText << /I 3 >> BDC');
    // Without a canvas there are no outlines to count, but the marker closes where the outlines would have been.
    expect(all.match(/\/FrText << \/I \d >> BDC/g)).toHaveLength(3);
  });

  it('adds nothing for text in a plain PDF or the Pages way', () => {
    const plain = streams(ai(doc(), false)).join('\n');
    expect(plain).not.toContain('FrText');
    expect(Buffer.from(ai(doc(), false)).toString('latin1')).not.toContain('AI11Text');
  });

  it('leaves text that changes from frame to frame as outlines, and empty text out', () => {
    const moving = text('t1', 'Wiggle', 10, 45, { animators: [{ id: 'a', kind: 'fade', by: 'letter', start: 0, duration: 5, stagger: 1, amount: 0 }] });
    expect(illustratorDoc(ai(docWith([moving])))).not.toContain('AI11Text');
    expect(illustratorDoc(ai(docWith([text('t2', '   ', 10, 45)])))).not.toContain('AI11Text');
  });

  it('has balanced brackets, and every whole number where the engine wants one', () => {
    const e = engine(ai(doc()));
    const text = e.replace(/\((?:[^()\\]|\\.)*\)/g, '()');
    expect((text.match(/<</g) ?? []).length).toBe((text.match(/>>/g) ?? []).length);
    expect((text.match(/\[/g) ?? []).length).toBe((text.match(/\]/g) ?? []).length);
  });

  it('textEngineData on its own: one story and one frame per text', () => {
    const data = textEngineData([{ text: 'A\nB', font: 'ArialMT', size: 12, rgb: [0, 0, 0], align: 0, leading: 14.4, tracking: 0, m: [1, 0, 0, 1, 5, -5] }], [8031, 8281]);
    expect(data).toContain(utf16('A\rB\r'));
    expect(data.match(/\/99 \/PC|\/99 \/F\b/g)).toBeNull();
  });
});

describe('gradient lines in the Illustrator data', () => {
  const line = (): PathShape => ({
    id: 'p',
    type: 'path',
    paths: [{ closed: false, points: [{ x: 20, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 60 }] }],
    fill: null,
    stroke: { color: '#000000', width: 14, join: 'round', cap: 'butt' },
    strokeGradient: grad,
    opacity: 0.8,
  });

  it('writes one path with a gradient stroke, not an outline filled with the gradient', () => {
    const d = illustratorDoc(ai(docWith([line()])));
    // The path's own points, 14 wide, round joins and butt caps, then the gradient for the line (1 Bb ... 2 BB) ending in the stroke operator.
    expect(d).toMatch(/0 J 1 j 14 w 10 M \[\]0 d\n0 XR\n20 160 m\n100 160 L\n100 120 L\n1 Bb\n1 \(Frameling gradient 1\) [^\n]* Bg\n[^\n]* Xm\n[^\n]* Bc\n[^\n]* Bm\n[^\n]* Bc\nS\n2 BB\n/);
    expect(d).toContain('0 0.8 0 0 0 Xy');
    // No second path made of the line's outline.
    expect(d.match(/\n1 Bb\n/g)).toHaveLength(1);
    expect(d).toContain('%AI5_BeginGradient: (Frameling gradient 1)');
  });

  it('a closed shape takes a closed stroke, and a filled gradient shape still takes its fill', () => {
    const shape: PathShape = { ...line(), fill: '#ffffff', fillGradient: grad, paths: [{ closed: true, points: [{ x: 20, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 60 }] }] };
    const d = illustratorDoc(ai(docWith([shape])));
    expect(d.match(/\nBb\n/g)).toHaveLength(1);
    expect(d.match(/\n1 Bb\n/g)).toHaveLength(1);
    expect(d).toMatch(/\n1 Bb\n[\s\S]*?\ns\n2 BB\n/);
  });

  it('leaves the outline in the PDF part', () => {
    const all = streams(ai(docWith([line()]))).join('\n');
    expect(all).toContain('/FrStroke << /I 1 >> BDC');
    expect(all).toMatch(/\/FrStroke << \/I 1 >> BDC\nq[\s\S]*?\nW n \/Sh\d+ sh\nQ\nEMC/);
  });
});
