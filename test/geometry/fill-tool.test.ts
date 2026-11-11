import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing, newPixelDrawing, uid } from '../../src/core/doc';
import type { Doc, FillShape, Shape, VectorDrawing, PixelDrawing } from '../../src/core/format';
import { getHelp, getTool, type ToolContext, type ToolPointer } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { EDIT_HINTS } from '../../src/tools/edit';
import { FILL_HINTS, indexBelowLines } from '../../src/tools/fill';
import { setFillOptions } from '../../src/tools/fill-options';
import { DEFAULT_PIXEL_SETTINGS, setPixelSettings } from '../../src/pixel/settings';
import { arc, brokenCircle, stroke } from './helpers';

function ptr(x: number, y: number): ToolPointer {
  return { x, y, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 };
}
function setup(shapes: Shape[], size = { width: 600, height: 600 }) {
  const doc = newDoc({ ...size });
  const d = newVectorDrawing();
  d.shapes = shapes;
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: uid('c'), start: 0, length: 1, drawingId: d.id });
  const s = resetStore(doc);
  const hints: string[] = [];
  let overlays = 0;
  const ctx: ToolContext = { zoom: 1, requestOverlay: () => void overlays++, hint: (m) => void hints.push(m) };
  return { s, hints, ctx, drawing: () => store().get().doc.drawings[d.id] as VectorDrawing, overlays: () => overlays };
}
const tool = () => getTool('fill')!;
const ring = (cx = 300, cy = 300, r = 100) => stroke(arc(cx, cy, r, 0, Math.PI * 2 + 0.2), 8);

beforeEach(() => setFillOptions({ gap: 'small', onTop: false, allOfColour: false }));

describe('paint bucket tool', () => {
  it('registers with the key, icon, both layer kinds and help', () => {
    const t = tool();
    expect(t.key).toBe('g');
    expect(t.icon).toBe('fill');
    expect(t.layers).toEqual(['vector', 'pixel']);
    expect(t.options).toBeTypeOf('function');
    expect(getHelp('fill')?.body).toContain('Close gaps');
    expect(getHelp('fill-gaps')?.title).toBe('Closing gaps');
    expect(t.help).toBe('fill');
  });

  it('adds a fill behind the lines, in the current colour, and pops', () => {
    const t = setup([ring()]);
    t.s.setUi({ fillColor: '#ff6f91' });
    tool().down!(ptr(300, 300), t.ctx);
    const shapes = t.drawing().shapes;
    expect(shapes).toHaveLength(2);
    expect(shapes[0].type).toBe('fill');
    expect(shapes[1].type).toBe('stroke');
    expect((shapes[0] as FillShape).color).toBe('#ff6f91');
    expect(t.hints).toEqual([]);
    expect(t.overlays()).toBeGreaterThan(0);
    // One undo step.
    t.s.undo();
    expect(t.drawing().shapes).toHaveLength(1);
  });

  it('closes small gaps by default and says so when they are too big', () => {
    const t = setup(brokenCircle(300, 300, 100, 4, 10));
    tool().down!(ptr(300, 300), t.ctx);
    expect(t.drawing().shapes[0].type).toBe('fill');
    setFillOptions({ gap: 'none' });
    const u = setup(brokenCircle(300, 300, 100, 4, 10));
    tool().down!(ptr(300, 300), u.ctx);
    expect(u.drawing().shapes).toHaveLength(4);
    expect(u.hints).toEqual([FILL_HINTS.leak]);
    expect(FILL_HINTS.leak).toBe("That area isn't closed in. Try a bigger gap setting, or close the gap.");
  });

  it('says so when the click is on a line', () => {
    const t = setup([ring()]);
    tool().down!(ptr(400, 300), t.ctx);
    expect(t.hints).toEqual([FILL_HINTS['on-line']]);
    expect(t.drawing().shapes).toHaveLength(1);
  });

  it('recolours an existing fill instead of stacking another', () => {
    const t = setup([ring()]);
    tool().down!(ptr(300, 300), t.ctx);
    t.s.setUi({ fillColor: '#5ab8ff' });
    tool().down!(ptr(250, 320), t.ctx);
    const shapes = t.drawing().shapes;
    expect(shapes).toHaveLength(2);
    expect((shapes[0] as FillShape).color).toBe('#5ab8ff');
    // Same colour again changes nothing.
    tool().down!(ptr(250, 320), t.ctx);
    expect(t.hints).toEqual([FILL_HINTS.same]);
  });

  it('a line drawn across old paint splits it: the new paint covers one side only, above the old, under the lines', () => {
    const t = setup([ring()]);
    tool().down!(ptr(300, 300), t.ctx);
    t.s.update('Draw', (d) => {
      const dr = Object.values(d.drawings)[0] as VectorDrawing;
      dr.shapes.push(stroke([[190, 300], [410, 300]], 8) as never);
    });
    t.s.setUi({ fillColor: '#4fd1a5' });
    tool().down!(ptr(300, 220), t.ctx);
    const kinds = t.drawing().shapes.map((s) => s.type);
    expect(kinds).toEqual(['fill', 'fill', 'stroke', 'stroke']);
    expect((t.drawing().shapes[0] as FillShape).color).not.toBe('#4fd1a5');
    expect((t.drawing().shapes[1] as FillShape).color).toBe('#4fd1a5');
  });

  it('"Fill on top" puts the paint above the lines', () => {
    setFillOptions({ onTop: true });
    const t = setup([ring()]);
    tool().down!(ptr(300, 300), t.ctx);
    expect(t.drawing().shapes.map((s) => s.type)).toEqual(['stroke', 'fill']);
  });

  it('finds the place under the lowest line', () => {
    const f: Shape = { id: 'a', type: 'fill', paths: [], color: '#000', opacity: 1 };
    expect(indexBelowLines([f, f, stroke([[0, 0], [1, 1]]), f])).toBe(2);
    expect(indexBelowLines([f, f])).toBe(2);
    expect(indexBelowLines([])).toBe(0);
  });

  it('explains locked and hidden layers, and an empty frame', () => {
    const t = setup([ring()]);
    t.s.update('Lock', (d) => void (d.layers[0].locked = true));
    tool().down!(ptr(300, 300), t.ctx);
    expect(t.hints).toEqual([EDIT_HINTS.locked]);
    const u = setup([ring()]);
    u.s.update('Hide', (d) => void (d.layers[0].visible = false));
    tool().down!(ptr(300, 300), u.ctx);
    expect(u.hints).toEqual([EDIT_HINTS.hidden]);
    const v = setup([ring()]);
    v.s.setUi({ frame: 5 });
    tool().down!(ptr(300, 300), v.ctx);
    expect(v.hints).toEqual([FILL_HINTS['no-drawing']]);
  });

  describe('on a pixel layer', () => {
    function pixelSetup() {
      const doc: Doc = newDoc({ width: 8, height: 8, pixel: { pixelSize: 1 } });
      const d = newPixelDrawing(8, 8);
      // A black wall down the middle: column 4.
      for (let y = 0; y < 8; y++) d.pixels.set([0, 0, 0, 255], (y * 8 + 4) * 4);
      doc.drawings[d.id] = d;
      doc.layers[0].cels.push({ id: uid('c'), start: 0, length: 1, drawingId: d.id });
      const s = resetStore(doc);
      const hints: string[] = [];
      const ctx: ToolContext = { zoom: 1, requestOverlay: () => {}, hint: (m) => void hints.push(m) };
      return { s, hints, ctx, drawing: () => store().get().doc.drawings[d.id] as PixelDrawing, before: d.pixels };
    }
    it('fills the joined-up area only, with a new array', () => {
      const t = pixelSetup();
      t.s.setUi({ fillColor: '#ff0000' });
      tool().down!(ptr(1, 1), t.ctx);
      const px = t.drawing().pixels;
      expect(px).not.toBe(t.before);
      expect([...px.slice(0, 4)]).toEqual([255, 0, 0, 255]);
      expect([...px.slice(5 * 4, 5 * 4 + 4)]).toEqual([0, 0, 0, 0]);
      expect([...t.before.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    });
    it('all of this colour reaches the other side too', () => {
      setFillOptions({ allOfColour: true });
      const t = pixelSetup();
      t.s.setUi({ fillColor: '#ff0000' });
      tool().down!(ptr(1, 1), t.ctx);
      expect([...t.drawing().pixels.slice(5 * 4, 5 * 4 + 4)]).toEqual([255, 0, 0, 255]);
    });
    it('fills the mirrored spot too when mirror drawing is on', () => {
      setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS, symmetry: 'h' });
      try {
        const t = pixelSetup();
        t.s.setUi({ fillColor: '#ff0000' });
        // Left of the wall at column 1; its mirror (line at 4) is column 6, right of the wall.
        tool().down!(ptr(1, 1), t.ctx);
        const px = t.drawing().pixels;
        expect([...px.slice(0, 4)]).toEqual([255, 0, 0, 255]);
        expect([...px.slice(6 * 4, 6 * 4 + 4)]).toEqual([255, 0, 0, 255]);
        expect([...px.slice(4 * 4, 4 * 4 + 4)]).toEqual([0, 0, 0, 255]);
        // One undo step for both halves.
        t.s.undo();
        expect(t.drawing().pixels).toBe(t.before);
      } finally {
        setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
      }
    });
    it('a mirrored fill that lands in the same area fills it once', () => {
      setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS, symmetry: 'v' });
      try {
        const t = pixelSetup();
        t.s.setUi({ fillColor: '#ff0000' });
        tool().down!(ptr(1, 1), t.ctx);
        const px = t.drawing().pixels;
        expect([...px.slice((7 * 8 + 1) * 4, (7 * 8 + 1) * 4 + 4)]).toEqual([255, 0, 0, 255]);
        expect([...px.slice(5 * 4, 5 * 4 + 4)]).toEqual([0, 0, 0, 0]);
      } finally {
        setPixelSettings({ ...DEFAULT_PIXEL_SETTINGS });
      }
    });
    it('says so when the area is already that colour', () => {
      const t = pixelSetup();
      t.s.setUi({ fillColor: '#000000' });
      tool().down!(ptr(4, 3), t.ctx);
      expect(t.hints).toEqual([FILL_HINTS.same]);
    });
  });
});
