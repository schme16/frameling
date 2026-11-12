// Runs the Godot bones export: draws each part's pictures at rest, cut to what's drawn, and writes them with the scene.
// Needs a canvas, so it only runs in the app. The scene itself comes from godot-bones.ts.
import { strToU8 } from 'fflate';
import type { Doc, Drawing, Layer } from '../core/format';
import { drawDrawing } from '../core/render';
import { encodePng, type RawImage } from '../io/png';
import { slug } from './plan';
import { buildAnimations, godotTexturePath } from './sheet';
import { buildPlan } from '../effects/plan';
import { compositePlan } from '../effects/composite';
import { allScopes, bakeScales, bonesStage, godotBonesScene, godotBonesShaders, hasBonesToExport, type BonesScope, type BonesTexture, type PartLook } from './godot-bones';
import { SheetProblem } from './engines';

export interface BonesRun {
  doc: Doc;
  range: { start: number; end: number };
  whole: boolean;
  clipId: string | null;
  scale: number;
  godotPath: string;
  pixelArt: boolean;
  signal?: AbortSignal;
  onStep?: (done: number, total: number, label: string) => void;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Draws one picture at rest onto a canvas covering the stage and a margin round it, in output pixels. Effects the layer
 * (or its folder) has are baked in here: Godot has no blur, glow or shadow of its own. */
function drawRest(doc: Doc, layer: Layer, d: Drawing, frame: number, k: number, look?: PartLook): { canvas: OffscreenCanvas; ox: number; oy: number } {
  const m = Math.round(Math.max(doc.width, doc.height) * 0.5);
  const w = Math.max(1, Math.ceil((doc.width + m * 2) * k));
  const h = Math.max(1, Math.ceil((doc.height + m * 2) * k));
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.setTransform(k, 0, 0, k, m * k, m * k);
  if (layer.kind === 'pixel') g.imageSmoothingEnabled = false;
  const ps = layer.kind === 'vector' || layer.kind === 'camera' ? 1 : layer.pixelSize;
  if (look?.effects.length) {
    // Only the effects, at full strength: the fade and the blend mode are Godot's own.
    const plain = { ...layer, effects: look.effects, opacity: 1, blend: undefined, folder: undefined, clipToBelow: false, mask: undefined, bind: undefined } as Layer;
    const one = { ...doc, layers: [plain], folders: undefined } as Doc;
    compositePlan(g, one, frame, buildPlan(one, () => true), {
      paint: (lg) => {
        lg.imageSmoothingEnabled = layer.kind !== 'pixel';
        drawDrawing(lg, d, ps, { doc, frame });
      },
    });
  } else drawDrawing(g, d, ps, { doc, frame });
  return { canvas, ox: -m * k, oy: -m * k };
}

/** The drawn part of a canvas (alpha above zero), or null when it's empty. */
function alphaBox(img: ImageData): Box | null {
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++)
      if (data[row + x * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const union = (a: Box | null, b: Box | null): Box | null => {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

function crop(img: ImageData, b: Box): RawImage {
  const out = new Uint8ClampedArray(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) {
    const sy = b.y + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < b.w; x++) {
      const sx = b.x + x;
      if (sx < 0 || sx >= img.width) continue;
      const s = (sy * img.width + sx) * 4;
      out.set(img.data.subarray(s, s + 4), (y * b.w + x) * 4);
    }
  }
  return { width: b.w, height: b.h, pixels: out };
}

/** The scene and the part pictures, as files for one folder. */
export async function godotBonesFiles(o: BonesRun): Promise<{ files: { name: string; bytes: Uint8Array }[]; main: string }> {
  const { doc, range } = o;
  if (!hasBonesToExport(doc)) throw new SheetProblem('There are no bones to export. Pick Baked frames instead, or add bones first.');
  const k = o.scale;
  const top = bonesStage(doc, range);
  if (!top.parts.length && !top.nested.length) throw new SheetProblem('Nothing is drawn in that part of the animation.');
  const texturePath = godotTexturePath(o.godotPath, doc.name);
  const dir = texturePath.slice(0, texturePath.lastIndexOf('/'));
  const base = texturePath.split('/').pop()!.replace(/\.[^.]*$/, '') || slug(doc.name);
  const files: { name: string; bytes: Uint8Array }[] = [];
  const usedNames = new Set<string>();
  // Symbols with bones of their own: their pictures are named after the symbol.
  const owner = new Map<BonesScope, string>();
  const walk = (s: BonesScope) => s.nested.forEach((n) => !owner.has(n.scope) && (owner.set(n.scope, n.name), walk(n.scope)));
  walk(top);
  const scopes = allScopes(top);
  const total = scopes.reduce((a, s) => a + s.parts.reduce((b, p) => b + p.pictures.length, 0), 0);
  let done = 0;
  // Symbols copied large are drawn bigger so they stay sharp (the scene scales them back down).
  const bakes = bakeScales(top, doc, k);
  for (const sc of scopes) {
    const bake = bakes.get(sc) ?? 1;
    const ks = k * bake;
    const who = owner.get(sc);
    const fileName = (layer: Layer, i: number, count: number) => {
      const stem = `${base}${who ? `-${slug(who, 'symbol')}` : ''}-${slug(layer.name, 'part')}`;
      let n = `${stem}${count > 1 ? `-${i + 1}` : ''}`;
      for (let j = 2; usedNames.has(n); j++) n = `${stem}-${j}${count > 1 ? `-${i + 1}` : ''}`;
      usedNames.add(n);
      return `${n}.png`;
    };
    const textures: BonesTexture[][] = [];
    for (const p of sc.parts) {
      const firstFrame = (i: number) => sc.range.start + p.frameOf.indexOf(i);
      // A bent layer's picture has to cover its whole mesh, and every picture shares one box so the mesh fits them all.
      let meshBox: Box | null = null;
      if (p.kind === 'mesh' && p.mesh) {
        const pts = p.mesh.points;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let j = 0; j < pts.length; j += 2) {
          x0 = Math.min(x0, pts[j] * ks);
          x1 = Math.max(x1, pts[j] * ks);
          y0 = Math.min(y0, pts[j + 1] * ks);
          y1 = Math.max(y1, pts[j + 1] * ks);
        }
        meshBox = { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1) - Math.floor(x0) + 1, h: Math.ceil(y1) - Math.floor(y0) + 1 };
      }
      // Boxes here are in output pixels on the stage. Only a bent layer keeps its full drawings until its box is known.
      const kept: { img: ImageData; ox: number; oy: number }[] = [];
      const list: BonesTexture[] = [];
      const write = (img: ImageData, ox: number, oy: number, box: Box, i: number) => {
        const name = fileName(p.layer, i, p.pictures.length);
        files.push({ name, bytes: encodePng(crop(img, { x: box.x - ox, y: box.y - oy, w: box.w, h: box.h })) });
        list.push({ path: `${dir}/${name}`, x: box.x, y: box.y, w: box.w, h: box.h, ...(bake !== 1 ? { bake } : {}) });
      };
      for (let i = 0; i < p.pictures.length; i++) {
        if (o.signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
        o.onStep?.(done++, total, `Drawing ${p.layer.name}`);
        const r = drawRest(doc, p.layer, p.pictures[i], firstFrame(i), ks, p.look);
        const img = r.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, r.canvas.width, r.canvas.height);
        const a = alphaBox(img);
        const box = a ? { x: a.x + r.ox, y: a.y + r.oy, w: a.w, h: a.h } : null;
        if (meshBox) {
          meshBox = union(meshBox, box);
          kept.push({ img, ox: r.ox, oy: r.oy });
        } else write(img, r.ox, r.oy, box ?? { x: 0, y: 0, w: 1, h: 1 }, i);
        if (i % 4 === 3) await new Promise((res) => setTimeout(res, 0));
      }
      kept.forEach((d, i) => write(d.img, d.ox, d.oy, meshBox!, i));
      textures.push(list);
    }
    sc.textures = textures;
  }
  const animations = buildAnimations({ clips: doc.clips, rangeStart: range.start, rangeEnd: range.end, fps: doc.fps, whole: o.whole, onlyClipId: o.clipId });
  const rootName = doc.name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Character';
  const input = { doc, range, parts: top.parts, textures: top.textures!, scale: k, animations, rootName, pixelArt: o.pixelArt, nested: top.nested, shaderDir: dir };
  const main = `${base}.tscn`;
  files.push({ name: main, bytes: strToU8(godotBonesScene(input)) });
  for (const sh of godotBonesShaders(input)) files.push({ name: sh.name, bytes: strToU8(sh.text) });
  return { files, main };
}
