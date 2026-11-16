// Before and after pictures for the panel-polish branch: the Artboards panel beside the Layers panel, and the Export
// window with a few formats picked, in both themes, cropped. Run it once per build, naming what the build is.
//
//   npm run build && node scripts/ab/panel-polish.cjs <before|after> <outDir>
//   PANEL_RENDERER=<a vite build --outDir of another checkout> to shoot that build instead of dist/ (the before pictures)
//
// It runs scripts/docs/record.cjs under xvfb for each theme, never on the desktop, then puts the two panels side by side.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const [label, outDir] = process.argv.slice(2);
if (!label || !outDir) throw new Error('usage: panel-polish.cjs <before|after> <outDir>');
const root = path.join(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-polish-'));
fs.mkdirSync(outDir, { recursive: true });

const A = '__framelingArtboards';
const js = (code) => ({ eval: code });
const wait = (ms) => ({ wait: ms });
const q = JSON.stringify;
const pick = (title) => [
  js(`(() => {
    const find = () => [...document.querySelectorAll('.ex-card')].find((b) => b.querySelector('.ex-card-title').textContent.trim().startsWith(${q(title)}));
    if (!find()) document.querySelector('.ex-more')?.click();
    return new Promise((r) => setTimeout(() => { find()?.click(); r(!!find()); }, 150));
  })()`),
  wait(400),
];
const modal = [{ move: [640, 4] }, wait(300)];

const panels = [
  js(`${A}.load('variations')`),
  wait(900),
  js(`__frameling.showPanel('layers')`),
  wait(700),
  { shot: 'layers', el: '.lp-panel', pad: 0 },
  js(`__frameling.showPanel('artboards')`),
  wait(900),
  { shot: 'artboards', el: '.ab-panel', pad: 0 },
];
// The Layers panel with a mask row (purple, a switch where the eye is) and the layer it cuts, beside the Artboards panel.
const masked = [
  js(`${A}.load('variations')`),
  wait(900),
  js(`${A}.setChoice('effects.maskStart', 'hide')`),
  wait(300),
  js(`__frameling.run('layers.addMask')`),
  wait(500),
  js(`__frameling.showPanel('layers')`),
  wait(700),
  { shot: 'mlayers', el: '.lp-panel', pad: 0 },
  js(`__frameling.showPanel('artboards')`),
  wait(900),
  { shot: 'martboards', el: '.ab-panel', pad: 0 },
];
const exports_ = [
  js(`__frameling.template('bouncing-ball')`),
  wait(900),
  js(`__frameling.run('file.export')`),
  wait(900),
  ...modal,
  { shot: 'export-first', el: '.io-modal', pad: 0 },
  ...pick('Sprite sheet'),
  ...modal,
  { shot: 'export-sheet', el: '.io-modal', pad: 0 },
  ...pick('MP4'),
  ...modal,
  { shot: 'export-video', el: '.io-modal', pad: 0 },
];
// The window at the interface sizes people use, with a format that brings plenty of options, and with More formats open.
const at = (scale, name) => [
  js(`__frameling.prefs.set({ uiScale: ${scale} })`),
  wait(500),
  js(`__frameling.template('bouncing-ball')`),
  wait(900),
  js(`__frameling.run('file.export')`),
  wait(900),
  ...pick('Sprite sheet'),
  ...modal,
  // The whole window: at a zoomed interface the page's pixels and the picture's are not the same, so no element crop.
  { shot: name },
];
const more = [
  js(`__frameling.template('bouncing-ball')`),
  wait(900),
  js(`__frameling.run('file.export')`),
  wait(900),
  js(`document.querySelector('.ex-more')?.click()`),
  wait(500),
  ...modal,
  { shot: 'export-more', el: '.io-modal', pad: 0 },
];
const cases = { panels, masked, exports: exports_, more, at150: at(1.5, 'export-150'), at200: at(2, 'export-200') };

for (const theme of ['dark', 'light']) {
  for (const [name, steps] of Object.entries(cases)) {
    const file = path.join(tmp, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(steps));
    const dir = path.join(tmp, `${name}-${theme}`);
    const r = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', 'npx', 'electron', 'scripts/docs/record.cjs', dir, file, '--theme', theme, ...(process.env.PANEL_RENDERER ? ['--renderer', process.env.PANEL_RENDERER] : []), '--prefs', JSON.stringify({ showExplanations: false, reduceMotion: true })], { cwd: root, env: { ...process.env, SHOT_SHOW: '1', SHOT_W: process.env.SHOT_W || '1280', SHOT_H: process.env.SHOT_H || '800' }, encoding: 'utf8' });
    process.stdout.write(r.stdout.split('\n').filter((l) => /done|failed|error/i.test(l)).join('\n') + '\n');
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) fs.copyFileSync(path.join(dir, f), path.join(tmp, `${f.replace('.png', '')}-${theme}.png`));
  }
  // The two panels side by side, with a little air between.
  for (const [out, l, a] of [['panels', 'layers', 'artboards'], ['masked', 'mlayers', 'martboards']]) {
    if (!fs.existsSync(path.join(tmp, `${l}-${theme}.png`))) continue;
    spawnSync('convert', [path.join(tmp, `${l}-${theme}.png`), '-background', 'none', '-splice', '16x0', path.join(tmp, `${a}-${theme}.png`), '+append', path.join(outDir, `${out}-${label}-${theme}.png`)]);
  }
  for (const n of ['export-first', 'export-sheet', 'export-video', 'export-more', 'export-150', 'export-200']) {
    if (fs.existsSync(path.join(tmp, `${n}-${theme}.png`))) fs.copyFileSync(path.join(tmp, `${n}-${theme}.png`), path.join(outDir, `${n}-${label}-${theme}.png`));
  }
}
console.log('pictures in', outDir);
