// Help pictures for reference pictures and for opening a video to trace over. See help-media.cjs for the entry format.
// The "photo" is drawn in the page (a person against a sky) and handed over as JPEG bytes; the video is
// assets/reference-walk.mp4 (a ball bouncing along, made with ffmpeg). Window coordinates are those of drawing.cjs: the canvas
// viewport is 764 x 444 at (113, 47), and view(z, cx, cy) puts stage point (cx, cy) in its middle.
const fs = require('node:fs');
const path = require('node:path');
const { js, wait } = require('./_lib.cjs');

const T = (id) => ({ eval: `__frameling.template(${JSON.stringify(id)})` });
const UI = (o) => ({ eval: `__frameling.store().setUi(${JSON.stringify(o)})` });
const away = { move: [720, 28] };
const CV = [113, 47, 764, 444];
const Z = 0.42;
const view = (z = Z, cx = 640, cy = 360) => UI({ zoom: z, panX: 382 - cx * z, panY: 222 - cy * z });
const at = (x, y, z = Z, cx = 640, cy = 360) => [Math.round(495 + (x - cx) * z), Math.round(269 + (y - cy) * z)];
const INK = '#1d1b26';
const video = JSON.stringify(Array.from(fs.readFileSync(path.join(__dirname, 'assets', 'reference-walk.mp4'))));

// A 1600 x 1000 "photo": a sky, a field and a person standing with one arm up. JPEG bytes, made in the page.
const PHOTO = `(async () => {
  const c = new OffscreenCanvas(1600, 1000);
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 1000);
  sky.addColorStop(0, '#7fb6ee'); sky.addColorStop(0.62, '#f3dcb8'); sky.addColorStop(1, '#c9d7a3');
  g.fillStyle = sky; g.fillRect(0, 0, 1600, 1000);
  g.fillStyle = '#f9eec6'; g.beginPath(); g.arc(1290, 210, 90, 0, 7); g.fill();
  g.fillStyle = '#9bb47a'; g.beginPath(); g.moveTo(0, 740); g.quadraticCurveTo(420, 620, 900, 720); g.quadraticCurveTo(1300, 790, 1600, 690); g.lineTo(1600, 1000); g.lineTo(0, 1000); g.fill();
  g.fillStyle = '#6f8f55'; g.fillRect(0, 880, 1600, 120);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.fillStyle = '#e9b48d'; g.beginPath(); g.arc(800, 330, 62, 0, 7); g.fill();
  g.fillStyle = '#3a3552'; g.beginPath(); g.arc(800, 305, 66, Math.PI, 0); g.fill();
  g.strokeStyle = '#c2506a'; g.lineWidth = 120; g.beginPath(); g.moveTo(800, 470); g.lineTo(800, 640); g.stroke();
  g.lineWidth = 46; g.strokeStyle = '#c2506a';
  g.beginPath(); g.moveTo(745, 450); g.lineTo(640, 560); g.lineTo(615, 680); g.stroke();
  g.beginPath(); g.moveTo(855, 450); g.lineTo(950, 300); g.lineTo(985, 190); g.stroke();
  g.strokeStyle = '#2f4a7a'; g.lineWidth = 54;
  g.beginPath(); g.moveTo(770, 650); g.lineTo(740, 790); g.lineTo(720, 900); g.stroke();
  g.beginPath(); g.moveTo(830, 650); g.lineTo(870, 790); g.lineTo(905, 900); g.stroke();
  const b = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return Array.from(new Uint8Array(await b.arrayBuffer()));
})()`;
const ADD_PHOTO = js(`(async () => { await __framelingReference.add(await ${PHOTO}, 'pose-photo.jpg'); })(); 0`);

// Ink lines over the photo, in stage points (the photo is fitted in the 1280 x 720 page: 72% size, 64 across).
const P = ([x, y]) => ({ x: Math.round(x * 0.72 + 64), y: Math.round(y * 0.72) });
const stroke = (pts, id) => ({ id, type: 'stroke', points: pts.map((p) => ({ ...P(p), p: 0.5 })), brush: { size: 7, thinning: 0, smoothing: 0, streamline: 0, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true }, color: INK, opacity: 1 });
const TRACE = [
  stroke(Array.from({ length: 25 }, (_, i) => [800 + 66 * Math.cos((i / 24) * Math.PI * 2), 330 + 66 * Math.sin((i / 24) * Math.PI * 2)]), 'ra'),
  stroke([[745, 450], [640, 560], [615, 680]], 'rb'),
  stroke([[855, 450], [950, 300], [985, 190]], 'rc'),
  stroke([[740, 470], [740, 640], [860, 640], [860, 470], [740, 470]], 'rd'),
  stroke([[770, 650], [740, 790], [720, 900]], 're'),
  stroke([[830, 650], [870, 790], [905, 900]], 'rf'),
];
const INK_ON = js(`(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(TRACE)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines'); const dr = d.drawings[l.cels[0].drawingId]; dr.shapes.push(...shapes); }); })(); 0`);
const NO_QUESTIONS = { prefs: { showTips: false, firstDrawn: true } };

// The video, scrubbed to a moment so the dialog shows a picture of it.
const SCRUB = (t) => js(`(() => { const el = document.querySelector('[data-testid="video.scrub"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '${t}'); el.dispatchEvent(new Event('input', { bubbles: true })); })(); 0`);
const OPEN_VIDEO = js(`void __framelingImport.video(${video}, 'walk-cycle.mp4'); 0`);
const CLICK = (testid) => js(`document.querySelector('[data-testid="${testid}"]')?.click(); 0`);

// Where the photo's box sits on screen once placed (fitted, in the page's middle) at the zoom above: its corners and the knob.
const BOX = { tl: at(64, 0), tr: at(1216, 0), br: at(1216, 720), bl: at(64, 720), mid: at(640, 360) };

module.exports = [
  {
    // A photo behind the drawing, the ink traced over it, and the bar for placing it open.
    name: 'reference-picture',
    ...NO_QUESTIONS,
    steps: [T('blank-vector'), view(), ADD_PHOTO, wait(1200), INK_ON, away, wait(700), { shot: '@', crop: CV }],
  },
  {
    // The window for a video: the picture at a moment, the stretch, how many pictures, what it says it left out.
    name: 'reference-video',
    ...NO_QUESTIONS,
    steps: [T('blank-vector'), OPEN_VIDEO, wait(2500), SCRUB('1.2'), wait(1500), { shot: '@', el: '.im-modal', pad: 12 }],
  },
];
module.exports.parts = { BOX, CLICK, ADD_PHOTO, INK_ON, OPEN_VIDEO, SCRUB, view, T, UI, away, CV, NO_QUESTIONS, at };
