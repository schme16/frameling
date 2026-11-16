// Which layer the tools are for (brand/ab/drawing-mode): the rail in the Pixel workspace on a pixel layer and on a vector
// layer, shot in the real app once per theme.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-drawing-mode --renderer <dir> --out <dir>
// Names: <what>-<where>. "rail" is the rail alone; "scene" is the left of the window, rail, canvas and Layers panel, so the
// picture shows what is on screen when the tools go missing.
const { js, wait } = require('../help/_lib.cjs');
const F = '__frameling';
const away = { move: [900, 40] };
const start = (extra = []) => [js(`${F}.dock.applyWorkspace('pixel')`), wait(500), js(`${F}.template('blank-pixel')`), wait(400), ...extra, away, wait(500)];
// A vector layer on top of the pixel one, picked: what a drawing with both looks like after the other layer was clicked.
const onVector = [js(`${F}.run('layers.addVector')`), wait(400)];
const rail = { shot: '@', el: '.ui-tools', pad: 10 };
const scene = { shot: '@', crop: [0, 40, 700, 700] };
const prefs = { showTips: false };

const clickText = (t) => js(`[...document.querySelectorAll('button, [role=menuitem]')].find((b) => b.textContent.includes(${JSON.stringify(t)}))?.click()`);
// Option B, a mock: the same words as a chip in the status bar, to judge where the eye is when the tools go missing.
const statusChip = js(`(() => { const bar = document.querySelector('.ui-status'); const c = document.createElement('span'); c.className = 'ui-status-item'; c.style.cssText = 'font-weight:800;color:#ffcf4a'; c.textContent = 'Vector layer: 5 tools off'; bar.insertBefore(c, bar.children[1]); document.querySelectorAll('.ui-tool-layer, .ui-tool-head-off').forEach((e) => e.remove()); })()`);
const wide = { shot: '@', crop: [0, 40, 700, 760] };

module.exports = [
  { name: 'rail-pixel', prefs, steps: [...start(), rail] },
  { name: 'rail-vector', prefs, steps: [...start(onVector), rail] },
  { name: 'rail-vector-grey', prefs: { ...prefs, toolsOffLayer: 'grey' }, steps: [...start(onVector), rail] },
  { name: 'scene-pixel', prefs, steps: [...start(), scene] },
  { name: 'scene-vector', prefs, steps: [...start(onVector), scene] },
  // The line pressed: the way back, one click away.
  { name: 'menu-vector', prefs, steps: [...start(onVector), js(`document.querySelector('.ui-tool-layer')?.click()`), wait(400), { move: [640, 700] }, wait(300), scene] },
  // The fix, the way a person does it: press the line, press the first item. Two presses, then the pixel tools are back.
  { name: 'fixed-vector', prefs, steps: [...start(onVector), js(`document.querySelector('.ui-tool-layer')?.click()`), wait(300), clickText('Go to the pixel layer'), wait(500), away, wait(500), scene] },
  { name: 'statusbar-vector', prefs, steps: [...start(onVector), statusChip, wait(300), wide] },
  { name: 'statusbar-wide-vector', prefs, steps: [...start(onVector), wait(300), wide] },
];
