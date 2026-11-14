// Masks as a person uses them: adding one, seeing what it cuts, turning it off, and what the picture does. The pure
// parts (which layer cuts which, the ghost of what a mask hides, a mask leaving its folder) are checked on plain
// documents; the picture is drawn through the compositor on a one-pixel stand-in canvas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDoc, newPixelLayer, newVectorLayer } from '../../src/core/doc';
import type { Doc, Layer } from '../../src/core/format';
import { compositePlan } from '../../src/effects/composite';
import * as edit from '../../src/effects/edit';
import { ghostPlan, maskLinks, maskPartner, maskTargets, masksThatLeft, namesList } from '../../src/effects/masks';
import { buildPlan, planLayers } from '../../src/effects/plan';
import { lookSummary } from '../../src/effects/model';
import { readLayerLook } from '../../src/effects/io';

type RGBA = [number, number, number, number];

/** A one-pixel canvas that does the maths of source-over and the mask operations. */
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
    for (let k = 0; k < 3; k++) out[k] = ao > 0 ? (as * s[k] + (1 - as) * ad * d[k]) / ao : 0;
    this.canvas.px = out;
  }
}

beforeEach(() => vi.stubGlobal('OffscreenCanvas', Px));
afterEach(() => vi.unstubAllGlobals());

const colours: Record<string, string> = { a: '#808080', b: '#ff0000', c: '#00ff00', top: '#0000ff' };

/** Draws a plan; masks paint a full pixel unless their id is in `empty`. */
function drawPlan(doc: Doc, steps = buildPlan(doc, (l: Layer) => l.visible), empty: string[] = []): RGBA {
  const target = new Px();
  compositePlan(target.getContext() as never, doc, 0, steps, {
    paint: (lg, l) => {
      if (empty.includes(l.id)) return;
      (lg as unknown as PxCtx).fillStyle = colours[l.id] ?? '#000000';
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

const ids = (ls: Layer[]) => ls.map((l) => l.id);

describe('what a mask cuts', () => {
  it('a mask on the stage cuts every layer under it, and not the ones above', () => {
    const doc = docWith(['a', 'b', 'm', 'top']);
    doc.layers[2].mask = 'show';
    expect(ids(maskTargets(doc, 'm'))).toEqual(['a', 'b']);
    expect(maskTargets(doc, 'top')).toEqual([]);
  });

  it('a mask in a folder cuts only the folder', () => {
    const doc = docWith(['a', 'b', 'c', 'm', 'top']);
    edit.makeFolder(doc, ['c', 'm']);
    doc.layers[3].mask = 'show';
    expect(ids(maskTargets(doc, 'm'))).toEqual(['c']);
  });

  it('a mask cuts a folder under it as well as the layers, and leaves other masks out', () => {
    const doc = docWith(['a', 'b', 'm1', 'c', 'm2']);
    edit.makeFolder(doc, ['a', 'b']);
    doc.layers[2].mask = 'show';
    doc.layers[4].mask = 'hide';
    expect(ids(maskTargets(doc, 'm2'))).toEqual(['a', 'b', 'c']);
    expect(ids(maskTargets(doc, 'm1'))).toEqual(['a', 'b']);
  });

  it('a switched-off mask still knows what it cuts', () => {
    const doc = docWith(['a', 'm']);
    doc.layers[1].mask = 'show';
    doc.layers[1].visible = false;
    expect(ids(maskTargets(doc, 'm'))).toEqual(['a']);
  });

  it('links each cut layer to the nearest mask above it', () => {
    const doc = docWith(['a', 'm1', 'b', 'm2']);
    doc.layers[1].mask = 'show';
    doc.layers[3].mask = 'show';
    const links = maskLinks(doc);
    expect(links.by.get('a')!.id).toBe('m1');
    expect(links.by.get('b')!.id).toBe('m2');
    expect(links.by.has('m1')).toBe(false);
    expect(ids(links.targets.get('m2')!)).toEqual(['a', 'b']);
  });

  it('jumps between a mask and its layer', () => {
    const doc = docWith(['a', 'b', 'm', 'top']);
    doc.layers[2].mask = 'show';
    expect(maskPartner(doc, 'm')!.id).toBe('b');
    expect(maskPartner(doc, 'b')!.id).toBe('m');
    expect(maskPartner(doc, 'top')).toBeUndefined();
    expect(maskPartner(doc, 'nope')).toBeUndefined();
  });

  it('says the names in plain words', () => {
    const l = (n: string) => ({ name: n }) as Layer;
    expect(namesList([l('Ball')])).toBe('Ball');
    expect(namesList([l('Ball'), l('Shadow')])).toBe('Ball and Shadow');
    expect(namesList([l('A'), l('B'), l('C')])).toBe('A, B and C');
    expect(namesList([l('A'), l('B'), l('C'), l('D')])).toBe('A, B and 2 more');
  });
});

describe('adding a mask', () => {
  it('puts a new empty mask just above the layer, in a folder with it', () => {
    const doc = docWith(['a', 'b', 'top']);
    const r = edit.addMask(doc, 'b', 'show')!;
    expect(r.folder).toBeTruthy();
    const m = doc.layers.find((l) => l.id === r.mask)!;
    expect(m.mask).toBe('show');
    expect(m.cels).toEqual([]);
    expect(m.name).toBe('Mask for b');
    expect(doc.layers.map((l) => l.id)).toEqual(['a', 'b', r.mask, 'top']);
    expect(doc.layers.find((l) => l.id === 'b')!.folder).toBe(r.folder);
    expect(m.folder).toBe(r.folder);
    // It cuts only the layer it was added to.
    expect(ids(maskTargets(doc, r.mask))).toEqual(['b']);
    expect(doc.layers.find((l) => l.id === 'a')!.folder).toBeUndefined();
  });

  it('a pixel layer gets a pixel mask with the same squares', () => {
    const doc = docWith(['a']);
    doc.layers.push(Object.assign(newPixelLayer('Sprite', 4), { id: 'p' }));
    const r = edit.addMask(doc, 'p', 'hide')!;
    const m = doc.layers.find((l) => l.id === r.mask)!;
    expect(m.kind).toBe('pixel');
    expect(m.kind === 'pixel' && m.pixelSize).toBe(4);
    expect(m.mask).toBe('hide');
  });

  it('in a folder with layers under it, the pair gets a folder inside it', () => {
    const doc = docWith(['a', 'b', 'top']);
    const outer = edit.makeFolder(doc, ['a', 'b'])!;
    const r = edit.addMask(doc, 'b', 'show')!;
    expect(r.folder).toBeTruthy();
    expect(doc.folders![r.folder!].parent).toBe(outer);
    expect(ids(maskTargets(doc, r.mask))).toEqual(['b']);
  });

  it('alone in its folder, the mask just joins it', () => {
    const doc = docWith(['a', 'b']);
    const f = edit.makeFolder(doc, ['b'])!;
    const r = edit.addMask(doc, 'b', 'show')!;
    expect(r.folder).toBeUndefined();
    expect(doc.layers.find((l) => l.id === r.mask)!.folder).toBe(f);
    expect(ids(maskTargets(doc, r.mask))).toEqual(['b']);
  });

  it('refuses a mask, and numbers the name when it is taken', () => {
    const doc = docWith(['a', 'm']);
    doc.layers[1].mask = 'show';
    expect(edit.addMask(doc, 'm', 'show')).toBeNull();
    expect(edit.addMask(doc, 'nope', 'show')).toBeNull();
    const d2 = docWith(['a']);
    const first = edit.addMask(d2, 'a', 'show')!;
    // A plain layer named like the mask is already there: the next one is numbered.
    d2.layers.find((l) => l.id === first.mask)!.mask = undefined;
    const second = edit.addMask(d2, 'a', 'show')!;
    expect(d2.layers.find((l) => l.id === second.mask)!.name).toBe('Mask for a 2');
  });
});

describe('turning a mask off, flipping it, taking it off', () => {
  it('off keeps the mask, and on puts it back', () => {
    const doc = docWith(['a', 'm']);
    doc.layers[1].mask = 'show';
    expect(edit.setMaskOn(doc, 'm', false)).toBe(true);
    expect(doc.layers[1].visible).toBe(false);
    expect(doc.layers[1].mask).toBe('show');
    expect(lookSummary(doc.layers[1])).toMatch(/off/);
    expect(edit.setMaskOn(doc, 'm', false)).toBe(false);
    expect(edit.setMaskOn(doc, 'm', true)).toBe(true);
    expect(doc.layers[1].visible).toBe(true);
    // A layer that is not a mask is left alone.
    expect(edit.setMaskOn(doc, 'a', false)).toBe(false);
  });

  it('flips show and hide, and taking it off for good makes a plain layer', () => {
    const doc = docWith(['a', 'm']);
    doc.layers[1].mask = 'show';
    expect(edit.flipMask(doc, 'm')).toBe(true);
    expect(doc.layers[1].mask).toBe('hide');
    expect(edit.flipMask(doc, 'm')).toBe(true);
    expect(doc.layers[1].mask).toBe('show');
    expect(edit.setMask(doc, 'm', null)).toBe(true);
    expect(doc.layers[1].mask).toBeUndefined();
    expect(edit.flipMask(doc, 'm')).toBe(false);
  });

  it('the on/off state is the eye, so an old file with a hidden mask opens as an off mask', () => {
    const doc = docWith(['a', 'm']);
    doc.layers[1].mask = 'hide';
    doc.layers[1].visible = false;
    const back = readLayerLook(JSON.parse(JSON.stringify(doc.layers[1])));
    expect(back.mask).toBe('hide');
  });
});

describe('the picture', () => {
  it('a show mask hides everything until it is painted, then shows where it is painted', () => {
    const doc = docWith(['a', 'm']);
    doc.layers[1].mask = 'show';
    expect(drawPlan(doc, undefined, ['m'])[3]).toBe(0);
    expect(drawPlan(doc)).toEqual([0.502, 0.502, 0.502, 1]);
  });

  it('a hide mask shows everything until it is painted, then hides where it is painted', () => {
    const doc = docWith(['a', 'm']);
    doc.layers[1].mask = 'hide';
    expect(drawPlan(doc, undefined, ['m'])).toEqual([0.502, 0.502, 0.502, 1]);
    expect(drawPlan(doc)[3]).toBe(0);
  });

  it('a mask that is off cuts nothing and is not drawn', () => {
    const doc = docWith(['a', 'm']);
    doc.layers[1].mask = 'show';
    const on = drawPlan(doc, undefined, ['m']);
    doc.layers[1].visible = false;
    const off = drawPlan(doc, undefined, ['m']);
    expect(on[3]).toBe(0);
    expect(off).toEqual([0.502, 0.502, 0.502, 1]);
    // Painted or not, an off mask changes nothing: the layer under it is as it was with no mask at all.
    expect(drawPlan(doc)).toEqual(off);
    const none = docWith(['a']);
    expect(drawPlan(none)).toEqual(off);
  });

  it('taking the mask off for good shows its drawing like any layer', () => {
    const doc = docWith(['a', 'm']);
    colours.m = '#ff0000';
    doc.layers[1].mask = 'show';
    expect(drawPlan(doc)).toEqual([0.502, 0.502, 0.502, 1]);
    edit.setMask(doc, 'm', null);
    expect(drawPlan(doc)).toEqual([1, 0, 0, 1]);
    delete colours.m;
  });

  it('a mask cuts only the layer it was added to, not the one under the folder', () => {
    const doc = docWith(['a', 'b', 'top']);
    const r = edit.addMask(doc, 'b', 'show')!;
    // The mask is empty: b is hidden, a still shows (a is under the folder, top is above).
    expect(drawPlan(doc, undefined, [r.mask])).toEqual([0, 0, 1, 1]);
    const d2 = docWith(['a', 'b']);
    const r2 = edit.addMask(d2, 'b', 'show')!;
    expect(drawPlan(d2, undefined, [r2.mask])).toEqual([0.502, 0.502, 0.502, 1]);
  });

  it('while a mask is painted, the ghost is what it hides', () => {
    const doc = docWith(['a', 'b', 'm']);
    edit.useAsMask(doc, 'm', 'all');
    doc.layers.find((l) => l.id === 'm')!.mask = 'show';
    const ghost = ghostPlan(doc, 'm')!;
    // Empty show mask: everything is hidden, so the ghost is the whole of what it cuts (b over a).
    expect(drawPlan(ghost.doc, ghost.steps, ['m'])).toEqual([1, 0, 0, 1]);
    // A mask painted over everything hides nothing, so the ghost is empty.
    expect(drawPlan(ghost.doc, ghost.steps)[3]).toBe(0);
    // The same for a hide mask the other way round.
    doc.layers.find((l) => l.id === 'm')!.mask = 'hide';
    const g2 = ghostPlan(doc, 'm')!;
    expect(drawPlan(g2.doc, g2.steps, ['m'])[3]).toBe(0);
    expect(drawPlan(g2.doc, g2.steps)).toEqual([1, 0, 0, 1]);
  });

  it('the ghost leaves out layers the mask does not cut, and an off mask has none', () => {
    const doc = docWith(['a', 'b', 'm', 'top']);
    doc.layers[2].mask = 'show';
    const ghost = ghostPlan(doc, 'm')!;
    expect(ids(planLayers(ghost.steps))).toEqual(['a', 'b', 'm']);
    doc.layers[2].visible = false;
    expect(ghostPlan(doc, 'm')).toBeNull();
    expect(ghostPlan(doc, 'a')).toBeNull();
  });
});

describe('a mask that leaves its folder', () => {
  const setup = () => {
    const doc = docWith(['a', 'b', 'm', 'top']);
    const f = edit.makeFolder(doc, ['b', 'm'])!;
    doc.layers[2].mask = 'show';
    return { doc, f };
  };

  it('is noticed when it moves out, or its folder goes', () => {
    const { doc, f } = setup();
    const out = structuredClone(doc);
    edit.outdentNode(out, { layer: 'm' });
    expect(masksThatLeft(doc, out)).toEqual(['m']);
    const gone = structuredClone(doc);
    edit.ungroupFolder(gone, f);
    expect(masksThatLeft(doc, gone)).toEqual(['m']);
  });

  it('is not noticed when nothing moved, or the folder moved with it', () => {
    const { doc } = setup();
    expect(masksThatLeft(doc, doc)).toEqual([]);
    const folder = structuredClone(doc);
    edit.moveNode(folder, { folder: doc.layers[2].folder! }, { layer: 'top' }, 'below');
    expect(masksThatLeft(doc, folder)).toEqual([]);
  });

  it('is not noticed for a plain layer leaving, or a mask already out', () => {
    const { doc } = setup();
    const out = structuredClone(doc);
    edit.outdentNode(out, { layer: 'b' });
    expect(masksThatLeft(doc, out)).toEqual([]);
    const stage = docWith(['a', 'm']);
    stage.layers[1].mask = 'show';
    expect(masksThatLeft(stage, structuredClone(stage))).toEqual([]);
  });
});
