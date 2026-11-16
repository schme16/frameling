// Makes a small Photoshop file with real text layers, for the before and after looks of editable PSD text and the checks
// that open it. The pictures of the words are drawn by ImageMagick (`convert`) with fonts on this machine, and each text layer
// carries a real `TySh` block, so the file reads the way one saved by Photoshop does. One layer names a font nobody has
// here (Gotham) so the left-out list has a missing font to name.
//
// Run it from the repo root.
//   npx esbuild scripts/fixtures/make-text-fixture.ts --bundle --platform=node --format=cjs --outfile=/tmp/mk-text.cjs && node /tmp/mk-text.cjs
//
// Writes scripts/docs/help/assets/import-text.psd.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildPsd, runStyle, typeBlock, type TestLayer } from '../../test/import/psdBuilder';

const W = 480;
const H = 300;
const FONTS = '/usr/share/fonts/truetype';
const SANS_BOLD = `${FONTS}/dejavu/DejaVuSans-Bold.ttf`;
const SERIF = `${FONTS}/dejavu/DejaVuSerif.ttf`;
const SANS = `${FONTS}/dejavu/DejaVuSans.ttf`;

const convert = (args: string[]): Buffer => execFileSync('convert', args, { maxBuffer: 1 << 26 });
/** Text drawn on a transparent W x H picture with its baseline origin at (x, y); `turn` degrees about that point. */
function drawText(text: string, font: string, size: number, color: string, x: number, y: number, turn = 0): Uint8Array {
  const args = ['-size', `${W}x${H}`, 'xc:none', '-font', font, '-pointsize', String(size), '-fill', color, '-draw', `translate ${x},${y} rotate ${turn} text 0,0 '${text.replace(/'/g, "\\'")}'`, '-depth', '8', 'rgba:-'];
  return new Uint8Array(convert(args));
}
const widthOf = (text: string, font: string, size: number): number => Number(execFileSync('convert', ['-font', font, '-pointsize', String(size), `label:${text}`, '-format', '%w', 'info:']).toString());

function layerOf(name: string, rgba: Uint8Array, extra: Partial<TestLayer> = {}): TestLayer {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rgba[(y * W + x) * 4 + 3]) ((x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y)));
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const plane = (c: number) => Uint8Array.from({ length: w * h }, (_, i) => rgba[((y0 + Math.floor(i / w)) * W + x0 + (i % w)) * 4 + c]);
  return { name, top: y0, left: x0, bottom: y0 + h, right: x0 + w, channels: [{ id: -1, plane: plane(3) }, { id: 0, plane: plane(0) }, { id: 1, plane: plane(1) }, { id: 2, plane: plane(2) }], ...extra };
}

const bg = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) bg.set([250 - (y >> 4), 232 - (y >> 5), 196, 255], (y * W + x) * 4);

// Title: point text, left aligned, bold sans.
const title = layerOf('Title', drawText('Slime Time', SANS_BOLD, 56, '#2d7d5a', 32, 84), {
  tags: [{ key: 'TySh', data: typeBlock({ text: 'Slime Time\r', transform: [1, 0, 0, 1, 32, 84], fonts: ['DejaVuSans-Bold'], runs: [{ length: 11, style: runStyle({ size: 56, color: [45 / 255, 125 / 255, 90 / 255] }) }] }) }],
});

// Subtitle: centred on x = 240, in a font that is not on this computer (Gotham), drawn here in a plain sans.
const subText = 'a bouncy little adventure';
const subW = widthOf(subText, SANS, 22);
const sub = layerOf('Subtitle', drawText(subText, SANS, 22, '#444444', 240 - subW / 2, 128), {
  tags: [{ key: 'TySh', data: typeBlock({ text: `${subText}\r`, transform: [1, 0, 0, 1, 240, 128], justification: 2, fonts: ['Gotham-Book'], runs: [{ length: subText.length + 1, style: runStyle({ size: 22, tracking: 20, color: [0.27, 0.27, 0.27] }) }] }) }],
});

// Story: paragraph text in a 220 px box, drawn line by line.
const lines = ['Slime wakes up in a sunny', 'meadow and bounces to the', 'top of the very tallest hill.'];
let story = new Uint8Array(W * H * 4);
const px = 16;
lines.forEach((l, i) => {
  const line = drawText(l, SERIF, px, '#1c2b24', 32, 190 + i * px * 1.2);
  story = story.map((v, k) => Math.max(v, line[k]));
});
const storyBox = layerOf('Story', story, {
  tags: [{ key: 'TySh', data: typeBlock({ text: `${lines.join(' ')}\r`, shapeType: 1, box: [0, 0, 250, 80], transform: [1, 0, 0, 1, 32, 190 - Math.round(px * 0.71)], fonts: ['DejaVuSerif'], runs: [{ length: lines.join(' ').length + 1, style: runStyle({ size: px, color: [0.11, 0.17, 0.14] }) }] }) }],
});

// Tag: turned about eight degrees, bold, orange.
const rot = -8;
const tag = layerOf('New tag', drawText('NEW!', SANS_BOLD, 30, '#e8590c', 372, 236, rot), {
  tags: [{ key: 'TySh', data: typeBlock({ text: 'NEW!\r', transform: [Math.cos((rot * Math.PI) / 180), Math.sin((rot * Math.PI) / 180), -Math.sin((rot * Math.PI) / 180), Math.cos((rot * Math.PI) / 180), 372, 236], fonts: ['DejaVuSans-Bold'], runs: [{ length: 5, style: runStyle({ size: 30, color: [0.91, 0.35, 0.05] }) }] }) }],
});

const psd = buildPsd({ width: W, height: H, layers: [layerOf('Background', bg), title, sub, storyBox, tag] });
fs.writeFileSync(path.join(process.cwd(), 'scripts/docs/help/assets/import-text.psd'), psd);
console.log('wrote import-text.psd');
