const F = '__frameling';
const js = (code) => ({ eval: code });
// The "ask the first time" questions (hold longer, mask scope...) are answered up front, so no dialog opens mid-clip.
const ANSWERS = { 'timeline.holdLonger': 'push', 'timeline.newKey': 'blank', 'timeline.frameScope': 'all', 'effects.maskScope': 'below', 'draw.heldFrame': 'new-key', 'draw.tweenFrame': 'new-key', 'canvas.spaceTap': 'play', 'draw.newLayerMode': 'object', 'workspace.pixelDocs': 'stay', 'particles.where': 'new-layer' };
const PANELS = ['tool-options', 'timeline', 'colors', 'palette', 'library', 'tileset', 'symbol-props', 'effects', 'particles', 'camera', 'text', 'rig', 'clip-flow', 'artboards', 'lipsync', 'preview', 'quests', 'help'];
// Properties (the right side) is one long list of sections. Folding all but the ones named in `keep` leaves them in view.
const quiet = (keep, answers = {}) => [js(`localStorage.setItem('frameling.choices.v1', ${JSON.stringify(JSON.stringify({ ...ANSWERS, ...answers }))}); localStorage.setItem('frameling.inspector.v1', ${JSON.stringify(JSON.stringify({ folded: keep.length ? PANELS.filter((p) => !keep.includes(p)) : [] }))}); setTimeout(() => location.reload(), 0); true`), { wait: 2500 }];
/** Opens a starter template in the Animate workspace (the tall timeline) and lets it settle. */
const open = (tpl, more = [], keep = [], answers = {}) => [...quiet(keep, answers), js(`${F}.template(${JSON.stringify(tpl)}); ${F}.dock.applyWorkspace('animate')`), { wait: 1500 }, ...more];
/** Shows one Properties section on its own: opens it, folds the others. */
const only = (id) => [js(`${F}.showPanel(${JSON.stringify(id)})`), { wait: 600 }, js(`document.querySelectorAll('.rd-sec-toggle[aria-expanded=true]').forEach((b) => { if (b.id !== 'rd-sec-h-${id}') b.click(); })`), { wait: 600 }, js(`document.querySelector('.rd-props').scrollTop = 0`), { wait: 500 }];
/** Types text one key at a time into whatever has focus (a newline is Enter). */
const typing = (str) => [...str].map((c) => (c === '\n' ? { eval: `document.execCommand('insertText', false, '\\n')` } : { key: c, after: 70 }));
// Frame f (1 based) of the timeline: the centre x of its cell, at the default zoom in the Animate workspace.
const fx = (f) => 317 + 22 * (f - 1);
const RULER_Y = 523;
const BALL_Y = 595;
const LINES_Y = 595;
const ELLIPSE = [33, 291];
// Where the mouse waits out of the way (the status bar), so no brush circle or tooltip is left in a shot.
const PARK = [640, 785];
// A pink fill and a dark outline, so what is drawn reads clearly in both themes.
const PAINT = { eval: `${F}.store().setUi({ color: '#1d1b26', fillColor: '#ff6f91' })` };
const CROP = [64, 40, 856, 640];

// A pink title typed on the canvas with the Text tool, 110 px, ready to be styled or animated.
const textSetup = (len) => [
  ...open('blank-vector', [js(`${F}.store().update('Length', (d) => { d.length = ${len}; d.fps = 24; d.background = '#fff6e5'; })`), js(`${F}.store().setUi({ color: '#e0447a', fillColor: '#e0447a' })`)], ['text']),
  { eval: `${F}.run('tools.text')`, after: 500 },
  { click: [300, 150], after: 600 },
  ...typing('Once upon\na time...'),
  { wait: 400 },
  { key: 'Escape', after: 800 },
  { click: [990, 511], after: 300 },
  { type: '110' }, js(`document.activeElement.blur()`), { wait: 600 },
  // The title stays up for the whole animation (its drawing is held to the last frame).
  js(`${F}.store().update('Hold the title', (d) => { const l = d.layers.find((x) => x.name === 'Lines'); if (l && l.cels[0]) l.cels[0].length = d.length; })`), { wait: 400 },
];

module.exports = [
  {
    name: 'timeline-scrub',
    steps: [
      ...open('bouncing-ball'),
      { rec: '@', crop: CROP, every: 80 },
      { wait: 500 },
      { drag: [[fx(1), RULER_Y], [fx(16), RULER_Y]], steps: 48, delay: 25, after: 400 },
      { drag: [[fx(16), RULER_Y], [fx(5), RULER_Y]], steps: 33, delay: 25, after: 600 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'timeline-detailed',
    steps: [
      ...open('bouncing-logo'),
      { move: [700, 700] },
      { rec: '@', crop: [64, 430, 856, 336], every: 80 },
      { wait: 700 },
      { click: [84, 592], after: 1000 },
      { click: [757, 642], after: 900 },
      { drag: [[757, 642], [823, 642]], steps: 30, delay: 35, after: 600 },
      { move: [600, 760], after: 1200 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'timeline-holds',
    steps: [
      ...open('bouncing-ball'),
      { move: [700, 720] },
      { rec: '@', crop: CROP, every: 80 },
      { wait: 700 },
      { click: [fx(3), BALL_Y], after: 900 },
      { key: '2', mods: ['alt'], after: 1100 },
      { click: [fx(5), BALL_Y], after: 900 },
      { key: '2', mods: ['alt'], after: 1100 },
      { click: [fx(7), BALL_Y], after: 900 },
      { key: '3', mods: ['alt'], after: 1500 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'onion-skin',
    steps: [
      ...open('bouncing-ball'),
      { click: [fx(4), BALL_Y], after: 600 },
      { move: [700, 720] },
      { rec: '@', crop: CROP, every: 80 },
      { wait: 800 },
      { key: 'O', mods: ['shift'], after: 1500 },
      { key: '.', after: 700 }, { key: '.', after: 700 }, { key: '.', after: 700 }, { key: '.', after: 1000 },
      // Then through a zoomed camera: the ghosts go through it too.
      js(`(() => { const d0 = ${F}.store().get().doc; ${F}.store().update('Camera', (d) => { d.drawings.camdr = { id: 'camdr', kind: 'camera', view: { x: d0.width / 2, y: d0.height / 2 + 30, zoom: 1.5, rotation: 0 } }; d.layers.push({ id: 'camlayer', name: 'Camera', kind: 'camera', visible: true, locked: false, opacity: 1, onion: false, cels: [{ id: 'camcel', start: 0, length: d.length, drawingId: 'camdr' }] }); }); ${F}.run('camera.lookThrough'); })()`),
      { wait: 1500 },
      { key: '.', after: 700 }, { key: '.', after: 700 }, { key: '.', after: 700 }, { key: '.', after: 700 }, { key: '.', after: 1400 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'timeline-playing',
    steps: [
      ...open('bouncing-ball'),
      { move: [700, 720] },
      { rec: '@', crop: CROP, every: 80 },
      { wait: 600 },
      { key: 'Enter', after: 3600 },
      { key: 'Enter', after: 1200 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'timeline-play-range',
    steps: [
      ...open('bouncing-ball'),
      { click: [fx(4), BALL_Y], after: 400 },
      { key: '[', mods: ['alt'], after: 500 },
      { click: [fx(11), BALL_Y], after: 400 },
      { key: ']', mods: ['alt'], after: 500 },
      { click: [fx(8), BALL_Y], after: 400 },
      { move: PARK }, { move: [645, 785], after: 1500 },
      { shot: '@', crop: [64, 430, 850, 240] },
    ],
  },
  {
    name: 'empty-frame-ghost',
    steps: [
      ...open('blank-vector', [PAINT]),
      { click: ELLIPSE },
      { drag: [[400, 180], [470, 250]], steps: 10, delay: 20, after: 500 },
      { click: [fx(5), LINES_Y], after: 500 },
      { move: PARK }, { move: [645, 785], after: 1500 },
      { shot: '@', crop: [64, 40, 856, 570] },
    ],
  },
  {
    name: 'drawings-carry-on',
    steps: [
      ...open('blank-vector', [PAINT]),
      { click: ELLIPSE },
      { move: PARK },
      { rec: '@', crop: [64, 40, 856, 570], every: 80 },
      { wait: 700 },
      { drag: [[390, 170], [450, 230]], steps: 10, delay: 30, after: 600 },
      { click: [fx(5), LINES_Y], after: 450 },
      { drag: [[520, 250], [580, 310]], steps: 10, delay: 30, after: 600 },
      { click: [fx(9), LINES_Y], after: 450 },
      { drag: [[640, 160], [700, 220]], steps: 10, delay: 30, after: 600 },
      { click: [fx(1), LINES_Y], after: 600 },
      { move: PARK },
      { key: 'Enter', after: 3200 },
      { key: 'Enter', after: 1000 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'timeline-layers',
    steps: [
      ...open('bouncing-ball'),
      js(`${F}.run('layers.addPixel')`), { wait: 800 },
      { move: PARK }, { move: [645, 785], after: 1200 },
      { shot: '@', crop: [64, 505, 560, 190] },
    ],
  },
  {
    name: 'timeline-clips-markers',
    steps: [
      ...open('hero-sprites'),
      { click: [460, 571], after: 500 },
      { move: PARK }, { move: [645, 785], after: 1200 },
      { shot: '@', crop: [64, 430, 850, 240] },
    ],
  },
  {
    name: 'reference-layers',
    steps: [
      ...open('bouncing-ball'),
      { click: [140, 649], after: 500 },
      js(`${F}.run('layers.toggleReference')`), { wait: 600 },
      { move: PARK }, { move: [645, 785], after: 1200 },
      { shot: '@', crop: [64, 515, 560, 160] },
    ],
  },
  {
    name: 'effects',
    steps: [
      ...open('bouncing-ball', only('effects')),
      { move: PARK },
      { rec: '@', crop: [64, 40, 1176, 680], every: 90 },
      { wait: 800 },
      { click: [1053, 694], after: 1000 },
      { click: [1134, 751], after: 1000 },
      js(`(() => { const sc = document.querySelector('.rd-props'); const h = document.querySelector('#rd-sec-effects .rd-sec-head'); sc.scrollTop += h.getBoundingClientRect().top - sc.getBoundingClientRect().top - 36; })()`),
      { move: PARK, after: 900 },
      { key: 'Enter', after: 3500 },
      { key: 'Enter', after: 900 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'blend-modes',
    steps: [
      ...open('bouncing-ball', [{ click: [fx(9), 621], after: 500 }, ...only('effects')]),
      { click: [1053, 321], after: 700 },
      { click: [1000, 350], after: 700 },
      { click: [1053, 321], after: 700 },
      { move: [1000, 350], after: 600 },
      { shot: '@', crop: [64, 40, 1176, 680] },
    ],
  },
  {
    name: 'masks',
    steps: [
      ...open('bouncing-ball', [], [], { 'effects.maskScope': 'all' }),
      js(`${F}.run('layers.addVector')`), { wait: 600 },
      js(`${F}.store().update('Name the mask layer', (d) => { const l = d.layers.find((x) => x.name === 'Layer 4'); if (l) l.name = 'Window'; })`),
      { click: ELLIPSE },
      { drag: [[430, 190], [550, 310]], steps: 12, delay: 20, after: 600 },
      js(`${F}.run('layers.useAsMask')`), { wait: 1000 },
      { click: [fx(8), 621], after: 500 },
      { move: PARK }, { move: [645, 785], after: 1200 },
      { shot: '@', crop: [64, 40, 856, 700] },
    ],
  },
  {
    name: 'layer-folders',
    steps: [
      ...open('bouncing-ball', [{ click: [140, 593], after: 400 }]),
      js(`${F}.run('layers.newFolder')`), { wait: 800 },
      js(`(() => { const s = ${F}.store(); const id = Object.keys(s.get().doc.folders || {})[0]; if (id) s.update('Name the folder', (d) => { d.folders[id].name = 'Bouncing ball'; }); return true; })()`), { wait: 500 },
      { click: [140, 649], after: 400 },
      js(`${F}.run('layers.up')`), { wait: 800 },
      { click: [140, 621], after: 500 },
      { log: `${F}.store().get().doc.layers.map((l) => l.name + ':' + (l.folder || '-')).join(' ')` },
      { move: PARK }, { move: [645, 785], after: 1200 },
      { shot: '@', crop: [64, 505, 850, 230] },
    ],
  },
  {
    name: 'particles',
    steps: [
      ...open('blank-vector', [js(`${F}.store().update('Night sky', (d) => { d.background = '#1b2150'; d.length = 48; d.fps = 24; })`), ...only('particles')], ['particles']),
      { move: PARK },
      { rec: '@', crop: [64, 40, 1176, 680], every: 90 },
      { wait: 900 },
      { click: [1114, 349], after: 900 },
      { move: PARK, after: 500 },
      { key: 'Enter', after: 4200 },
      { key: 'Enter', after: 800 },
      { rec: 'stop' },
    ],
  },
  {
    name: 'text',
    steps: [
      ...textSetup(40),
      js(`document.querySelector('#rd-sec-text')?.scrollIntoView({ block: 'start' })`), { wait: 600 },
      { move: PARK, after: 800 },
      { shot: '@', width: 1000 },
    ],
  },
  {
    name: 'text-animators',
    steps: [
      ...textSetup(26),
      js(`[...document.querySelectorAll('.rd-props *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Animate the letters')?.scrollIntoView({ block: 'center' })`), { wait: 600 },
      { move: PARK },
      { rec: '@', crop: [64, 40, 1176, 680], every: 90 },
      { wait: 500 },
      { click: [960, 491], after: 700 },
      { click: [1054, 491], after: 700 },
      { drag: [[fx(1), RULER_Y], [fx(26), RULER_Y]], steps: 50, delay: 40, after: 600 },
      { drag: [[fx(26), RULER_Y], [fx(1), RULER_Y]], steps: 40, delay: 20, after: 300 },
      { drag: [[fx(1), RULER_Y], [fx(26), RULER_Y]], steps: 50, delay: 40, after: 1200 },
      { move: PARK, after: 300 },
      { rec: 'stop' },
    ],
  },
];
