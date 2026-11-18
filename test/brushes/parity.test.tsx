// @vitest-environment jsdom
// The vector Brush and the pixel brush are meant to offer the same brushes and the same controls (card pixel-brush-parity).
// This test mounts both panels in every state that changes what shows, collects each control's `data-control` id, and
// compares. A control that is on one side only has to be on the list in parityGaps.ts, with the plan piece that clears it;
// a listed one that is now on both sides has to come off. The list only shrinks. See docs/testing.md.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/brushes';
import '../../src/dab';
import { preloadPicker } from './preloadPicker';
import { PIXEL_STARTERS, STARTERS } from '../../src/brushes/model';
import * as P from '../../src/brushes/presets';
import { DEFAULT_BRUSH, newDoc } from '../../src/core/doc';
import { setChoice } from '../../src/core/choices';
import { resetStore, store } from '../../src/core/store';
import type { BrushTip } from '../../src/core/format';
import { defaultTip } from '../../src/geometry/tip';
import { BrushOptions } from '../../src/tools/options/BrushOptions';
import { DabOptionsPanel } from '../../src/dab/Options';
import { DryOptionsPanel } from '../../src/dry/Options';
import { SoftOptionsFor } from '../../src/soft/Options';
import { resetDab, setDab } from '../../src/dab/settings';
import { DEFAULT_DUAL, DEFAULT_GRAIN } from '../../src/dab/texture';
import { pictureFromBytes } from '../../src/dab/texturePicture';
import { DEFAULT_DAB, DEFAULT_TAPER } from '../../src/dab/maths';
import { resetDry, setMedium } from '../../src/dry/settings';
import { resetSoft } from '../../src/soft/settings';
import { setPixelSettings, resetPixelSettings } from '../../src/pixel/settings';
import { TIDY_CHOICE } from '../../src/tools/quickshape';
import { BRUSH_PAIRS, ONE_SIDED_BRUSHES, ONE_SIDED_CONTROLS, TRANSLATES_FINE } from './parityGaps';
import { LISTED_STARTERS, madeOn, pixelHalf, vectorHalf } from '../../src/brushes/model';
import { brushFrom } from '../../src/core/uiMemory';
import { cleanSpec } from '../../src/dab/spec';
import { keptOnVectors } from '../../src/brushes/translate';
import { MEDIA } from '../../src/dry/maths';

vi.mock('../../src/brushes/thumbs', async (orig) => ({ ...(await orig<typeof import('../../src/brushes/thumbs')>()), drawPreviewStroke: () => undefined }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let stop: () => void;
beforeAll(async () => {
  const noop = new Proxy(() => undefined, { get: () => noop, apply: () => undefined });
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createImageData' ? (w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }) : noop) });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  await preloadPicker();
});
beforeEach(() => {
  localStorage.clear();
  for (const p of [...P.myBrushes()]) {
    P.applyPreset(p.id);
    void P.deleteActive();
  }
  resetDab();
  resetDry();
  resetSoft();
  resetPixelSettings();
  P.pickNone();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  stop = P.startBrushPresets();
});
afterEach(() => {
  stop();
  act(() => root.unmount());
  host.remove();
});

const vectorDoc = () => newDoc();
const pixelDoc = (locked = false) => {
  const d = newDoc({ pixel: { pixelSize: 8 } });
  if (locked) (d.layers[0] as { paletteLock?: boolean }).paletteLock = true;
  return d;
};

/** Opens every fold that is shut, a few times over (a fold can hold another). */
function openFolds(): void {
  for (let i = 0; i < 4; i++) act(() => host.querySelectorAll<HTMLButtonElement>('[data-fold][aria-expanded="false"]').forEach((b) => b.click()));
}
const ids = (el: ParentNode): string[] => [...el.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')!);

/** The picker's drop down, opened, for the controls in it. */
function pickerIds(): string[] {
  const btn = host.querySelector<HTMLButtonElement>('[data-control="brush-picker"] .pk-btn');
  if (!btn) return [];
  act(() => btn.click());
  const out = ids(document).filter((i) => i.startsWith('picker-'));
  act(() => btn.click());
  return out;
}

type Look = { name: string; doc: () => ReturnType<typeof newDoc>; tool: string; setup?: () => void; render: () => ReactNode; picker?: boolean };
const brushWith = (tip: BrushTip | undefined) => () => store().setUi((u) => ({ brush: { ...u.brush, tip } }));
const TWO_COLOUR = { w: 2, h: 2, colours: ['#ff0000', '#0000ff'], cells: [1, 2, 2, 1], keep: true };
const PICTURE = pictureFromBytes(8, new Uint8Array(64).fill(128));

const ROUTES = (to: string, from: string) => ({ from, to, amount: 0.5, invert: false });
/** A pixel brush with everything a vector line cannot draw, and a vector brush with everything a pixel layer cannot, picked on the other kind of layer: the greyed controls. */
const EVERYTHING_PIXEL = () => ({
  ...DEFAULT_DAB,
  wet: 0.5,
  hardness: 0.5,
  flow: 0.5,
  opacity: 0.5,
  blend: 'multiply' as const,
  taper: { ...DEFAULT_TAPER, opacity: 0.5 },
  dual: DEFAULT_DUAL,
  grain: { ...DEFAULT_GRAIN, picture: PICTURE },
  dynamics: [ROUTES('size', 'speed'), ROUTES('flow', 'fade'), ROUTES('opacity', 'speed'), ROUTES('angle', 'direction'), ROUTES('scatter', 'tilt'), ROUTES('mix', 'random'), ROUTES('hue', 'fade'), ROUTES('lightness', 'random'), ROUTES('saturation', 'random')] as never,
});
const pickImported = (dab: object) => () => {
  P.addImportedBrushes([{ name: 'Parity kept', dab: dab as never }], 'Parity');
  P.applyPreset(P.myBrushes().at(-1)!.id);
};
const pickVector = (tip: BrushTip) => () => {
  P.addBrushesFromText(JSON.stringify({ format: 'frameling-brushes', version: 1, presets: [{ name: 'Parity kept', tool: 'brush', brush: { ...DEFAULT_BRUSH, tip } }] }));
  P.applyPreset(P.myBrushes().at(-1)!.id);
};
const VECTOR: Look[] = [
  { name: 'plain', doc: vectorDoc, tool: 'brush', picker: true, render: () => <BrushOptions />, setup: () => (setChoice(TIDY_CHOICE, 'on'), setPixelSettings({ symmetry: 'h' })) },
  { name: 'chalk on paper', doc: vectorDoc, tool: 'brush', render: () => <BrushOptions />, setup: brushWith({ ...defaultTip('chalk'), dry: 'chalk' }) },
  { name: 'chalk off paper', doc: vectorDoc, tool: 'brush', render: () => <BrushOptions />, setup: brushWith({ ...defaultTip('chalk'), dry: undefined }) },
  { name: 'watercolour', doc: vectorDoc, tool: 'brush', render: () => <BrushOptions />, setup: brushWith(defaultTip('watercolour')) },
  { name: 'stamp', doc: vectorDoc, tool: 'brush', render: () => <BrushOptions />, setup: brushWith(defaultTip('stamp')) },
  { name: 'nib', doc: vectorDoc, tool: 'brush', render: () => <BrushOptions />, setup: brushWith(defaultTip('nib')) },
  { name: 'bristle', doc: vectorDoc, tool: 'brush', render: () => <BrushOptions />, setup: brushWith(defaultTip('bristle')) },
  { name: 'along', doc: vectorDoc, tool: 'brush', render: () => <BrushOptions />, setup: brushWith(defaultTip('along')) },
  { name: 'edged', doc: vectorDoc, tool: 'brush', render: () => <BrushOptions />, setup: brushWith(defaultTip('edged')) },
  {
    name: 'a saved brush, changed',
    doc: vectorDoc,
    tool: 'brush',
    render: () => <BrushOptions />,
    setup: () => {
      P.saveCurrentAs('Parity test');
      store().setUi((u) => ({ brush: { ...u.brush, size: u.brush.size + 3 } }));
    },
  },
  { name: 'a pixel brush picked: what vectors do not draw, greyed', doc: vectorDoc, tool: 'brush', render: () => <BrushOptions />, setup: () => pickImported(EVERYTHING_PIXEL())() },
];

const PIXEL: Look[] = [
  { name: 'Brush (B) on a pixel layer', doc: pixelDoc, tool: 'brush', picker: true, render: () => <BrushOptions />, setup: () => setDab({ size: 4 }) },
  { name: 'Brush (B) on a pixel layer, with a picture brush', doc: pixelDoc, tool: 'brush', render: () => <BrushOptions />, setup: () => setDab({ tip: 'picture', picture: TWO_COLOUR, size: 2, spacing: 1 }) },
  { name: 'Pixel brush', doc: pixelDoc, tool: 'pixel-brush', picker: true, render: () => <DabOptionsPanel />, setup: () => setPixelSettings({ symmetry: 'h' }) },
  { name: 'Pixel brush, picture tip', doc: pixelDoc, tool: 'pixel-brush', render: () => <DabOptionsPanel />, setup: () => setDab({ tip: 'picture', picture: TWO_COLOUR }) },
  { name: 'Pixel brush, smooth edge on a locked palette', doc: () => pixelDoc(true), tool: 'pixel-brush', render: () => <DabOptionsPanel />, setup: () => setDab({ aliased: false }) },
  {
    name: 'Pixel brush, paper, dynamics, taper',
    doc: pixelDoc,
    tool: 'pixel-brush',
    render: () => <DabOptionsPanel />,
    setup: () =>
      setDab({
        grain: { ...DEFAULT_GRAIN, scale: 2, moving: false },
        taper: DEFAULT_TAPER,
        dynamics: [ROUTES('size', 'pressure'), ROUTES('flow', 'fade'), ROUTES('opacity', 'speed'), ROUTES('angle', 'direction'), ROUTES('scatter', 'tilt'), ROUTES('mix', 'random')] as never,
      }),
  },
  { name: 'Pixel brush, paper picture', doc: pixelDoc, tool: 'pixel-brush', render: () => <DabOptionsPanel />, setup: () => setDab({ grain: { ...DEFAULT_GRAIN, picture: PICTURE } }) },
  { name: 'Pixel brush, dual tip', doc: pixelDoc, tool: 'pixel-brush', render: () => <DabOptionsPanel />, setup: () => setDab({ dual: DEFAULT_DUAL }) },
  { name: 'Pixel brush, dual tip with a picture', doc: pixelDoc, tool: 'pixel-brush', render: () => <DabOptionsPanel />, setup: () => setDab({ dual: { ...DEFAULT_DUAL, picture: PICTURE } }) },
  { name: 'Pixel brush, second brush', doc: pixelDoc, tool: 'pixel-brush', render: () => <DabOptionsPanel />, setup: () => setDab({ dual: { ...DEFAULT_DUAL, laid: { tip: 'round', size: 0.5, spacing: 1, scatter: 0 } } as never }) },
  { name: 'Pixel brush, a saved brush, changed', doc: pixelDoc, tool: 'pixel-brush', render: () => <DabOptionsPanel />, setup: () => (P.saveCurrentAs('Parity test'), setDab({ size: 9 })) },
  ...(['soft-brush', 'airbrush', 'highlighter', 'soft-eraser', 'smudge'] as const).map((k): Look => ({ name: `Soft paint: ${k}`, doc: pixelDoc, tool: k, render: () => {
      const C = SoftOptionsFor(k);
      return <C />;
    } })),
  ...MEDIA.slice(0, 1).map((m): Look => ({ name: `Chalk and charcoal: ${m.label}`, doc: pixelDoc, tool: 'charcoal', render: () => <DryOptionsPanel />, setup: () => setMedium(m.id) })),
  // A vector brush picked on a pixel layer: what pixels do not draw of it, greyed.
  ...(['bristle', 'watercolour', 'along', 'edged'] as const).map((k): Look => ({ name: `Brush (B) on a pixel layer, a vector ${k} brush picked`, doc: pixelDoc, tool: 'brush', render: () => <BrushOptions />, setup: pickVector(defaultTip(k)) })),
  { name: 'Brush (B) on a pixel layer, a stamp with gaps that vary and a matte finish picked', doc: pixelDoc, tool: 'brush', render: () => <BrushOptions />, setup: pickVector({ ...defaultTip('stamp'), gapVary: 0.5, matte: 0.5 }) },
];

/** Every control id seen on one side, across all the looks of it. */
function seen(looks: Look[]): Set<string> {
  const all = new Set<string>();
  for (const l of looks) {
    resetStore(l.doc());
    store().setUi({ tool: l.tool });
    // Each look starts with no brush picked: one picked in an earlier look would be lit (and changed) here too.
    P.pickNone();
    l.setup?.();
    act(() => root.render(l.render()));
    openFolds();
    for (const i of ids(host)) all.add(i);
    if (l.picker) for (const i of pickerIds()) all.add(i);
    act(() => root.render(<></>));
  }
  return all;
}

describe('the vector Brush and the pixel brush offer the same controls', () => {
  it('knows which controls are on one side only', () => {
    const v = seen(VECTOR);
    const p = seen(PIXEL);
    if (process.env.PARITY_PRINT) console.log('VECTOR', [...v].sort().join(' '), '\nPIXEL', [...p].sort().join(' '), '\nVONLY', [...v].filter((i) => !p.has(i)).sort().join(' '), '\nPONLY', [...p].filter((i) => !v.has(i)).sort().join(' '));
    const vOnly = [...v].filter((i) => !p.has(i));
    const pOnly = [...p].filter((i) => !v.has(i));
    const listedV = ONE_SIDED_CONTROLS.filter((g) => g.side === 'vector').flatMap((g) => g.ids);
    const listedP = ONE_SIDED_CONTROLS.filter((g) => g.side === 'pixel').flatMap((g) => g.ids);
    // On one side and not on the list: a new gap. Add it to parityGaps.ts, or give the other side the control.
    expect(vOnly.filter((i) => !listedV.includes(i)), 'vector only, not listed').toEqual([]);
    expect(pOnly.filter((i) => !listedP.includes(i)), 'pixel only, not listed').toEqual([]);
    // On the list and no longer one sided: take it off.
    expect(listedV.filter((i) => !vOnly.includes(i)), 'listed as vector only, but not any more (or never seen)').toEqual([]);
    expect(listedP.filter((i) => !pOnly.includes(i)), 'listed as pixel only, but not any more (or never seen)').toEqual([]);
  });
  it('lists each control once, with its reason', () => {
    const all = ONE_SIDED_CONTROLS.flatMap((g) => g.ids);
    expect(new Set(all).size).toBe(all.length);
    for (const g of ONE_SIDED_CONTROLS) {
      expect(g.what.length).toBeGreaterThan(2);
      expect(g.clears).toMatch(/^piece \d+|^by design/);
    }
  });
});

describe('the vector Brush and the pixel brush offer the same brushes', () => {
  const vecIds = STARTERS.map((b) => b.id);
  const pixIds = PIXEL_STARTERS.map((b) => b.id);
  it('puts every starter brush in a pair or on the one sided list', () => {
    const pairedV = BRUSH_PAIRS.map((x) => x[0]);
    const pairedP = BRUSH_PAIRS.map((x) => x[1]);
    const listedV = ONE_SIDED_BRUSHES.filter((g) => g.side === 'vector').map((g) => g.id);
    const listedP = ONE_SIDED_BRUSHES.filter((g) => g.side === 'pixel').map((g) => g.id);
    const fine = TRANSLATES_FINE.map((g) => g.id);
    expect(vecIds.filter((i) => !pairedV.includes(i) && !listedV.includes(i)), 'vector brushes with no pixel pair and not listed').toEqual([]);
    expect(pixIds.filter((i) => !pairedP.includes(i) && !listedP.includes(i) && !fine.includes(i)), 'pixel brushes with no vector pair and not listed').toEqual([]);
  });
  it('keeps the list and the pairs honest', () => {
    const pairedV = BRUSH_PAIRS.map((x) => x[0]);
    const pairedP = BRUSH_PAIRS.map((x) => x[1]);
    for (const g of ONE_SIDED_BRUSHES) {
      expect(g.side === 'vector' ? vecIds : pixIds, `${g.id} is not a starter of that side`).toContain(g.id);
      expect(g.side === 'vector' ? pairedV : pairedP, `${g.id} is listed as one sided but is in a pair`).not.toContain(g.id);
      expect(g.clears).toMatch(/^piece \d+|^by design/);
    }
    expect(new Set(ONE_SIDED_BRUSHES.map((g) => g.id)).size).toBe(ONE_SIDED_BRUSHES.length);
    for (const [v, p] of BRUSH_PAIRS) {
      expect(vecIds, `${v} in a pair`).toContain(v);
      expect(pixIds, `${p} in a pair`).toContain(p);
    }
    expect(new Set(pairedV).size).toBe(pairedV.length);
  });
  it('has a translation that loses nothing for the ones that are listed as translating fine', () => {
    for (const g of TRANSLATES_FINE) {
      const b = LISTED_STARTERS.find((x) => x.id === g.id)!;
      expect(b, g.id).toBeTruthy();
      expect(madeOn(b, 'vector'), `${g.id} has no vector half made`).toBe(false);
      expect(keptOnVectors(b.pixel!), `${g.id} loses something`).toEqual([]);
      expect(ONE_SIDED_BRUSHES.some((o) => o.id === g.id), `${g.id} is on the one sided list too`).toBe(false);
    }
  });
});

describe('one list, drawn on either kind of layer', () => {
  it('is the same list for a vector layer and a pixel layer, with every pair once', () => {
    const v = P.brushesOnSide('vector').map((b) => b.id);
    const p = P.brushesOnSide('pixel').map((b) => b.id);
    expect(v).toEqual(p);
    expect(new Set(v).size).toBe(v.length);
    for (const [, px] of BRUSH_PAIRS.filter((x) => x[2] === 'same')) expect(v, `${px} is folded into its pair`).not.toContain(px);
    expect(v).toHaveLength(STARTERS.length + PIXEL_STARTERS.length - BRUSH_PAIRS.filter((x) => x[2] === 'same').length);
  });
  it('gives every brush both halves, one made or both, and each reads as a valid brush', () => {
    for (const b of LISTED_STARTERS) {
      expect(brushFrom(JSON.parse(JSON.stringify(vectorHalf(b))), DEFAULT_BRUSH), `${b.id} vector half`).toBeTruthy();
      expect(cleanSpec(JSON.parse(JSON.stringify(pixelHalf(b)))), `${b.id} pixel half`).toBeTruthy();
      expect(madeOn(b, 'vector') || madeOn(b, 'pixel'), `${b.id} has a half made`).toBe(true);
    }
  });
});
