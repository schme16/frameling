import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { celAt, pixelGrid } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { renderFrame } from '../../src/core/render';
import { TEMPLATES } from '../../src/templates';

// Node has no canvas, so the renderer gets a context that just writes down what it was asked to do.
const calls: string[] = [];

function fakeCtx(): any {
  const props: Record<string, unknown> = {};
  return new Proxy(props, {
    get(_t, name: string) {
      if (name in props) return props[name];
      if (name === 'getTransform') return () => ({});
      return (...args: unknown[]) => void calls.push(`${name}:${args.length}`);
    },
    set(_t, name: string, v) {
      props[name] = v;
      return true;
    },
  });
}

class FakePath2D {
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  closePath() {}
}
class FakeOffscreen {
  constructor(public width: number, public height: number) {}
  getContext() {
    return fakeCtx();
  }
}
class FakeImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}

beforeAll(() => {
  vi.stubGlobal('Path2D', FakePath2D);
  vi.stubGlobal('OffscreenCanvas', FakeOffscreen);
  vi.stubGlobal('ImageData', FakeImageData);
});
afterAll(() => vi.unstubAllGlobals());

function ids(doc: Doc): string[] {
  const out: string[] = [];
  for (const l of doc.layers) {
    out.push(l.id);
    for (const c of l.cels) out.push(c.id);
  }
  for (const d of Object.values(doc.drawings)) {
    out.push(d.id);
    if (d.kind === 'vector') for (const s of d.shapes) out.push(s.id);
  }
  for (const c of doc.clips) out.push(c.id);
  for (const m of doc.markers) out.push(m.id);
  return out;
}

describe('templates', () => {
  it('has the expected set with unique ids', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(['bouncing-ball', 'flour-sack-hop', 'blink', 'hero-sprites', 'sparkle-fx', 'tileset', 'blank-vector', 'blank-pixel']);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.blurb).toMatch(/Try it:/);
    }
  });

  for (const t of TEMPLATES) {
    describe(t.name, () => {
      const doc = t.make();

      it('is a valid document', () => {
        expect(doc.format).toBe('frameling');
        expect(doc.length).toBeGreaterThanOrEqual(1);
        expect(doc.fps).toBeGreaterThan(0);
        expect(doc.layers.length).toBeGreaterThan(0);
        expect(new Set(doc.layers.map((l) => l.name)).size).toBe(doc.layers.length);
        // Pixel templates may use tilemap layers too (tiles are pixel art).
        expect(doc.layers.every((l) => (t.kind === 'pixel' ? l.kind !== 'vector' : l.kind === 'vector'))).toBe(true);
        const all = ids(doc);
        expect(new Set(all).size).toBe(all.length);
        expect(doc.swatches.length).toBeGreaterThan(0);
      });

      it('has sorted cels that never overlap and stay inside the length', () => {
        for (const layer of doc.layers) {
          let end = 0;
          for (const c of layer.cels) {
            expect(c.length).toBeGreaterThan(0);
            expect(c.start).toBeGreaterThanOrEqual(end);
            end = c.start + c.length;
            expect(end).toBeLessThanOrEqual(doc.length);
          }
        }
      });

      it('references every drawing and every cel finds its drawing', () => {
        const used = new Set<string>();
        for (const layer of doc.layers) {
          for (const c of layer.cels) {
            const d = doc.drawings[c.drawingId];
            expect(d, `cel ${c.id} on ${layer.name}`).toBeDefined();
            expect(d.kind).toBe(layer.kind);
            used.add(c.drawingId);
          }
        }
        for (const tile of doc.tileset?.tiles ?? []) for (const f of tile.frames) used.add(f.drawingId);
        expect(Object.keys(doc.drawings).filter((id) => !used.has(id))).toEqual([]);
      });

      it('keeps clips and markers inside the length', () => {
        for (const c of doc.clips) {
          expect(c.start).toBeGreaterThanOrEqual(0);
          expect(c.end).toBeGreaterThanOrEqual(c.start);
          expect(c.end).toBeLessThan(doc.length);
        }
        for (const m of doc.markers) {
          expect(m.frame).toBeGreaterThanOrEqual(0);
          expect(m.frame).toBeLessThan(doc.length);
        }
        const thumb = t.thumbnail?.() ?? 0;
        expect(thumb).toBeGreaterThanOrEqual(0);
        expect(thumb).toBeLessThan(doc.length);
      });

      it('makes a new document each time', () => {
        const again = t.make();
        expect(again.id).not.toBe(doc.id);
      });

      it('renders every frame', () => {
        for (let f = 0; f < doc.length; f++) {
          calls.length = 0;
          const g = fakeCtx();
          expect(() => renderFrame(g, doc, f)).not.toThrow();
          const blank = t.id.startsWith('blank');
          if (!blank) expect(calls.some((c) => c.startsWith('fill:') || c.startsWith('drawImage:'))).toBe(true);
        }
      });

      if (t.kind === 'pixel') {
        it('has pixel drawings sized to the grid, with art in them', () => {
          for (const layer of doc.layers) {
            if (layer.kind !== 'pixel') continue;
            const grid = pixelGrid(doc, layer);
            for (const c of layer.cels) {
              const d = doc.drawings[c.drawingId];
              if (d.kind !== 'pixel') throw new Error('not pixel');
              expect([d.width, d.height]).toEqual([grid.width, grid.height]);
              expect(d.pixels.length).toBe(grid.width * grid.height * 4);
              if (!t.id.startsWith('blank')) expect(d.pixels.some((v) => v > 0)).toBe(true);
            }
          }
        });
      }
    });
  }

  describe('the story each one tells', () => {
    const doc = (id: string) => TEMPLATES.find((t) => t.id === id)!.make();

    it('bouncing ball: 16 frames at 12 fps, a held ground and a bounce clip', () => {
      const d = doc('bouncing-ball');
      expect([d.width, d.height, d.fps, d.length]).toEqual([1280, 720, 12, 16]);
      const ground = d.layers.find((l) => l.name === 'Ground')!;
      expect(ground.cels).toHaveLength(1);
      expect(ground.cels[0].length).toBe(16);
      expect(d.clips.find((c) => c.name === 'bounce')).toMatchObject({ start: 0, end: 15, loop: true });
      // The ball is lowest on the contact frame.
      const ball = d.layers.find((l) => l.name === 'Ball')!;
      const top = (f: number) => {
        const dr = d.drawings[celAt(ball, f)!.drawingId];
        if (dr.kind !== 'vector' || dr.shapes[0].type !== 'fill') throw new Error('shape');
        return dr.shapes[0].paths[0].points[0].y;
      };
      expect(top(8)).toBeGreaterThan(top(0));
      expect(top(8)).toBeGreaterThan(top(4));
    });

    it('blink: a 3-frame key on a 24-frame hold', () => {
      const d = doc('blink');
      expect(d.length).toBe(24);
      const eyes = d.layers.find((l) => l.name === 'Eyes')!;
      expect(eyes.cels.map((c) => c.length)).toEqual([21, 1, 1, 1]);
      expect(d.layers.filter((l) => l !== eyes).every((l) => l.cels.length === 1 && l.cels[0].length === 24)).toBe(true);
    });

    it('flour sack: the opening and closing idle share a drawing', () => {
      const d = doc('flour-sack-hop');
      const sack = d.layers.find((l) => l.name === 'Sack')!;
      expect(sack.cels[0].drawingId).toBe(sack.cels[sack.cels.length - 1].drawingId);
      expect(d.markers.map((m) => m.name)).toEqual(['launch', 'land']);
    });

    it('hero: idle 4, run 6, jump 3 and footsteps on run contacts', () => {
      const d = doc('hero-sprites');
      const len = (n: string) => {
        const c = d.clips.find((x) => x.name === n)!;
        return c.end - c.start + 1;
      };
      expect([len('idle'), len('run'), len('jump')]).toEqual([4, 6, 3]);
      const run = d.clips.find((c) => c.name === 'run')!;
      const steps = d.markers.filter((m) => m.name === 'footstep');
      expect(steps.length).toBeGreaterThanOrEqual(2);
      expect(steps.every((m) => m.frame >= run.start && m.frame <= run.end)).toBe(true);
      const layer = d.layers.find((l) => l.kind === 'pixel')!;
      expect(layer.kind === 'pixel' && layer.pixelSize).toBe(8);
      expect(pixelGrid(d, layer as never)).toEqual({ width: 32, height: 32 });
    });

    it('sparkle: 6 frames on a 16x16 grid with pixelSize 16', () => {
      const d = doc('sparkle-fx');
      expect(d.length).toBe(6);
      const layer = d.layers[0];
      expect(layer.kind === 'pixel' && layer.pixelSize).toBe(16);
      expect(pixelGrid(d, layer as never)).toEqual({ width: 16, height: 16 });
      expect(d.clips[0]).toMatchObject({ name: 'burst', start: 0, end: 5, loop: true });
    });
  });
});
