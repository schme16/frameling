// Nested folders drawn for real through the compositor, on a one-pixel stand-in canvas that does the maths of
// source-over, multiply and the mask operations. Checks that each folder's opacity and blend apply on its own level.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Doc, Layer } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { compositePlan } from '../../src/effects/composite';
import { buildPlan } from '../../src/effects/plan';
import * as edit from '../../src/effects/edit';

type RGBA = [number, number, number, number];

class Px {
  px: RGBA = [0, 0, 0, 0];
  width = 1;
  height = 1;
  getContext() {
    return new PxCtx(this);
  }
}

function parse(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

class PxCtx {
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  fillStyle = '#000000';
  filter = 'none';
  imageSmoothingEnabled = true;
  private stack: [number, string][] = [];
  constructor(public canvas: Px) {}
  save() {
    this.stack.push([this.globalAlpha, this.globalCompositeOperation]);
  }
  restore() {
    [this.globalAlpha, this.globalCompositeOperation] = this.stack.pop()!;
  }
  setTransform() {}
  getTransform() {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }
  clearRect() {
    this.canvas.px = [0, 0, 0, 0];
  }
  fillRect() {
    this.put([...parse(this.fillStyle), 1]);
  }
  drawImage(src: Px) {
    this.put(src.px);
  }
  private put(s: RGBA) {
    const d = this.canvas.px;
    const as = s[3] * this.globalAlpha;
    const ad = d[3];
    const op = this.globalCompositeOperation;
    if (op === 'destination-in') return void (d[3] = ad * as);
    if (op === 'destination-out') return void (d[3] = ad * (1 - as));
    const ao = as + ad - as * ad;
    const out: RGBA = [0, 0, 0, ao];
    for (let k = 0; k < 3; k++) {
      const b = op === 'multiply' ? s[k] * d[k] : s[k];
      const co = as * (1 - ad) * s[k] + as * ad * b + (1 - as) * ad * d[k];
      out[k] = ao > 0 ? co / ao : 0;
    }
    this.canvas.px = out;
  }
}

beforeEach(() => vi.stubGlobal('OffscreenCanvas', Px));
afterEach(() => vi.unstubAllGlobals());

const colours: Record<string, string> = { a: '#808080', b: '#ff0000', c: '#00ff00', d: '#0000ff' };

/** Draws the doc's layers (each a flat colour) and returns the pixel. */
function draw(doc: Doc): RGBA {
  const target = new Px();
  const g = target.getContext();
  compositePlan(g as never, doc, 0, buildPlan(doc, (l: Layer) => l.visible), {
    paint: (lg, l) => {
      (lg as unknown as PxCtx).fillStyle = colours[l.id] ?? '#ffffff';
      lg.fillRect(0, 0, 1, 1);
    },
  });
  return target.px.map((v) => Math.round(v * 1000) / 1000) as RGBA;
}

function docWith(names: string[]): Doc {
  const doc = newDoc({ width: 1, height: 1 });
  doc.layers = names.map((n) => Object.assign(newVectorLayer(n), { id: n }));
  return doc;
}

describe('nested folders drawn together', () => {
  it('opacity multiplies down the levels', () => {
    const doc = docWith(['b']);
    const inner = edit.makeFolder(doc, ['b'], 'In')!;
    const outer = edit.makeFolder(doc, ['b'], 'Out')!;
    // The second call put the layer in a folder of its own inside In; move In into a folder instead.
    expect(doc.folders![outer].parent).toBe(inner);
    doc.folders![inner].opacity = 0.5;
    doc.folders![outer].opacity = 0.5;
    expect(draw(doc)).toEqual([1, 0, 0, 0.25]);
  });

  it('a layer with its own opacity inside two faded folders', () => {
    const doc = docWith(['b']);
    const f1 = edit.makeFolder(doc, ['b'], 'One')!;
    const f2 = edit.makeFolder(doc, ['b'], 'Two')!;
    doc.folders![f1].opacity = 0.8;
    doc.folders![f2].opacity = 0.5;
    doc.layers[0].opacity = 0.5;
    expect(draw(doc)[3]).toBeCloseTo(0.2, 3);
  });

  it('a multiply folder inside a folder darkens what is under it inside that folder only', () => {
    // a (grey) at the stage; folder Out holds d (blue) and, above it, folder In (multiply) holding b (red) and c (green).
    const doc = docWith(['a', 'd', 'b', 'c']);
    const out = edit.makeFolder(doc, ['d', 'b', 'c'], 'Out')!;
    const inn = edit.makeFolder(doc, ['b', 'c'], 'In')!;
    expect(doc.folders![inn].parent).toBe(out);
    doc.folders![inn].blend = 'multiply';
    // In is red then green (green on top, opaque): it shows green. Multiplied over blue = black.
    expect(draw(doc)).toEqual([0, 0, 0, 1]);
    // Without the blend the inner folder just covers the blue with green.
    delete doc.folders![inn].blend;
    expect(draw(doc)).toEqual([0, 1, 0, 1]);
    // The outer folder multiplying over the grey stage layer: green (0,1,0) x grey (0.5) = (0, 0.5, 0).
    doc.folders![out].blend = 'multiply';
    const px = draw(doc);
    expect(px[1]).toBeCloseTo(0.502, 2);
    expect(px[0]).toBe(0);
  });

  it('a hidden inner folder hides only its own layers', () => {
    const doc = docWith(['d', 'b', 'c']);
    const out = edit.makeFolder(doc, ['d', 'b', 'c'], 'Out')!;
    const inn = edit.makeFolder(doc, ['c'], 'In')!;
    expect(doc.folders![inn].parent).toBe(out);
    expect(draw(doc)).toEqual([0, 1, 0, 1]);
    doc.folders![inn].visible = false;
    expect(draw(doc)).toEqual([1, 0, 0, 1]);
    doc.folders![out].visible = false;
    expect(draw(doc)[3]).toBe(0);
  });

  it('a mask inside the inner folder cuts the inner folder only, not the layers under the outer one', () => {
    const doc = docWith(['a', 'd', 'b', 'm']);
    const out = edit.makeFolder(doc, ['d', 'b', 'm'], 'Out')!;
    const inn = edit.makeFolder(doc, ['b', 'm'], 'In')!;
    doc.layers[3].mask = 'hide';
    expect(doc.folders![inn].parent).toBe(out);
    // The mask layer paints a full pixel and hides what is under it inside In: red goes, blue (outside In) stays.
    expect(draw(doc)).toEqual([0, 0, 1, 1]);
  });
});
