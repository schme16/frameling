// Makes the small layered files the help pictures and the import checks open: a little scene as a Photoshop file (with a
// layer folder, a text layer and an adjustment layer, so there is something it can't bring in) and as an OpenRaster file.
//
// Run it from the repo root.
//   npx esbuild scripts/fixtures/make-import-fixtures.ts --bundle --platform=node --format=cjs --outfile=/tmp/mk-import.cjs && node /tmp/mk-import.cjs
//
// Writes scripts/docs/help/assets/import-scene.psd and import-scene.ora (a few KB each).
import { strToU8, zipSync } from 'fflate';
import fs from 'node:fs';
import path from 'node:path';
import { encodePng } from '../../src/io/png';
import { buildPsd, type TestLayer } from '../../test/import/psdBuilder';

const W = 192;
const H = 120;
type Rgba = Uint8ClampedArray;

const blank = (): Rgba => new Uint8ClampedArray(W * H * 4);
const put = (a: Rgba, x: number, y: number, r: number, g: number, b: number, al = 255) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  a.set([r, g, b, al], (y * W + x) * 4);
};
const hex = (s: string): [number, number, number] => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const ellipse = (a: Rgba, cx: number, cy: number, rx: number, ry: number, col: string, al = 255) => {
  const [r, g, b] = hex(col);
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(a, x, y, r, g, b, al);
};
const rect = (a: Rgba, x0: number, y0: number, w: number, h: number, col: string) => {
  const [r, g, b] = hex(col);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(a, x, y, r, g, b);
};

const sky = blank();
for (let y = 0; y < H; y++) {
  const t = y / H;
  for (let x = 0; x < W; x++) put(sky, x, y, Math.round(121 + (251 - 121) * t), Math.round(184 + (231 - 184) * t), Math.round(255 + (198 - 255) * t));
}
const hills = blank();
ellipse(hills, 50, 128, 90, 50, '#4f9d69');
ellipse(hills, 150, 132, 80, 46, '#3f8a5a');
const shadow = blank();
ellipse(shadow, 96, 96, 20, 5, '#1c2b24', 120);
const hero = blank();
ellipse(hero, 96, 82, 16, 14, '#2d7d5a');
ellipse(hero, 96, 82, 14, 12, '#6fd3a0');
ellipse(hero, 90, 79, 3, 4, '#ffffff');
ellipse(hero, 102, 79, 3, 4, '#ffffff');
ellipse(hero, 91, 80, 1.5, 2, '#1c2b24');
ellipse(hero, 103, 80, 1.5, 2, '#1c2b24');
const title = blank();
for (let i = 0; i < 7; i++) rect(title, 56 + i * 12, 12, 8, 14, '#ffffff');
rect(title, 56, 30, 80, 3, '#ffffff');

interface Piece {
  name: string;
  rgba: Rgba;
  opacity: number;
  /** PSD blend key and OpenRaster composite op. */
  psdBlend?: string;
  oraOp?: string;
  tags?: string[];
}
const pieces: Record<string, Piece> = {
  sky: { name: 'Sky', rgba: sky, opacity: 1 },
  hills: { name: 'Hills', rgba: hills, opacity: 1 },
  shadow: { name: 'Shadow', rgba: shadow, opacity: 0.6, psdBlend: 'mul ', oraOp: 'svg:multiply' },
  hero: { name: 'Hero', rgba: hero, opacity: 1 },
  title: { name: 'Title', rgba: title, opacity: 1, tags: ['TySh'] },
};

/** The smallest box with any picture in it. */
function bounds(a: Rgba) {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3]) ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y)));
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function crop(a: Rgba, b: { x: number; y: number; w: number; h: number }): Rgba {
  const out = new Uint8ClampedArray(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) out.set(a.subarray(((b.y + y) * W + b.x) * 4, ((b.y + y) * W + b.x + b.w) * 4), y * b.w * 4);
  return out;
}

function psdLayer(p: Piece): TestLayer {
  const b = bounds(p.rgba);
  const px = crop(p.rgba, b);
  const plane = (c: number) => Uint8Array.from({ length: b.w * b.h }, (_, i) => px[i * 4 + c]);
  return { name: p.name, top: b.y, left: b.x, bottom: b.y + b.h, right: b.x + b.w, opacity: Math.round(p.opacity * 255), blend: p.psdBlend, tags: p.tags?.map((key) => ({ key })), channels: [{ id: -1, plane: plane(3) }, { id: 0, plane: plane(0) }, { id: 1, plane: plane(1) }, { id: 2, plane: plane(2) }] };
}

const outDir = path.join(process.cwd(), 'scripts/docs/help/assets');
const psd = buildPsd({
  width: W,
  height: H,
  layers: [
    { name: '</Layer group>', section: 3 },
    psdLayer(pieces.sky),
    psdLayer(pieces.hills),
    { name: 'Scenery', section: 1, sectionBlend: 'pass' },
    psdLayer(pieces.shadow),
    psdLayer(pieces.hero),
    psdLayer(pieces.title),
    { name: 'Levels 1', tags: [{ key: 'levl' }] },
  ],
});
fs.writeFileSync(path.join(outDir, 'import-scene.psd'), psd);

const file = (p: Piece, src: string) => ({ p, src, b: bounds(p.rgba) });
const files = Object.values(pieces).map((p, i) => file(p, `data/layer${i}.png`));
const entry = (f: ReturnType<typeof file>) => `<layer name="${f.p.name}" src="${f.src}" x="${f.b.x}" y="${f.b.y}" opacity="${f.p.opacity}" visibility="visible" composite-op="${f.p.oraOp ?? 'svg:src-over'}"/>`;
const by = (k: string) => files.find((f) => f.p === pieces[k])!;
// Top first.
const stack = `<stack>${entry(by('title'))}${entry(by('hero'))}${entry(by('shadow'))}<stack name="Scenery" opacity="1" visibility="visible">${entry(by('hills'))}${entry(by('sky'))}</stack></stack>`;
const zip: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
  mimetype: [strToU8('image/openraster'), { level: 0 }],
  'stack.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><image w="${W}" h="${H}" version="0.0.3">${stack}</image>`),
};
for (const f of files) zip[f.src] = encodePng({ width: f.b.w, height: f.b.h, pixels: crop(f.p.rgba, f.b) });
fs.writeFileSync(path.join(outDir, 'import-scene.ora'), zipSync(zip));
console.log('wrote import-scene.psd and import-scene.ora');
