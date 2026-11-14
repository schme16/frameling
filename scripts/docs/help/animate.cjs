// Help pictures and clips for symbols, tweens, camera, artboards, clip flow, rigging, sound and lip sync.
const L = require('./_lib.cjs');

/** Selects the first instance on `layer` at `frame` (0-based) with the Select tool, and goes to that frame. */
const pick = (layer, frame) => L.js(`(() => { const s = __frameling.store(); const { doc } = s.get(); const l = doc.layers.find((x) => x.name === ${JSON.stringify(layer)}); const cel = l.cels.find((c) => c.start <= ${frame} && ${frame} < c.start + c.length); const d = doc.drawings[cel.drawingId]; s.setUi({ tool: 'select', activeLayerId: l.id, frame: ${frame}, selection: d.shapes.filter((x) => x.type === 'instance').slice(0, 1).map((x) => x.id) }); return true; })()`);
/** Goes to a frame on a layer with a tool, nothing selected. */
const goto = (layer, frame, tool = 'select') => L.js(`(() => { const s = __frameling.store(); const l = s.get().doc.layers.find((x) => x.name === ${JSON.stringify(layer)}); s.setUi({ tool: ${JSON.stringify(tool)}, activeLayerId: l.id, frame: ${frame}, selection: [] }); return true; })()`);
/** Scrolls the Properties panel so the first small element starting with this text sits near the top. */
const scrollTo = (text, pad = 8) => L.js(`(() => { const el = [...document.querySelectorAll('h3, h4, label, span, div')].find((e) => e.children.length === 0 && e.textContent.trim().startsWith(${JSON.stringify(text)})); const sc = document.querySelector('.rd-scroll'); if (!el || !sc) return 'missing'; sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - ${pad}; return 'ok'; })()`);
/** Takes the in-betweens off every layer of the open template, then starts the document afresh (no history, no unsaved dot). */
const noTweens = () => L.js(`(() => { const s = __frameling.store(); s.update('setup', (d) => { for (const l of d.layers) for (const c of l.cels || []) delete c.tween; }); s.load(s.get().doc); return true; })()`);
const fit = () => L.cmd('view.fit');
/** The nth row of the Artboards panel's list, as page code (rows, not pixels, so the layout can move). */
const ROW = (n) => `document.querySelectorAll('.ab-panel [data-artboard]')[${n}]`;


/** The puppet with the Bones layer on its first frame, tool and layer picked, the Rig panel open. */
const rigged = (tool = 'pose') => L.js(`(() => { const s = __frameling.store(); const l = s.get().doc.layers.find((x) => x.name === 'Bones'); s.setUi({ tool: ${JSON.stringify(tool)}, activeLayerId: l.id, frame: 0, selection: [] }); return true; })()`);
/** The puppet with no skeleton and nothing attached, to draw one. */
const bare = () => L.js(`(() => { const s = __frameling.store(); s.update('setup', (d) => { d.layers.splice(d.layers.findIndex((l) => l.name === 'Bones'), 1); for (const l of d.layers) delete l.bind; d.clips = []; d.markers = []; }); s.load(s.get().doc); return true; })()`);
/** The puppet standing in its first walking pose for the whole film (one pose key), skeleton kept and attached. */
const standing = () => L.js(`(() => { const s = __frameling.store(); s.update('setup', (d) => { const b = d.layers.find((l) => l.name === 'Bones'); b.cels = [b.cels[0]]; b.cels[0].length = d.length; delete b.cels[0].tween; d.clips = []; d.markers = []; }); s.load(s.get().doc); return true; })()`);
/** Scrolls the Properties panel to the very bottom. */
const scrollEnd = () => L.js(`(() => { const sc = document.querySelector('.rd-scroll'); sc.scrollTop = sc.scrollHeight; return true; })()`);

/** A striped noodle on one layer (720 x 540 stage), to give bones to. */
const noodle = () => L.js(`(() => { const s = __frameling.store(); s.update('setup', (d) => { d.width = 720; d.height = 540; d.background = '#fff4e0'; const l = d.layers.find((x) => x.name === 'Lines'); l.name = 'Noodle'; const dr = d.drawings[l.cels[0].drawingId]; const N = 24, X0 = 130, X1 = 590, W = 38; const top = [], bot = []; for (let i = 0; i <= N; i++) { const t = i / N; const x = X0 + (X1 - X0) * t; const y = 270 + 16 * Math.sin(t * Math.PI * 3); top.push({ x, y: y - W / 2 }); bot.unshift({ x, y: y + W / 2 }); } let k = 0; const id = () => 'noodle' + k++; dr.shapes.push({ id: id(), type: 'path', paths: [{ closed: true, points: [...top, ...bot] }], fill: '#4fd1a5', stroke: { color: '#1d1b26', width: 4, join: 'round', cap: 'round' }, opacity: 1 }); for (let i = 1; i < N - 1; i += 3) dr.shapes.push({ id: id(), type: 'path', paths: [{ closed: true, points: [top[i], top[i + 1], bot[N - i - 1], bot[N - i]] }], fill: '#ffc94a', stroke: null, opacity: 1 }); }); s.load(s.get().doc); s.setUi({ activeLayerId: s.get().doc.layers.find((x) => x.name === 'Noodle').id }); return true; })()`);
/** Three bones along the noodle, drawn with the Bone tool. */
const noodleBones = (after = 600) => [
  L.js(`__frameling.store().setUi({ tool: 'bone' })`),
  { drag: [[353, 269], [443, 269]], steps: 8, delay: 40, after },
  { drag: [[443, 269], [540, 269]], steps: 8, delay: 40, after },
  { drag: [[540, 269], [637, 269]], steps: 8, delay: 40, after: after + 300 },
];
/** Makes the noodle bend with the bones. */
const bendNoodle = () => L.js(`(() => { const s = __frameling.store(); s.setUi({ activeLayerId: s.get().doc.layers.find((x) => x.name === 'Noodle').id }); __frameling.run('rig.bendLayer'); return true; })()`);


/** Real speech for the lip sync clip ("Hello, I am Bob.", scripts/lipsync/say.py): the voice a synthesiser makes, added as a sound. */
const speech = () => L.js(`(async () => { const b = atob(${JSON.stringify(require('fs').readFileSync(require('path').join(__dirname, 'assets', 'hello-speech.wav')).toString('base64'))}); const bytes = Array.from(b, (c) => c.charCodeAt(0)); return await __framelingAudio.addSound(bytes, 'hello', 'audio/wav'); })()`);

// Rough layout of the 1280 x 800 window: the canvas is x 113-877, y 47-491; the right side x 886-1196; the timeline y 500-760.
const CANVAS = [112, 44, 766, 448];
// The puppet's stage and a little around it (720 x 540 document, fitted).
const STAGE = [203, 47, 584, 444];

const entries = [
  {
    name: 'symbols',
    steps: [L.template('bouncing-logo'), L.wait(300), L.panel('library'), pick('Logo', 20), L.wait(1500), { shot: '@', crop: [108, 44, 1164, 450] }],
  },
  {
    name: 'symbols-editing',
    steps: [L.template('bouncing-logo'), L.wait(300), pick('Logo', 20), { key: 'F9' }, L.wait(1500), { shot: '@', crop: CANVAS }],
  },
  {
    name: 'symbol-properties',
    steps: [L.template('bouncing-logo'), L.wait(300), pick('Logo', 24), L.wait(1200), { shot: '@', crop: [886, 92, 310, 660] }],
  },
  {
    // A plain shape picked with the Select tool: the Position and size boxes that symbols already had.
    name: 'selection-numbers',
    steps: [
      L.template('bouncing-ball'),
      L.wait(300),
      L.js(`(() => { const s = __frameling.store(); const { doc } = s.get(); const l = doc.layers.find((x) => x.kind === 'vector' && x.cels.length && doc.drawings[x.cels[0].drawingId].shapes.some((sh) => sh.type === 'path' || sh.type === 'fill')); const sh = doc.drawings[l.cels[0].drawingId].shapes.find((x) => x.type === 'path' || x.type === 'fill'); s.setUi({ tool: 'select', activeLayerId: l.id, frame: 0, selection: [sh.id] }); return true; })()`),
      L.panel('symbol-props'),
      L.wait(1200),
      { shot: '@', crop: [886, 44, 310, 520] },
    ],
  },
  {
    name: 'tween-offer',
    steps: [L.template('morphing-shapes'), noTweens(), fit(), L.wait(500), { click: [361 + 22 * 6, 663] }, { move: [600, 300] }, L.wait(1500), { shot: '@', crop: [112, 505, 766, 235] }],
  },
  {
    name: 'easing',
    steps: [L.template('bouncing-logo'), L.wait(300), pick('Logo', 4), L.wait(500), scrollTo('How it changes', 40), L.wait(1000), { shot: '@', crop: [886, 50, 310, 520] }],
  },
  {
    name: 'motion-paths',
    steps: [
      L.template('bouncing-logo'),
      L.wait(300),
      pick('Logo', 4),
      L.cmd('tween.drawPath'),
      L.wait(300),
      { drag: [[495, 50], [592, 110], [642, 200], [582, 280], [495, 314]], steps: 8, delay: 12 },
      L.wait(300),
      pick('Logo', 8),
      L.wait(600),
      scrollTo('Easing', 25),
      L.wait(1200),
      { shot: '@', crop: [108, 44, 1164, 450] },
    ],
  },
  {
    name: 'tweens',
    steps: [
      L.template('blank-vector'),
      fit(),
      L.js(`__frameling.store().setUi({ tool: 'ellipse' })`),
      L.wait(500),
      { rec: '@', crop: [108, 44, 1172, 716], every: 80 },
      L.wait(700),
      { drag: [[242, 250], [322, 330]], steps: 12, delay: 30 },
      L.wait(900),
      { key: 'T', mods: ['control', 'shift'], after: 1800 },
      L.js(`__frameling.store().setUi({ tool: 'select' })`),
      { drag: [[282, 290], [522, 200], [722, 290]], steps: 14, delay: 40, after: 1200 },
      L.wait(800),
      { click: [207, 560], after: 150 }, { move: [150, 120], after: 3500 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'one-click-motions',
    steps: [
      L.template('blank-vector'),
      fit(),
      L.js(`__frameling.store().setUi({ tool: 'ellipse', fillColor: '#ff6f91' })`),
      L.wait(400),
      { drag: [[457, 220], [537, 300]], steps: 8, delay: 12, after: 300 },
      L.js(`__frameling.store().setUi({ tool: 'select' })`),
      L.wait(600),
      { rec: '@', crop: [0, 0, 1280, 800], every: 80 },
      L.wait(800),
      { clickOn: '.ui-menubar [role=menuitem]', text: 'Frames and motion', after: 900 },
      { clickOn: '[role=menu] [role=menuitem]', text: 'One-click motions', hover: true, after: 1000 },
      { clickOn: '[role=menu] [role=menuitem]', text: 'Make it bounce', hover: true, after: 900 },
      { clickOn: '[role=menu] [role=menuitem]', text: 'Make it bounce', after: 1800 },
      { click: [207, 560], after: 150 }, { move: [150, 120], after: 3500 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'shape-tweens',
    steps: [
      L.template('morphing-shapes'),
      fit(),
      goto('Shape', 0),
      L.wait(500),
      L.wait(800),
      { rec: '@', crop: [108, 44, 782, 716], every: 80 },
      L.wait(1200),
      { click: [207, 560], after: 150 }, { move: [150, 120], after: 4800 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'camera',
    steps: [
      L.template('camera-parallax'),
      L.cmd('camera.pick'),
      L.panel('camera'),
      L.wait(1000),
      fit(),
      L.wait(500),
      { rec: '@', crop: [0, 0, 1280, 800], every: 80 },
      L.wait(1200),
      { click: [207, 560], after: 150 }, { move: [150, 120], after: 6500 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'artboards',
    prefs: { firstDrawn: true }, // no "tuck the explanations away" offer in the picture
    steps: [
      L.js(`__framelingArtboards.load('sprites')`),
      L.wait(400),
      L.panel('artboards'),
      L.js(`__frameling.store().setUi({ tool: 'artboard' })`),
      L.cmd('artboards.fitAll'),
      L.wait(1200),
      { rec: '@', crop: [60, 44, 1220, 716], every: 80 },
      L.wait(1000),
      // Pick the second and third boards, add a blank one and pick it, then back to the first (rows, by place in the list).
      L.js(`${ROW(1)}.click()`),
      L.wait(1300),
      L.js(`${ROW(2)}.click()`),
      L.wait(1300),
      L.js(`document.querySelector('.ab-panel [aria-label="New blank artboard"]').click()`),
      L.wait(1700),
      L.js(`${ROW(3)}.click()`),
      L.wait(1500),
      L.js(`${ROW(0)}.click()`),
      L.wait(1500),
      { rec: 'stop' },
    ],
  },
  {
    name: 'artboards-shots',
    steps: [L.js(`__framelingArtboards.load('shots')`), L.wait(400), L.js(`__framelingArtboards.player()`), L.wait(1500), { click: [704, 622], after: 700 }, { shot: '@', el: '[role=dialog]', pad: 0 }],
  },
  {
    // Three sprites at 6, 12 and 24 fps: the panel names each board's speed, and the Speed box is under the list.
    name: 'artboards-speed',
    prefs: { firstDrawn: true }, // no "tuck the explanations away" offer in the picture
    steps: [
      L.js(`__framelingArtboards.load('speeds')`),
      L.wait(400),
      L.panel('artboards'),
      L.cmd('artboards.fitAll'),
      L.wait(1200),
      L.js(`document.querySelector('.ab-panel').closest('.rd-scroll').scrollTo(0, 0)`),
      L.wait(400),
      { shot: '@', crop: [60, 44, 1220, 716] },
    ],
  },
  {
    name: 'artboards-letterbox',
    steps: [L.js(`__framelingArtboards.load('mixed')`), L.wait(400), L.js(`__framelingArtboards.player()`), L.wait(1500), { click: [704, 622], after: 700 }, { shot: '@', el: '[role=dialog]', pad: 12 }],
  },
  {
    // Four boards that are the frames of one blob, as one sprite sheet: All in order, as one, with Sprite sheet picked.
    name: 'artboards-export',
    steps: [L.js(`__framelingArtboards.load('frames')`), L.wait(400), L.js(`__framelingArtboards.exportDialog('atlas')`), L.wait(1500), L.js(`__framelingArtboards.setExport({ mode: 'joined' })`), L.wait(900), { shot: '@', el: '[role=dialog]', pad: 0 }],
  },
  {
    // Variations: the original and two linked copies side by side; open one to see what it changes; then recolour the
    // original's ground and watch both variations follow (the orange one keeps its own fainter ground).
    name: 'variations',
    prefs: { firstDrawn: true }, // no "tuck the explanations away" offer in the picture
    steps: [
      L.js(`__framelingArtboards.load('variations')`),
      L.wait(400),
      L.panel('artboards'),
      L.cmd('artboards.fitAll'),
      L.wait(1200),
      { rec: '@', crop: [112, 44, 1168, 690], every: 80 },
      L.wait(1200),
      L.js(`${ROW(1)}.click()`),
      L.wait(1500),
      L.js(`document.querySelector('.ab-panel').closest('.rd-scroll').scrollTo(0, 330)`),
      L.wait(1800),
      L.js(`document.querySelector('.ab-panel').closest('.rd-scroll').scrollTo(0, 0)`),
      L.wait(600),
      L.js(`${ROW(0)}.click()`),
      L.wait(1500),
      L.js(`(() => { const s = __frameling.store(); s.update('Recolour the ground', (d) => { const l = d.layers.find((x) => x.name === 'Ground'); const dr = d.drawings[l.cels[0].drawingId]; dr.shapes[0].fill = '#e6c15a'; dr.shapes[1].fill = '#c9a227'; }); return true; })()`),
      L.wait(2200),
      { rec: 'stop' },
    ],
  },
  {
    // Recolour this variation: the dialog open on the square cut, with the ball's pink and the ground's green on their way to new colours.
    name: 'variations-recolour',
    steps: [
      L.js(`__framelingArtboards.load('variations')`),
      L.wait(400),
      L.js(`__framelingArtboards.ops.goToArtboard(__frameling.store().get().doc.artboards[1].id, true)`),
      L.wait(600),
      L.cmd('artboards.recolourVariation'),
      L.wait(900),
      L.js(`(() => { const set = (label, v) => { const i = document.querySelector('input[aria-label="' + label + '"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }; set('New colour for #ff9e1f', '#4f9bd1'); set('New colour for #6abf4b', '#c9a227'); return true; })()`),
      L.wait(900),
      { shot: '@', el: '.io-modal', pad: 0 },
    ],
  },
  {
    name: 'clip-flow',
    steps: [L.template('hero-sprites'), L.panel('clip-flow'), L.cmd('flow.try'), L.wait(800), { click: [987, 149] }, { move: [150, 250] }, L.wait(1000), { shot: '@', crop: [0, 0, 1280, 765] }],
  },
  {
    name: 'rig-attach',
    steps: [L.template('puppet'), L.panel('rig'), rigged(), L.wait(500), scrollTo('Parts', 20), L.wait(500), scrollTo('Left lower arm', 40), L.js(`document.querySelector('.rd-scroll').scrollTop += 40`), L.wait(800), { shot: '@', crop: [886, 50, 310, 700] }],
  },
  {
    name: 'rig-pose-library',
    steps: [L.template('puppet'), L.panel('rig'), rigged(), L.wait(500), scrollTo('Pose library', 220), L.wait(800), { shot: '@', crop: [886, 258, 310, 200] }],
  },
  {
    name: 'rig-posing',
    steps: [
      L.template('puppet'),
      standing(),
      rigged('pose'),
      fit(),
      L.wait(800),
      { rec: '@', crop: STAGE, every: 80 },
      L.wait(900),
      { drag: [[496, 213], [522, 222]], steps: 10, delay: 40, after: 800 },
      { drag: [[541, 300], [567, 235]], steps: 12, delay: 40, after: 800 },
      { drag: [[457, 386], [457, 386]], mods: ['alt'], after: 600 },
      { drag: [[540, 370], [540, 370]], mods: ['alt'], after: 600 },
      { drag: [[494, 298], [494, 335]], steps: 14, delay: 40, after: 1500 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'rig-stretch',
    steps: [
      L.template('puppet'),
      standing(),
      rigged('pose'),
      fit(),
      L.wait(800),
      { rec: '@', crop: [108, 47, 1088, 444], every: 80 },
      L.wait(900),
      { drag: [[494, 285], [494, 262]], mods: ['shift'], steps: 12, delay: 45, after: 1300 },
      { drag: [[1010, 254], [934, 254]], steps: 14, delay: 40, after: 1300 },
      { drag: [[934, 254], [973, 254]], steps: 8, delay: 40, after: 1300 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'rig-bones',
    steps: [
      L.template('puppet'),
      bare(),
      L.js(`__frameling.store().setUi({ tool: 'bone' })`),
      fit(),
      L.wait(800),
      { rec: '@', crop: STAGE, every: 80 },
      L.wait(800),
      // Hips, then a chain up the spine to the head, then an arm and a leg, each from the previous tip.
      { drag: [[495, 291], [495, 264]], steps: 8, delay: 40, after: 900 },
      { drag: [[495, 264], [495, 233]], steps: 8, delay: 40, after: 400 },
      { drag: [[495, 233], [495, 172]], steps: 10, delay: 40, after: 600 },
      { drag: [[495, 242], [493, 273]], steps: 8, delay: 40, after: 400 },
      { drag: [[493, 273], [495, 314]], steps: 8, delay: 40, after: 600 },
      { drag: [[495, 291], [498, 335]], steps: 8, delay: 40, after: 400 },
      { drag: [[498, 335], [495, 376]], steps: 8, delay: 40, after: 400 },
      { drag: [[495, 376], [511, 376]], steps: 6, delay: 40, after: 1000 },
      { key: 'A', mods: ['shift'], after: 1000 },
      L.js(`__frameling.store().setUi({ tool: 'pose' })`),
      { drag: [[495, 314], [542, 262]], steps: 12, delay: 40, after: 1500 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'rig',
    steps: [
      L.template('puppet'),
      L.panel('rig'),
      fit(),
      L.wait(800),
      { rec: '@', crop: [108, 47, 1088, 444], every: 80 },
      L.wait(800),
      { click: [207, 560], after: 150 }, { move: [150, 120], after: 3500 },
      { click: [207, 560], after: 150 }, { move: [150, 120], after: 600 },
      rigged('pose'),
      L.wait(1800),
      { rec: 'stop' },
    ],
  },
  {
    name: 'rig-bend',
    steps: [
      L.template('blank-vector'),
      noodle(),
      fit(),
      L.wait(800),
      { rec: '@', crop: STAGE, every: 80 },
      L.wait(900),
      ...noodleBones(),
      L.wait(700),
      bendNoodle(),
      L.js(`__frameling.store().setUi({ tool: 'pose' })`),
      L.wait(1200),
      { drag: [[398, 269], [398, 269]], mods: ['alt'], after: 800 },
      { drag: [[637, 269], [607, 175]], steps: 16, delay: 45, after: 1000 },
      L.js(`(() => { const s = __frameling.store(); s.setUi({ tool: 'select', activeLayerId: s.get().doc.layers.find((x) => x.name === 'Colour').id }); return true; })()`),
      L.wait(1500),
      { rec: 'stop' },
    ],
  },
  {
    name: 'rig-weights',
    steps: [
      L.template('blank-vector'),
      noodle(),
      fit(),
      L.wait(500),
      ...noodleBones(300),
      bendNoodle(),
      L.js(`__frameling.store().setUi({ tool: 'pose' })`),
      L.wait(600),
      { drag: [[398, 269], [398, 269]], mods: ['alt'], after: 500 },
      { drag: [[637, 269], [607, 175]], steps: 12, delay: 30, after: 800 },
      L.js(`(() => { const s = __frameling.store(); s.setUi({ activeLayerId: s.get().doc.layers.find((x) => x.name === 'Noodle').id }); __frameling.run('rig.paintWeights'); return true; })()`),
      L.wait(6000),
      { rec: '@', crop: [108, 47, 1088, 444], every: 80 },
      L.wait(1000),
      { drag: [[557, 218], [607, 178]], steps: 14, delay: 45, after: 600 },
      { drag: [[562, 214], [602, 182]], steps: 10, delay: 45, after: 900 },
      { click: [1035, 202], after: 700 },
      { drag: [[452, 258], [517, 242]], steps: 14, delay: 45, after: 900 },
      { click: [1125, 202], after: 700 },
      { drag: [[417, 262], [542, 238]], steps: 18, delay: 45, after: 600 },
      { drag: [[542, 238], [417, 262]], steps: 18, delay: 45, after: 1500 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'sound',
    steps: [L.template('lip-sync'), L.wait(300), speech(), L.wait(1500), L.js(`__frameling.store().setUi({ frame: 12 })`), L.wait(1000), { move: [150, 300] }, L.wait(300), { shot: '@', crop: [112, 483, 766, 279] }],
  },
  {
    name: 'lip-sync',
    steps: [
      L.template('lip-sync'),
      L.wait(300),
      speech(),
      L.wait(1500),
      L.panel('lipsync'),
      fit(),
      L.wait(1000),
      { rec: '@', crop: [60, 47, 1220, 715], every: 80 },
      L.wait(1200),
      { click: [1135, 130], after: 2800 },
      { click: [921, 727], after: 700 },
      { click: [206, 539], after: 150 }, { move: [150, 120], after: 4200 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'shape-hints',
    steps: [L.template('morphing-shapes'), L.wait(300), goto('Shape', 28, 'shape-hints'), L.wait(500), scrollTo('In-betweens: morph', 70), L.wait(1200), { shot: '@' }],
  },
];

// Questions Frameling would ask the first time are answered up front, so no sheet gets in the shot.
const ANSWERS = { 'tween.plainDrawing': 'symbol', 'draw.tweenFrame': 'new-key', 'rig.newPose': 'glide', 'motion.room': 'squeeze', 'workspace.follow': 'never' };
const answer = L.js(Object.entries(ANSWERS).map(([k, v]) => `__framelingArtboards.setChoice(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join(';') + ';true');

// No status bar tips either: they change from run to run.
module.exports = entries.map((e) => ({ ...e, prefs: { showTips: false, ...(e.prefs ?? {}) }, steps: [answer, ...e.steps] }));
