// Looks for the menus branch: every top-level menu open, and the bar itself. Run once against the old build and once against
// the new one, with the menu names for that build in MENU_TITLES (a JSON list; the default is the new bar).
//   MENU_TITLES='["File","Edit",...]' SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs \
//     --entries scripts/docs/ab --renderer <dir> --out <dir> --only bar,menu-1,menu-2,...
const L = require('../help/_lib.cjs');
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const titles = JSON.parse(process.env.MENU_TITLES || '["File","Edit","View","Draw","Animate","Pixel","Window","Help"]');
const away = { move: [900, 600] };

const bar = { name: 'bar', size: [1600, 2600], width: 1600, prefs: { reduceMotion: true }, steps: [L.template('bouncing-ball'), L.wait(800), ...settle, { shot: '@', crop: [0, 0, 1600, 46] }] };
const menus = titles.map((t, i) => ({
  name: `menu-${i + 1}`,
  size: [1600, 2600],
  width: 900,
  prefs: { reduceMotion: true },
  steps: [L.template('bouncing-ball'), L.wait(800), { clickOn: '.ui-menubar [role=menuitem]', text: t, after: 700 }, ...settle, { shot: '@', el: '.ui-menu[data-menu]', pad: 8 }],
}));
module.exports = [bar, ...menus];
