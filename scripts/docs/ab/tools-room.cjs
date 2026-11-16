// Looks for the Tools menu card: the Tools menu open, then each of its submenus open in turn. Run once against the old
// build and once against the new one, with that build's submenu names in TOOLS_SUBS (a JSON list).
//   TOOLS_SUBS='["Pick a tool","Arrange, group and transform",...]' SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" \
//     npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab --renderer <dir> --out <dir> --only tools-root,tools-sub-1,...
// scripts/docs/ab/tools-room-sheet.py puts the shots on one sheet per theme.
const L = require('../help/_lib.cjs');
const subs = JSON.parse(process.env.TOOLS_SUBS || '[]');
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const open = [L.template('bouncing-ball'), L.wait(800), { clickOn: '.ui-menubar [role=menuitem]', text: 'Tools', after: 700 }];
const root = { name: 'tools-root', size: [1600, 2600], width: 900, prefs: { reduceMotion: true }, steps: [...open, ...settle, { shot: '@', el: '.ui-menu[data-menu]', pad: 8 }] };
const each = subs.map((t, i) => ({
  name: `tools-sub-${i + 1}`,
  size: [1600, 2600],
  width: 900,
  prefs: { reduceMotion: true },
  steps: [...open, { clickOn: '.ui-menu [data-sub]', text: t, hover: true, after: 700 }, ...settle, { shot: '@', el: '.ui-submenu', pad: 8 }],
}));
module.exports = [root, ...each];
