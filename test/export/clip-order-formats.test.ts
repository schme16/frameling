// @vitest-environment jsdom
// Animated SVG, PNG sequence and PDF of a clip follow the way the clip plays, like GIF, APNG and video do.
import { describe, expect, it } from 'vitest';
import type { Doc, PathShape } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { animatedSvg, visibilityKeyframes } from '../../src/export/svg-anim';
import { defaultSettings, frameNumber, planExport, planFrames } from '../../src/export/plan';
import { writePdf } from '../../src/export/pdf';

const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];

/** Five frames, one red/green/blue/yellow/magenta box each, so a frame can be told from its colour. */
function boxes(): Doc {
  const doc = newDoc({ width: 50, height: 10, length: 5, fps: 10, background: '#ffffff' });
  const layer = newVectorLayer('Boxes');
  doc.drawings = {};
  layer.cels = COLORS.map((fill, i) => {
    const shape: PathShape = { id: `s${i}`, type: 'path', paths: [{ closed: true, points: [{ x: i * 10, y: 0 }, { x: i * 10 + 10, y: 0 }, { x: i * 10 + 10, y: 10 }, { x: i * 10, y: 10 }] }], fill, stroke: null, opacity: 1 };
    doc.drawings[`d${i}`] = { id: `d${i}`, kind: 'vector', shapes: [shape] };
    return { id: `c${i}`, start: i, length: 1, drawingId: `d${i}` };
  });
  doc.layers = [layer];
  doc.clips = [
    { id: 'pp', name: 'swing', start: 1, end: 3, loop: false, direction: 'pingpong', repeat: 2 },
    { id: 'rv', name: 'back', start: 0, end: 2, loop: true, direction: 'reverse' },
    { id: 'pl', name: 'plain', start: 0, end: 4, loop: true },
  ];
  return doc;
}

const doc = boxes();
const settings = (format: 'svganim' | 'pngseq' | 'pdf' | 'ai', clipId: string | null) => ({ ...defaultSettings(doc), format, range: clipId ? ('clip' as const) : ('all' as const), clipId });

describe('PNG sequence and PDF of a clip', () => {
  it('number and order the pictures in play order, the same count as the plan says', () => {
    const p = planExport(doc, settings('pngseq', 'pp'), 0);
    expect(p.order).toEqual([0, 1, 2, 1, 0, 1, 2, 1, 0]);
    expect(p.count).toBe(9);
    expect(planFrames(p)).toEqual([1, 2, 3, 2, 1, 2, 3, 2, 1]);
    expect(Array.from({ length: p.count }, (_, i) => frameNumber(i, p.count))[8]).toBe('0009');
  });

  it('a backward clip is numbered from its last frame', () => {
    const p = planExport(doc, settings('pngseq', 'rv'), 0);
    expect(planFrames(p)).toEqual([2, 1, 0]);
  });

  it('PDF pages (and Illustrator pages) come in play order', () => {
    for (const f of ['pdf', 'ai'] as const) {
      const frames = planFrames(planExport(doc, { ...settings(f, 'pp'), aiFrames: 'pages' }, 0));
      expect(frames).toEqual([1, 2, 3, 2, 1, 2, 3, 2, 1]);
      const text = Buffer.from(writePdf(doc, { frames, scale: 1, background: '#ffffff', title: 'T' })).toString('latin1');
      expect(text.match(/\/Type\s*\/Page\b/g)).toHaveLength(9);
    }
  });

  it('leave a plain clip and the whole animation as they were', () => {
    for (const f of ['pngseq', 'pdf'] as const) {
      expect(planExport(doc, settings(f, 'pl'), 0).order).toBeUndefined();
      expect(planExport(doc, settings(f, null), 0)).toMatchObject({ count: 5 });
      expect(planFrames(planExport(doc, settings(f, null), 0))).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it('a clip exported as one Illustrator frame is not baked', () => {
    const p = planExport(doc, { ...settings('ai', 'pp'), aiFrames: 'one' }, 2);
    expect(p.count).toBe(1);
    expect(p.order).toBeUndefined();
  });

  it('plugins can still ask for the plain range', () => {
    const p = planExport(doc, settings('pngseq', 'pp'), 0, { bake: false });
    expect(p.order).toBeUndefined();
    expect(p.count).toBe(3);
  });
});

describe('animated SVG of a clip', () => {
  const order = [0, 1, 2, 1, 0, 1, 2, 1, 0];
  const svg = animatedSvg(doc, { range: { start: 1, end: 3 }, order, loop: false });
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');

  it('lasts as long as the baked pictures, and stops when the clip does', () => {
    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(svg).toContain(`${9 / 10}s step-end 1 forwards`);
  });

  it('shows each frame at every moment the clip comes back to it', () => {
    const style = parsed.querySelector('style')!.textContent!;
    // The middle frame of the swing (document frame 2) is on at moments 1, 3, 5 and 7 of 9.
    expect(style).toContain(visibilityKeyframes([[1, 2], [3, 4], [5, 6], [7, 8]], 9));
    // The first (document frame 1) at moments 0, 4 and 8.
    expect(style).toContain(visibilityKeyframes([[0, 1], [4, 5], [8, 9]], 9));
    expect(style).toContain(visibilityKeyframes([[2, 3], [6, 7]], 9));
  });

  it('draws only the frames of the clip', () => {
    expect(svg).toContain('#00ff00');
    expect(svg).not.toContain('#ff0000');
    expect(svg).not.toContain('#ff00ff');
  });

  it('loops one trip for a looping back and forth clip, and is unchanged without an order', () => {
    const one = animatedSvg(doc, { range: { start: 1, end: 3 }, order: [0, 1, 2, 1] });
    expect(one).toContain(`${4 / 10}s step-end infinite`);
    const plain = animatedSvg(doc, { range: { start: 1, end: 3 } });
    expect(plain).toBe(animatedSvg(doc, { range: { start: 1, end: 3 }, order: [0, 1, 2] }));
    expect(plain).toContain(`${3 / 10}s step-end infinite`);
  });

  it('through the plan: a backward clip plays last frame first', () => {
    const p = planExport(doc, settings('svganim', 'rv'), 0);
    expect(p.order).toEqual([2, 1, 0]);
    const out = animatedSvg(doc, { range: p.range, order: p.order });
    // Document frame 0 is the last moment (index 2 of 3).
    expect(out).toContain(visibilityKeyframes([[2, 3]], 3));
  });
});
