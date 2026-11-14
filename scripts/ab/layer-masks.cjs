// The A/B clip and still for layer masks, in both themes: make a mask, paint on it and see the layer appear through it,
// switch to the layer, turn the mask off and on, then the same frame exported as a PNG beside the screen.
//
//   npm run build
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/ab/layer-masks.cjs [outDir]
//
// Writes layer-masks-<theme>.mp4 (H.264, yuv420p), a poster, and export-vs-screen-<theme>.png into brand/ab/layer-masks/.
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const out = path.resolve(process.argv[2] ?? path.join(root, 'brand/ab/layer-masks'));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-masks-ab-'));
fs.mkdirSync(out, { recursive: true });

const F = '__frameling';
const CROP = [108, 40, 812, 700];
// The stage, in window coordinates (the canvas card in the Animate workspace).
const STAGE = [290, 95, 446, 250];
const ANSWERS = { 'timeline.holdLonger': 'push', 'timeline.newKey': 'blank', 'timeline.frameScope': 'all', 'effects.maskStart': 'show', 'effects.maskLeavesFolder': 'keep', 'draw.heldFrame': 'new-key', 'draw.tweenFrame': 'new-key', 'canvas.spaceTap': 'play', 'draw.newLayerMode': 'object', 'workspace.follow': 'never' };
const FOLDED = ['tool-options', 'colors', 'palette', 'library', 'tileset', 'symbol-props', 'effects', 'particles', 'camera', 'text', 'rig', 'clip-flow', 'artboards', 'lipsync', 'preview', 'quests', 'help'];
const js = (code) => ({ eval: code });
const PARK = [640, 785];

const steps = (name) => [
  js(`localStorage.setItem('frameling.choices.v1', ${JSON.stringify(JSON.stringify(ANSWERS))}); localStorage.setItem('frameling.inspector.v1', ${JSON.stringify(JSON.stringify({ folded: FOLDED }))}); setTimeout(() => location.reload(), 0); true`),
  { wait: 2500 },
  js(`${F}.template('bouncing-ball'); ${F}.dock.applyWorkspace('animate')`),
  { wait: 1500 },
  // Frame 8 on the Ball layer, so the whole clip is one held frame.
  js(`(() => { const s = ${F}.store(); const l = s.get().doc.layers.find((x) => x.name === 'Ball'); s.setUi({ activeLayerId: l.id, frame: 7, color: '#1d1b26', fillColor: '#ff6f91' }); })()`),
  { move: PARK },
  { wait: 700 },
  { rec: name, crop: CROP, every: 70 },
  { wait: 1300 },
  // 1. One press: a mask above the Ball. The Ball vanishes (nothing painted yet) and shows faintly where it is hidden.
  js(`${F}.run('layers.addMask')`),
  { wait: 1800 },
  // 2. Paint on it with an ordinary tool: the Ball shows through, and the rest stays faint.
  js(`${F}.run('tools.ellipse')`),
  { drag: [[470, 175], [565, 240]], steps: 18, delay: 30, after: 400 },
  { move: PARK },
  { wait: 1800 },
  // 3. Switch to the layer without hunting.
  js(`${F}.run('layers.maskSwitch')`),
  { wait: 1500 },
  // 4. Turn the mask off for a moment (the whole Ball shows), then on again.
  { clickOn: '.tl-mask-switch', after: 400 },
  { move: PARK },
  { wait: 1800 },
  { clickOn: '.tl-mask-switch', after: 400 },
  { move: PARK },
  { wait: 1800 },
  { rec: 'stop' },
  // The same frame as the screen shows it (the Ball is the layer being worked on, so no mask wash) and as a PNG export.
  { shot: `screen-${name}`, crop: STAGE },
  { write: `${F}Export.pngBase64(7, 1)`, file: `export-${name}.png` },
];

function run(theme) {
  const name = theme;
  const dir = path.join(work, theme);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'steps.json');
  fs.writeFileSync(file, JSON.stringify(steps(name)));
  const r = cp.spawnSync('npx', ['electron', path.join(root, 'scripts/docs/record.cjs'), dir, file, '--theme', theme, '--prefs', '{"showWelcome":false,"reduceMotion":true,"firstDrawn":true,"showExplanations":false}'], { cwd: root, stdio: 'inherit', env: { ...process.env, SHOT_SHOW: '1' } });
  if (r.status !== 0) throw new Error(`record failed for ${theme}`);
  const enc = cp.spawnSync(path.join(root, 'scripts/docs/encode.sh'), [path.join(dir, name), `layer-masks-${theme}`, 'last', '800'], { cwd: root, stdio: 'inherit', env: { ...process.env, HELP_OUT: out } });
  if (enc.status !== 0) throw new Error(`encode failed for ${theme}`);
  // The screen and the export side by side, the same height, so the two can be compared by eye.
  const screen = path.join(dir, `screen-${name}.png`);
  const exp = path.join(dir, `export-${name}.png`);
  const side = path.join(out, `export-vs-screen-${theme}.png`);
  const th = '280';
  cp.execSync(`convert \\( "${screen}" -resize x${th} \\) \\( "${exp}" -resize x${th} \\) -background none -splice 12x0 +append -strip "${side}"`);
}

for (const theme of ['dark', 'light']) run(theme);
fs.rmSync(work, { recursive: true, force: true });
