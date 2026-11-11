// Looks (blend modes, effects, clipping, masks, folders) on a symbol's own layers: posed for the renderer, cached
// per symbol frame and scale, and carried by the SVG, Lottie and PDF writers.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import type { Doc, InstanceShape, LayerEffect, VectorLayer } from '../../src/core/format';
import { newDoc, uid } from '../../src/core/doc';
import { isPosed, poseAt, type PosedInstance } from '../../src/core/symbols';
import { drawingBox, effectReach, lookStats, renderFrame } from '../../src/core/render';
import { defaultValues } from '../../src/effects/model';
import { frameToSvg } from '../../src/export/svg';
import { animatedSvg } from '../../src/export/svg-anim';
import { lottieExport } from '../../src/export/lottie';
import { washColor, writePdf } from '../../src/export/pdf';
import { flatPlan, needsPicture } from '../../src/export/layered';
import { carryWarnings } from '../../src/export/carries';
import { addVectorLayer, ellipsePath, fill, hold, rectPath, vectorDrawing } from '../../src/templates/build';
import { installFakeCanvas, mainCtx, removeFakeCanvas } from '../perf/fakeCanvas';

const fx = (kind: LayerEffect['kind'], values: Record<string, number | string> = {}): LayerEffect => ({ id: uid('e'), kind, values: { ...defaultValues(kind), ...values } });

/** A stage with one copy of a symbol (two layers inside: a disc and a square on top) gliding across 8 frames. */
function make(look: (disc: VectorLayer, top: VectorLayer) => void, tint?: InstanceShape['tint']): Doc {
  const doc = newDoc({ width: 200, height: 100, length: 8, fps: 12 });
  doc.layers = [];
  const disc = addVectorLayer(doc, 'Disc');
  hold(disc, vectorDrawing(doc, [fill([ellipsePath(0, 0, 20, 20)], '#5ab8ff')]).id, 0, 2);
  const top = addVectorLayer(doc, 'Top');
  hold(top, vectorDrawing(doc, [fill([rectPath(-10, -10, 20, 20)], '#ff0000')]).id, 0, 2);
  look(disc, top);
  doc.symbols = { s: { id: 's', name: 'Badge', layers: [disc, top], length: 2, origin: { x: 0, y: 0 } } };
  doc.layers = [];
  const l = addVectorLayer(doc, 'Copies');
  const inst = (x: number): InstanceShape => ({ id: 'i1', type: 'instance', symbolId: 's', transform: { x, y: 50, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0, ...(tint ? { tint } : {}) });
  const a = vectorDrawing(doc, []);
  a.shapes = [inst(40)];
  const b = vectorDrawing(doc, []);
  b.shapes = [inst(160)];
  hold(l, a.id, 0, 7);
  hold(l, b.id, 7, 1);
  l.cels[0].tween = { ease: 'linear' };
  return doc;
}

const posedAt = (doc: Doc, f: number) => {
  const d = poseAt(doc, doc.layers[0], f);
  return (d?.kind === 'vector' ? d.shapes[0] : undefined) as PosedInstance;
};

describe('posing a symbol with looks inside', () => {
  it('has no look when its layers are plain', () => {
    const p = posedAt(make(() => {}), 0);
    expect(isPosed(p)).toBe(true);
    expect(p.posed.look).toBeUndefined();
    expect(p.posed.layers.length).toBe(2);
  });

  it('carries every shown layer by id, masks too, but leaves masks out of the plain list', () => {
    const p = posedAt(
      make((_, top) => {
        top.mask = 'hide';
      }),
      3,
    );
    expect(p.posed.look).toBeDefined();
    expect(p.posed.look!.drawings.size).toBe(2);
    expect(p.posed.layers.length).toBe(1);
    // Symbol frame 3 of a 2 frame loop is its frame 1.
    expect(p.posed.look!.frame).toBe(1);
  });
});

describe('the renderer', () => {
  beforeEach(() => installFakeCanvas());
  afterEach(() => removeFakeCanvas());

  it('builds one picture per symbol frame and reuses it while the copy glides', () => {
    const doc = make((disc, top) => {
      disc.effects = [fx('glow', { size: 6 })];
      top.blend = 'multiply';
    });
    const built = lookStats.built;
    const reused = lookStats.reused;
    for (let f = 0; f < 8; f++) renderFrame(mainCtx(), doc, f);
    // Two symbol frames, one scale.
    expect(lookStats.built - built).toBe(2);
    expect(lookStats.reused - reused).toBe(6);
  });

  it('sizes the picture to the drawings plus how far the effects reach', () => {
    expect(effectReach('blur', { radius: 3 })).toBe(9);
    expect(effectReach('shadow', { x: -4, y: 2, softness: 2 })).toBe(7);
    expect(effectReach('adjust', { hue: 30 })).toBe(0);
    const d = vectorDrawing(newDoc({}), [fill([rectPath(-10, 5, 20, 10)], '#000000')]);
    expect(drawingBox(d)).toEqual({ x0: -10, y0: 5, x1: 10, y1: 15 });
  });
});

describe('exports', () => {
  it('SVG composites the symbol layers inside the copy, isolated', () => {
    const doc = make((disc, top) => {
      disc.effects = [fx('blur', { radius: 2 })];
      top.blend = 'multiply';
    });
    for (const svg of [frameToSvg(doc, 0), animatedSvg(doc)]) {
      expect(svg).toContain('mix-blend-mode:multiply');
      expect(svg).toContain('<feGaussianBlur');
      expect(svg).toMatch(/<g transform="matrix\([^"]*\)"><g style="isolation:isolate">/);
    }
  });

  it('SVG keeps a mask inside a symbol', () => {
    const svg = frameToSvg(
      make((_, top) => {
        top.mask = 'show';
      }),
      0,
    );
    expect(svg).toContain('<mask id=');
  });

  it('Lottie writes blend modes, effects and mattes in the symbol precomp, with no camera inside', () => {
    const doc = make((disc, top) => {
      disc.effects = [fx('shadow', { x: 3, y: 3 })];
      top.blend = 'multiply';
    });
    const { data } = lottieExport(doc);
    const sym = data.assets.find((a: { id: string }) => a.id.startsWith('symbol_'));
    const s = JSON.stringify(sym);
    expect(sym.layers.some((l: { bm?: number }) => l.bm === 1)).toBe(true);
    expect(s).toContain('"ty":25');
    expect(s).not.toContain('Camera');
    const masked = make((_, top) => {
      top.mask = 'hide';
    });
    expect(JSON.stringify(lottieExport(masked).data.assets)).toContain('"td":1');
  });

  it('PDF keeps blend modes inside a symbol in an isolated group', () => {
    const doc = make((_, top) => {
      top.blend = 'multiply';
    });
    expect(flatPlan(doc, 0)[0].kind).toBe('vector');
    const text = inflate(writePdf(doc, { frames: [0], scale: 1, background: null, title: 't' }));
    expect(text).toContain('/BM /Multiply');
    expect(text).toContain('/I true');
  });

  it('PDF makes a layer holding a symbol with effects, clipping or masks inside a picture', () => {
    for (const look of [(d: VectorLayer) => (d.effects = [fx('blur')]), (_: VectorLayer, t: VectorLayer) => (t.clipToBelow = true), (_: VectorLayer, t: VectorLayer) => (t.mask = 'show' as const)]) {
      const doc = make(look as (a: VectorLayer, b: VectorLayer) => void);
      expect(needsPicture(doc.layers[0], 0, doc)).toBe(true);
    }
    expect(needsPicture(make(() => {}).layers[0], 0, make(() => {}))).toBe(false);
  });

  it('PDF recolours a tinted copy, as the canvas washes it', () => {
    expect(washColor({ r: 1, g: 0, b: 0, a: 1 }, [{ r: 0, g: 0, b: 1, t: 0.5 }])).toEqual({ r: 0.5, g: 0, b: 0.5, a: 1 });
    // Innermost first: a full wash then half of another.
    expect(washColor({ r: 1, g: 1, b: 1, a: 0.4 }, [{ r: 0, g: 0, b: 0, t: 1 }, { r: 1, g: 0, b: 0, t: 0.5 }])).toEqual({ r: 0.5, g: 0, b: 0, a: 0.4 });
    const doc = make(() => {}, { color: '#00ff00', amount: 0.5 });
    const text = inflate(writePdf(doc, { frames: [0], scale: 1, background: null, title: 't' }));
    // The red square (1 0 0) washed half way to green.
    expect(text).toContain('0.5 0.5 0 rg');
    expect(text).not.toContain('1 0 0 rg');
    expect(carryWarnings(doc, 'pdf')).toEqual([]);
  });
});

function inflate(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString('latin1');
  let out = '';
  const re = /stream\n([\s\S]*?)\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    try {
      out += Buffer.from(unzlibSync(Buffer.from(m[1], 'latin1'))).toString('latin1') + '\n';
    } catch {
      // Not every stream is compressed text.
    }
  }
  return s + '\n' + out;
}
