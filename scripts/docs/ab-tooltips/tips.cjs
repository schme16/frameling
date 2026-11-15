// Looks for the tooltips branch: the same tip over a toolbar button, a panel, a menu row and near each edge of the window,
// plus a clip of the arrow sliding as a tip is pushed sideways near the right edge. Run once against the old build and once
// against the new one into different folders:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs \
//     --entries scripts/docs/ab-tooltips --renderer <abs dist/renderer> --out <dir>
// The pictures are cropped round the thing so the tip, above or below it, is in frame.
const L = require('../help/_lib.cjs');
const away = { move: [700, 300] };
const hover = (selector, text) => ({ clickOn: selector, ...(text ? { text } : {}), hover: true, after: 1400 });
// A throwaway picture and a pause make the capture repaint, or a fresh tip can come out with no words in it (it does in
// the old build too: a quirk of the software-drawn capture, not of the app).
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const base = { size: [1400, 900], width: 1000, prefs: { reduceMotion: true } };
const open = [L.template('bouncing-ball'), L.wait(900), away, L.wait(200)];
const pic = (name, steps, crop) => ({ name, ...base, steps: [...open, ...steps, ...settle, { shot: '@', crop }] });

// A real element with a real tip, put where the page has none: the bottom edge, and the clip's moving button.
const demo = (css, attrs) => L.js(`(() => { const b = document.createElement('button'); b.id = 'tipdemo'; b.className = 'ui-btn'; b.setAttribute('style', 'position:fixed;z-index:120;${css}'); ${attrs} b.textContent = ''; document.body.appendChild(b); })()`);

module.exports = [
  pic('tip-toolbar', [hover('[title^="Play your animation"]')], [60, 520, 520, 240]),
  pic('tip-panel', [hover('[title^="Lock this layer"]')], [110, 620, 520, 220]),
  pic('tip-menu', [{ clickOn: '.ui-menubar [role=menuitem]', text: 'Edit', after: 700 }, { clickOn: '.ui-menu [role=menuitem]', text: 'Undo', hover: true, after: 1400 }], [0, 0, 900, 360]),
  pic('tip-edge-left', [hover("[data-command='tools.pencil']")], [0, 190, 460, 170]),
  pic('tip-edge-right', [hover("[data-command='view.commandPalette']")], [1040, 0, 360, 150]),
  pic('tip-edge-top', [hover('[title^="Pixel:"], [data-tip^="Pixel:"]')], [840, 0, 520, 150]),
  pic(
    'tip-edge-bottom',
    [demo('left:640px;bottom:6px;width:36px;height:30px;', `b.setAttribute('data-command', 'edit.undo');`), L.js(`document.getElementById('tipdemo').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`), L.wait(1400)],
    [500, 700, 420, 200],
  ),
  {
    name: 'tip-slide',
    ...base,
    width: 640,
    steps: [
      ...open,
      demo('left:900px;top:300px;width:36px;height:30px;', `b.setAttribute('data-command', 'edit.undo');`),
      // The button glides to the right edge and back while its tip is up; the pointer stays away from it.
      L.js(`(() => { const b = document.getElementById('tipdemo'); const t0 = performance.now(); const from = 880, to = 1362, dur = 4200;
        const step = (now) => { const k = Math.min(1, (now - t0 - 1400) / dur); if (now - t0 > 1400) b.style.left = from + (to - from) * (k < 0.5 ? k * 2 : 2 - k * 2) + 'px'; if (now - t0 < 1400 + dur + 600) requestAnimationFrame(step); };
        requestAnimationFrame(step); b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); })()`),
      { rec: '@', crop: [860, 140, 540, 240], every: 50 },
      L.wait(6400),
      { rec: 'stop' },
    ],
  },
];
