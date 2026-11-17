// The pictures the picture-tip, grain and dual-tip looks use, made inside the page as real PNG files (so they go through the
// same reader a file from disk does) and handed to the debug hooks as a list of bytes. Files starting with _ are not entries.
const L = require('../help/_lib.cjs');
const { start, draw, whole, wave, away, shot, picture } = require('../ab-pixel-brush/_draw.cjs');

/** Page code that gives the bytes of a w by h PNG drawn by `body` (a canvas 2D context `g` is in scope). */
const bytes = (w, h, body) => `(async () => { const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h}; const g = c.getContext('2d'); ${body}; const b = await new Promise((r) => c.toBlob(r, 'image/png')); return Array.from(new Uint8Array(await b.arrayBuffer())); })()`;

// A woven cloth: dark threads over and under on white, 8 pixel cells.
const WEAVE = bytes(64, 64, `g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#222'; for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { if ((i + j) % 2) g.fillRect(i * 4, j * 4 + 1, 4, 2); else g.fillRect(i * 4 + 1, j * 4, 2, 4); }`);
// Dark leaves on a clear background.
const LEAVES = bytes(64, 64, `g.fillStyle = '#111'; for (let i = 0; i < 16; i++) { const x = 8 + (i % 4) * 16 + (i % 3) * 3, y = 8 + Math.floor(i / 4) * 16 + (i % 2) * 4; g.beginPath(); g.ellipse(x, y, 8, 3.2, (i * 2.4) % 3.14, 0, Math.PI * 2); g.fill(); }`);
// A smiley in black ink on white paper: a solid picture, so the first time it asks which part is the brush.
const SMILEY = bytes(96, 96, `g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 96); g.strokeStyle = '#111'; g.fillStyle = '#111'; g.lineWidth = 7; g.beginPath(); g.arc(48, 48, 38, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(34, 38, 6, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(62, 38, 6, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(48, 52, 20, 0.2, Math.PI - 0.2); g.stroke();`);
// A red heart with a yellow shine on a clear background: its own shape and colours.
const HEART = bytes(48, 48, `g.fillStyle = '#d8283c'; g.beginPath(); g.moveTo(24, 42); g.bezierCurveTo(-6, 22, 10, 2, 24, 14); g.bezierCurveTo(38, 2, 54, 22, 24, 42); g.fill(); g.fillStyle = '#f8d048'; g.beginPath(); g.ellipse(15, 15, 5, 3, -0.6, 0, Math.PI * 2); g.fill();`);

/** A daisy, 15 by 15, as a saved tip: five full petals with a soft edge round a faint middle. */
function flower() {
  const w = 15;
  const c = (w - 1) / 2;
  const petals = Array.from({ length: 5 }, (_, k) => [c + 4.1 * Math.cos((k * 2 * Math.PI) / 5 - Math.PI / 2), c + 4.1 * Math.sin((k * 2 * Math.PI) / 5 - Math.PI / 2)]);
  const cells = [];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const dm = Math.hypot(x - c, y - c);
    const dp = Math.min(...petals.map(([px, py]) => Math.hypot(x - px, y - py)));
    cells.push(dm < 1.7 ? 3 : dp < 2.1 ? 1 : dp < 3 ? 2 : 0);
  }
  return { w, h: w, colours: ['#000000', '#000000a0', '#00000060'], cells, keep: false, soft: true };
}

/** Run page code that is async. */
const run = (code) => L.js(`(async () => { ${code} })()`);
const dabSet = (patch) => L.js(`__framelingDab.set(${JSON.stringify(patch)})`);
const press = (sel) => L.js(`document.querySelector(${JSON.stringify(sel)}).click()`);
const useTip = press('.io-modal .io-primary');

module.exports = { L, bytes, WEAVE, LEAVES, SMILEY, HEART, flower, run, dabSet, press, useTip, start, draw, whole, wave, away, shot, picture };
