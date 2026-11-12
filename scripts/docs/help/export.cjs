// Help pictures for exporting: the Export dialog with each format picked, the Godot addon, plugins, your templates.
// Every entry runs in a fresh page per theme; nothing here sets the theme.
const fs = require('node:fs');
const path = require('node:path');
const { template, cmd, js, wait } = require('./_lib.cjs');

const F = '__frameling';
const q = (s) => JSON.stringify(s);

/** Opens the Export dialog (File > Export, or the format's own command) and lets it settle. */
const openExport = (id = 'file.export') => [cmd(id), wait(900)];
/** Picks a format card by its title, opening More formats first when it isn't one of the popular ones. */
const pickFormat = (title) => [
  js(`(() => {
    const find = () => [...document.querySelectorAll('.ex-card')].find((b) => b.querySelector('.ex-card-title').textContent.trim().startsWith(${q(title)}));
    if (!find()) document.querySelector('.ex-more')?.click();
    return new Promise((r) => setTimeout(() => { find()?.click(); r(!!find()); }, 150));
  })()`),
  wait(300),
];
/** Picks an engine in the sprite sheet's "where it's going" row. */
const pickEngine = (title) => [js(`[...document.querySelectorAll('.ex-engine')].find((b) => b.textContent.trim() === ${q(title)})?.click()`), wait(300)];
/** Presses a segmented option (Bones, Packed tight...) by its text. */
const pickOption = (text) => [js(`[...document.querySelectorAll('.ex-options button')].find((b) => b.textContent.trim() === ${q(text)})?.click()`), wait(300)];
const moreFormats = js(`document.querySelector('.ex-more[aria-expanded=false]')?.click()`);
/** The whole dialog box, as the old pictures were. */
// The pointer goes to a corner first so no card looks hovered.
const dialogShot = [{ move: [640, 4] }, wait(400), { shot: '@', el: '.io-modal', pad: 0 }];

/** Answers the "ask once" dialogs (opening pixel art, art size for game engines) when one is up: the nth option, then OK. */
const answerAsk = (n = 0) => [
  js(`(() => { const d = document.querySelector('.ui-choice'); if (!d) return false; d.querySelectorAll('.ui-choice-opt')[${n}]?.click(); setTimeout(() => d.querySelector('.ui-btn-primary')?.click(), 100); return true; })()`),
  wait(700),
];
/** Loads a template; pixel art offers the Pixel workspace first, which we decline so the window stays as it is. */
const load = (id) => [template(id), wait(1200), ...answerAsk(1)];

const sheetEntry = (name, template_, engine, extra = []) => ({
  name,
  steps: [...load(template_), ...openExport(), ...pickFormat('Sprite sheet'), ...pickEngine(engine), wait(500), ...answerAsk(0), ...extra, wait(300), ...dialogShot],
});

// Formats that live under More formats get a taller window, so the whole list and the options show without scrolling.
const formatEntry = (name, template_, command, title, extra = [], size) => ({
  name,
  ...(size ? { size } : {}),
  steps: [...load(template_), ...openExport(command), ...(title ? pickFormat(title) : []), ...extra, wait(300), ...dialogShot],
});

// The two example plugins, read from the repo so the pictures show what ships.
const example = (n) => ({
  'manifest.json': fs.readFileSync(path.join(__dirname, '../../../plugins/examples', n, 'manifest.json'), 'utf8'),
  'main.js': fs.readFileSync(path.join(__dirname, '../../../plugins/examples', n, 'main.js'), 'utf8'),
});
const installPlugin = (n) => [
  js(`window.__framelingPlugins.install(${JSON.stringify(example(n))}); true`),
  wait(900),
  js(`document.querySelector('.plugin-approve .ui-btn-primary')?.click(); true`),
  wait(1500),
];

const TALL = [1280, 960];

const T = '__framelingTemplates';
const keep = (from, meta) => js(`${T}.saveFrom(${q(from)}, ${q({ tags: [], author: 'You', licence: 'personal', ...meta })})`);
const yours = [
  keep('sparkle-fx', { name: 'Fire sparks', kind: 'pixel', blurb: 'Sparkle FX in warm colours. Try it: slow it down to 8 fps for a lazy glow.' }),
  keep('hero-sprites', { name: 'My knight', kind: 'pixel', blurb: 'The hero sprite set with a helmet and a red scarf.' }),
  keep('blink', { name: 'Wink at the camera', kind: 'vector', blurb: 'The blink face, winking on one eye. Try it: make the other eye wink too.' }),
  wait(1200),
];


// What Godot shows for hero.flplay: one AnimatedSprite2D with a clip per animation. Drawn as a plain page over the app, in
// the app's own colours, from the hero template's real pixels (so it follows the theme and the art).
const godotPicture = js(`(() => {
  const doc = __frameling.store().get().doc;
  const hero = doc.layers.find((l) => l.name === 'Pip');
  const drawingAt = (f) => doc.drawings[hero.cels.find((c) => f >= c.start && f < c.start + c.length).drawingId];
  const sprite = (d) => {
    const { width: w, height: h, pixels } = d;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (pixels[(y * w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const c = document.createElement('canvas');
    c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    img.data.set(pixels);
    const full = document.createElement('canvas'); full.width = w; full.height = h; full.getContext('2d').putImageData(img, 0, 0);
    g.drawImage(full, -x0, -y0);
    return c;
  };
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bg);color:var(--text);font:600 22px var(--font, inherit);padding:28px 24px;display:flex;flex-direction:column;box-sizing:border-box';
  box.innerHTML = '<div style="font-size:21px">hero.flplay in Godot: one AnimatedSprite2D, a clip per animation</div>';
  const row = document.createElement('div');
  row.style.cssText = 'flex:1;display:flex;justify-content:space-around;align-items:center;margin-top:8px';
  const sizes = doc.clips.map((c) => sprite(drawingAt(c.start)));
  const big = Math.max(...sizes.flatMap((c) => [c.width, c.height]));
  const scale = Math.floor(100 / big) || 1;
  doc.clips.forEach((clip, i) => {
    const n = clip.end - clip.start + 1;
    const cell = document.createElement('div');
    cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:26px;font:500 14px var(--font, inherit)';
    const c = sizes[i];
    c.style.cssText = 'width:' + c.width * scale + 'px;height:' + c.height * scale + 'px;image-rendering:pixelated;filter:drop-shadow(0 0 0 transparent)';
    cell.appendChild(c);
    const t = document.createElement('div');
    t.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;white-space:nowrap';
    t.innerHTML = '<span style="font-weight:700">' + clip.name + '</span><span style="color:var(--muted)">' + n + ' frames' + (clip.loop ? ', loops' : '') + '</span>';
    cell.appendChild(t);
    row.appendChild(cell);
  });
  box.appendChild(row);
  document.body.appendChild(box);
  return doc.clips.map((c) => c.name + ' ' + c.start + '-' + c.end);
})()`);

const prefsOpen = (page) => js(`__frameling.overlays.openPrefs(${q(page)})`);

module.exports = [
  { name: 'godot-addon', size: [800, 360], steps: [...load('hero-sprites'), godotPicture, wait(500), { shot: '@' }] },
  {
    name: 'templates-yours',
    steps: [template('blink'), wait(500), ...yours, cmd('file.new'), wait(1800), js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Yours'))?.click()`), wait(900), { move: [640, 780] }, wait(300), { shot: '@', crop: [215, 385, 850, 295] }],
  },
  {
    name: 'edit-in-frameling',
    size: [1280, 800],
    steps: [
      template('blink'),
      wait(500),
      js(`localStorage.setItem('frameling.playableLinks.v1', JSON.stringify({[__frameling.store().get().doc.id]: {path: '/games/hero.flplay', update: true, scale: 1, transparent: true, at: Date.now()}})); true`),
      js(`document.querySelector('[data-quest=menu-file]').click()`),
      wait(500),
      js(`document.querySelector('.ui-menu[data-menu] [data-sub=Export]').click()`),
      wait(600),
      { move: [700, 700] },
      wait(300),
      { shot: '@', crop: [60, 0, 650, 792] },
    ],
  },
  {
    name: 'plugins',
    steps: [template('blink'), wait(500), ...installPlugin('contact-sheet'), ...installPlugin('flip-every-other-frame'), wait(5500), prefsOpen('plugins'), wait(1200), { move: [640, 790] }, wait(300), { shot: '@', el: '.ui-prefs, .io-modal, [role=dialog]', pad: 0 }],
  },
  {
    name: 'plugin-exports',
    steps: [template('bouncing-ball'), wait(500), ...installPlugin('contact-sheet'), cmd('plugin.contact-sheet.export.png'), wait(1000), { shot: '@', el: '.plugin-export', pad: 0 }],
  },
  {
    name: 'plugin-panel',
    steps: [template('bouncing-ball'), wait(500), ...installPlugin('flip-every-other-frame'), wait(5500), js(`__frameling.showPanel('plugin.flip-every-other-frame.flip')`), wait(1200), { move: [640, 790] }, wait(300), { shot: '@', crop: [780, 20, 500, 300] }],
  },
  {
    name: 'making-plugins',
    steps: [template('bouncing-ball'), wait(500), js(`window.__framelingPlugins.install(${JSON.stringify(example('contact-sheet'))}); true`), wait(1200), { shot: '@', el: '.plugin-approve', pad: 0 }],
  },
  formatEntry('exporting', 'bouncing-ball', 'file.export', 'MP4 video'),
  formatEntry('export-video', 'bouncing-ball', 'file.export', 'MP4 video', [moreFormats, wait(300)], TALL),
  sheetEntry('export-sheet', 'hero-sprites', 'Any engine (JSON)', pickOption('Art size')),
  sheetEntry('export-godot', 'hero-sprites', 'Godot'),
  sheetEntry('export-godot-bones', 'puppet', 'Godot', [...pickOption('Bones (editable in Godot)')]),
  sheetEntry('export-unity', 'hero-sprites', 'Unity'),
  sheetEntry('export-phaser', 'hero-sprites', 'Phaser'),
  sheetEntry('export-pixi', 'hero-sprites', 'PixiJS'),
  sheetEntry('export-css', 'hero-sprites', 'Web page (CSS)', pickOption('Art size')),
  formatEntry('export-svg', 'bouncing-ball', 'file.export', 'SVG drawing', [], TALL),
  formatEntry('export-lottie', 'bouncing-ball', 'file.exportLottie', undefined, [], TALL),
  formatEntry('export-svg-animated', 'bouncing-ball', 'file.exportSvgAnimated', undefined, [], TALL),
  formatEntry('export-interactives', 'hero-sprites', 'file.exportInteractives'),
  formatEntry('export-psd', 'bouncing-ball', 'file.exportPsd', undefined, [], TALL),
  formatEntry('export-pdf', 'bouncing-ball', 'file.exportPdf', undefined, [], TALL),
  formatEntry('export-prores', 'bouncing-ball', 'file.exportProres', undefined, [], TALL),
];
