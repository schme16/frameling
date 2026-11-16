// A mock of the Pixels / Vectors toggle (brand/ab/unified): the real rail, with the layer line swapped for a two part
// switch by a bit of page script. Nothing in src/ changes; the rail underneath still follows the layer, so what you see
// is what the toggle would drive. Not a feature.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-unified --renderer <dir> --out <dir>
const { js, wait } = require('../help/_lib.cjs');
const F = '__frameling';
const away = { move: [900, 40] };
const prefs = { showTips: false };
const rail = { shot: '@', el: '.ui-tools', pad: 10 };
const scene = { shot: '@', crop: [0, 40, 700, 700] };

// which: 'pixels' | 'vectors'. `words` false gives the one button wide rail, icons only.
const toggle = (which, words = true) =>
  js(`(() => {
    const old = document.querySelector('.ui-tool-layer');
    if (!old) return;
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', 'What you are drawing');
    wrap.style.cssText = 'box-sizing:border-box;display:flex;flex:none;width:calc(100% - 8px);margin:2px 4px 6px;padding:2px;border:1px solid var(--line);border-radius:10px;background:transparent;gap:2px';
    const seg = (label, on, tip) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(on)); b.title = tip;
      b.textContent = label;
      b.style.cssText = 'flex:1 1 0;min-width:0;border:0;border-radius:8px;padding:5px 0;font:inherit;font-size:var(--fs-small);font-weight:800;cursor:pointer;' +
        (on ? 'background:var(--sunny);color:#1d1b26;' : 'background:transparent;color:var(--muted);');
      return b;
    };
    wrap.append(seg('Pixels', ${which === 'pixels'}, 'Pixels: the tools paint pixels'), seg('Vectors', ${which === 'vectors'}, 'Vectors: the tools make shapes'));
    old.replaceWith(wrap);
  })()`);

const vecStart = [js(`${F}.dock.applyWorkspace('draw')`), wait(500), js(`${F}.template('blank')`), wait(400)];
const pixStart = [js(`${F}.dock.applyWorkspace('pixel')`), wait(500), js(`${F}.template('blank-pixel')`), wait(400)];

module.exports = [
  { name: 'rail-vectors', prefs, steps: [...vecStart, toggle('vectors'), away, wait(400), rail] },
  { name: 'rail-pixels', prefs, steps: [...pixStart, toggle('pixels'), away, wait(400), rail] },
  { name: 'scene-pixels', prefs, steps: [...pixStart, toggle('pixels'), away, wait(400), scene] },
  { name: 'scene-vectors', prefs, steps: [...vecStart, toggle('vectors'), away, wait(400), scene] },
  // Today, for the before side: the layer line.
  { name: 'now-pixels', prefs, steps: [...pixStart, away, wait(400), rail] },
  { name: 'now-vectors', prefs, steps: [...vecStart, away, wait(400), rail] },
];
