// A tinted symbol inside a tinted symbol: the outer wash goes on top of the inner result, so both show. The canvas does
// this (each copy is washed as a whole, inside out); every exporter has to agree. Grey (0.5) washed half way to red
// is (0.75, 0.25, 0.25), and then half way to blue is (0.376, 0.126, 0.626).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzlibSync } from 'fflate';
import { renderFrame } from '../../src/core/render';
import { frameToSvg } from '../../src/export/svg';
import { animatedSvg } from '../../src/export/svg-anim';
import { lottieExport } from '../../src/export/lottie';
import { writePdf } from '../../src/export/pdf';
import { stackWash, godotBonesScene, bonesStage, allScopes, bakeScales } from '../../src/export/godot-bones';
import { bonesExtrasDoc } from '../../src/export/bonesExtrasDoc';
import { buildAnimations } from '../../src/export/sheet';
import type { Doc } from '../../src/core/format';
import { nestedTintDoc } from './nested-tint-doc';

const mix = (c: number[], w: number[], a: number) => c.map((v, i) => v * (1 - a) + w[i] * a);
const RED = { color: '#ff0000', amount: 0.5 };
const BLUE = { color: '#0000ff', amount: 0.5 };

// ---------------------------------------------------------------- the canvas

interface Wash {
  color: string;
  alpha: number;
}

/** A canvas stand-in that notes every fill painted with source-atop (the colour wash), in order. */
function recorder(log: Wash[]) {
  const ctxs: unknown[] = [];
  class Fake {
    width: number;
    height: number;
    ctx: Record<string, unknown>;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      const noop = () => {};
      const ctx: Record<string, unknown> = {
        canvas: this,
        fillStyle: '',
        strokeStyle: '',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        imageSmoothingEnabled: true,
        lineWidth: 1,
        save: noop,
        restore: noop,
        setTransform: noop,
        getTransform: () => ({}),
        transform: noop,
        scale: noop,
        translate: noop,
        clearRect: noop,
        beginPath: noop,
        rect: noop,
        clip: noop,
        moveTo: noop,
        lineTo: noop,
        closePath: noop,
        quadraticCurveTo: noop,
        bezierCurveTo: noop,
        fill: noop,
        stroke: noop,
        drawImage: noop,
        fillRect: () => {
          if (ctx.globalCompositeOperation === 'source-atop') log.push({ color: String(ctx.fillStyle), alpha: Number(ctx.globalAlpha) });
        },
      };
      this.ctx = ctx;
      ctxs.push(ctx);
    }
    getContext() {
      return this.ctx;
    }
  }
  return Fake;
}

describe('tint stacking on the canvas', () => {
  let saved: unknown;
  const log: Wash[] = [];
  beforeEach(() => {
    vi.stubGlobal('Path2D', class { addPath() {} moveTo() {} lineTo() {} closePath() {} bezierCurveTo() {} rect() {} });
    log.length = 0;
    saved = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = recorder(log);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = saved;
  });

  const draw = (doc: Doc) => {
    const c = new (globalThis as unknown as { OffscreenCanvas: new (w: number, h: number) => { getContext(): CanvasRenderingContext2D } }).OffscreenCanvas(100, 100);
    renderFrame(c.getContext(), doc, 0);
  };

  it('washes the inner copy first and the outer copy over the result', () => {
    draw(nestedTintDoc(RED, BLUE));
    expect(log).toEqual([
      { color: '#ff0000', alpha: 0.5 },
      { color: '#0000ff', alpha: 0.5 },
    ]);
  });
  it('an outer wash alone, or an inner one alone, is applied once', () => {
    draw(nestedTintDoc(undefined, BLUE));
    expect(log).toEqual([{ color: '#0000ff', alpha: 0.5 }]);
    log.length = 0;
    draw(nestedTintDoc(RED, undefined));
    expect(log).toEqual([{ color: '#ff0000', alpha: 0.5 }]);
  });
});

// ---------------------------------------------------------------- the exporters

describe('tint stacking in SVG', () => {
  it('nests the outer filter around the inner one', () => {
    const svg = frameToSvg(nestedTintDoc(RED, BLUE), 0);
    expect(svg).toMatch(/filter="url\(#tint-0000ff-500\)"><g[^>]*filter="url\(#tint-ff0000-500\)"/);
  });
  it('the moving SVG nests them the same way', () => {
    const svg = animatedSvg(nestedTintDoc(RED, BLUE), {});
    expect(svg).toMatch(/filter="url\(#tint-0000ff-500\)"><g[^>]*filter="url\(#tint-ff0000-500\)"/);
  });
});

describe('tint stacking in Lottie', () => {
  it('bakes both washes into the colour, outer on top of inner', () => {
    const { data } = lottieExport(nestedTintDoc(RED, BLUE));
    const text = JSON.stringify(data.assets);
    expect(text).toContain('[0.376,0.126,0.626,1]');
    expect(text).not.toContain('[0.251,0.251,0.751,1]');
  });
  it('counts the see-through of a tint colour, as the canvas, SVG and Godot do', () => {
    const fillOf = (inner: typeof RED | undefined, outer: typeof RED | undefined) => {
      const text = JSON.stringify(lottieExport(nestedTintDoc(inner, outer)).data.assets);
      return JSON.parse(/"ty":"fl","nm":"Fill","c":\{"a":0,"k":(\[[^\]]*\])/.exec(text)![1]) as number[];
    };
    const close = (got: number[], want: number[]) => want.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 2));
    const half = 128 / 255;
    // A half see-through red at full amount is a half wash: grey 0.5 goes to about (0.75, 0.25, 0.25).
    close(fillOf(undefined, { color: '#ff000080', amount: 1 }), mix([0.502, 0.502, 0.502], [1, 0, 0], half));
    // A fully see-through tint changes nothing.
    close(fillOf(undefined, { color: '#ff000000', amount: 1 }), [0.502, 0.502, 0.502]);
    // Stacked: inner first, then the outer over it, each with its own see-through folded in.
    const mid = mix([0.502, 0.502, 0.502], [1, 0, 0], half);
    close(fillOf({ color: '#ff000080', amount: 1 }, BLUE), mix(mid, [0, 0, 1], 0.5));
  });
});

describe('tint stacking in PDF', () => {
  it('draws the stacked colour', () => {
    const bytes = writePdf(nestedTintDoc(RED, BLUE), { frames: [0], scale: 1, background: null, title: 't' });
    const s = Buffer.from(bytes).toString('latin1');
    let out = '';
    for (const m of s.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
      try {
        out += Buffer.from(unzlibSync(Buffer.from(m[1], 'latin1'))).toString('latin1');
      } catch {
        out += m[1];
      }
    }
    expect(out).toMatch(/0\.37[56]\d* 0\.12[56]\d* 0\.62[56]\d* rg/);
  });
});

// ---------------------------------------------------------------- Godot

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

describe('stackWash', () => {
  it('is one wash that does what the two do', () => {
    for (const [inner, outer] of [
      [RED, BLUE],
      [{ color: '#33cc99', amount: 0.3 }, { color: '#ff8800', amount: 0.8 }],
      [{ color: '#000000', amount: 1 }, { color: '#ffffff', amount: 0.25 }],
    ]) {
      const w = stackWash(inner, outer)!;
      for (const c of [[0.5, 0.5, 0.5], [1, 0, 0], [0.1, 0.9, 0.4]]) {
        const two = mix(mix(c, rgb(inner.color), inner.amount), rgb(outer.color), outer.amount);
        const one = mix(c, rgb(w.color), w.amount);
        one.forEach((v, i) => expect(v).toBeCloseTo(two[i], 2));
      }
    }
  });
  it('passes one wash through and gives nothing for none', () => {
    expect(stackWash(RED, null)).toBe(RED);
    expect(stackWash(undefined, BLUE)).toBe(BLUE);
    expect(stackWash(null, undefined)).toBeNull();
    expect(stackWash({ color: '#ff0000', amount: 0 }, { color: '#0000ff', amount: 0 })).toBeNull();
  });
  it('counts the see-through of a colour and never goes over a full wash', () => {
    expect(stackWash({ color: '#ff000080', amount: 1 }, { color: '#0000ff', amount: 1 })!.amount).toBe(1);
    // A half see-through red is a half wash; a fully see-through blue over it adds nothing.
    const w = stackWash({ color: '#ff000080', amount: 1 }, { color: '#0000ff00', amount: 1 });
    expect(w!.color).toBe('#ff000080');
    const both = stackWash({ color: '#ff000080', amount: 1 }, { color: '#0000ff', amount: 0.5 })!;
    expect(both.amount).toBeCloseTo(1 - (1 - 0.502) * 0.5, 2);
  });
});

function sceneOf(doc: Doc) {
  const range = { start: 0, end: doc.length - 1 };
  const top = bonesStage(doc, range);
  const bakes = bakeScales(top, doc, 1);
  let n = 0;
  for (const sc of allScopes(top)) {
    const b = bakes.get(sc) ?? 1;
    sc.textures = sc.parts.map((p) => p.pictures.map(() => ({ path: `res://p${n++}.png`, x: 8, y: 12, w: 40, h: 40, ...(b !== 1 ? { bake: b } : {}) })));
  }
  const animations = buildAnimations({ clips: doc.clips, rangeStart: 0, rangeEnd: doc.length - 1, fps: doc.fps, whole: true });
  return godotBonesScene({ doc, range, parts: top.parts, textures: top.textures!, scale: 1, animations, rootName: 'Extras', nested: top.nested });
}

describe('tint stacking in Godot bones scenes', () => {
  const doc = () => bonesExtrasDoc({ bodyArm: true, armTint: { color: '#0000ff', amount: 0.5 } });
  /** The values of an animation track on a part's material. */
  const trackOf = (tscn: string, part: string, prop: string): number[] => {
    const at = tscn.indexOf(`${part}:material:shader_parameter/${prop}")`);
    expect(at, `${part} ${prop} is animated`).toBeGreaterThan(0);
    const values = /"values": \[([^\]]*)\]/.exec(tscn.slice(at))![1];
    return values.split(/,\s*(?=[\d.]+(?:,|$)|Color)/).flatMap((v) => (v.startsWith('Color') ? [] : [Number(v)]));
  };

  it('a copy inside a washed copy keeps its own wash and gets the outer one on top', () => {
    const tscn = sceneOf(doc());
    // The Body copy fades its red wash in to half; the arm inside has a blue half wash of its own, so the arm ends up
    // with three quarters in all, and starts from its own half alone.
    const amounts = trackOf(tscn, 'Upper arm', 'tint_amount');
    expect(Math.min(...amounts)).toBeCloseTo(0.5, 3);
    expect(Math.max(...amounts)).toBeCloseTo(0.75, 3);
    // The Body's own part only has the Body wash.
    const torso = trackOf(tscn, 'Torso', 'tint_amount');
    expect(Math.max(...torso)).toBeCloseTo(0.5, 3);
    expect(Math.min(...torso)).toBeCloseTo(0, 3);
  });

  it('starts the arm material from the stacked wash, mostly blue at first', () => {
    const tscn = sceneOf(doc());
    const node = tscn.split('[node name="Upper arm" type="Sprite2D"')[1].split('\n\n')[0];
    const id = /material = SubResource\("(Tint_[^"]+)"\)/.exec(node)![1];
    const res = tscn.split(`[sub_resource type="ShaderMaterial" id="${id}"]`)[1].split('\n\n')[0];
    const c = /tint_color = Color\(([^)]*)\)/.exec(res)![1].split(',').map(Number);
    expect(Number(/tint_amount = ([\d.]+)/.exec(res)![1])).toBeGreaterThan(0.5);
    expect(c[2]).toBeGreaterThan(0.9);
  });

  it('a plain washed Body (no wash on the arm) is as before', () => {
    const tscn = sceneOf(bonesExtrasDoc({ bodyArm: true }));
    // The arm shares the Body's wash material, so only the Body's part carries the animation.
    expect(Math.max(...trackOf(tscn, 'Torso', 'tint_amount'))).toBeCloseTo(0.5, 3);
    expect(tscn).not.toContain('Upper arm:material:shader_parameter/tint_amount');
  });
});
