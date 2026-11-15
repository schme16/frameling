// Looks for prefs-layout: the row controls get a base layout (two buttons no longer overlap) and the on/off switch of a
// page or group sits opposite its title. Run the same file against the build before and after, then compare:
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-prefs-layout --renderer <dist/renderer> --out <dir>
const L = require('./../help/_lib.cjs');
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, L.wait(500)];
const CALM = { reduceMotion: true, showTips: false };
const choices = { 'ui.backdropClick': 'stay' };
const WIDE = [1280, 900];
const NARROW = [820, 800];
const NARROWEST = [660, 760];
const tuck = L.js(`__frameling.run('features.streamingOff')`);
const open = (page) => L.js(`__frameling.overlays.openPrefs(${JSON.stringify(page)})`);
const scrollTo = (sel) => L.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.scrollIntoView({ block: 'start' }); })()`);
const unfold = L.js(`(() => { const d = document.querySelector('.features-streaming-more'); if (d) d.open = true; })()`);
const quiet = L.js(`(() => { document.querySelectorAll('.ui-toast, [data-testid^="toast"]').forEach((e) => e.remove()); })()`);
const shot = [...settle, { shot: '@', el: '.ui-prefs', pad: 0 }];

const page = (name, size, steps) => ({ name, prefs: CALM, choices, width: size[0], size, steps: [L.template('bouncing-ball'), L.wait(1000), ...steps, L.wait(1400), quiet, ...shot] });

module.exports = [
  page('streaming-top', WIDE, [open('streaming')]),
  page('streaming-top-narrow', NARROW, [open('streaming')]),
  page('streaming-tucked', WIDE, [tuck, L.wait(600), open('streaming')]),
  page('streaming-tucked-narrow', NARROW, [tuck, L.wait(600), open('streaming')]),
  page('streaming-audience', WIDE, [open('streaming'), L.wait(500), unfold, L.wait(300), scrollTo('[data-testid="audience.prefs"]')]),
  page('streaming-audience-narrow', NARROW, [open('streaming'), L.wait(500), unfold, L.wait(300), scrollTo('[data-testid="audience.prefs"]')]),
  page('streaming-dares-narrow', NARROW, [open('streaming'), L.wait(500), unfold, L.wait(300), scrollTo('[data-testid="dares.prefs"]')]),
  page('streaming-penmods-narrow', NARROW, [open('streaming'), L.wait(500), unfold, L.wait(300), scrollTo('[data-testid="penmods.prefs"]')]),
  page('streaming-overlay-narrow', NARROW, [open('streaming'), L.wait(500), unfold, L.wait(300), scrollTo('[data-testid="streamoverlay.status"]')]),
  page('streaming-door-narrow', NARROW, [open('streaming'), L.wait(500), unfold, L.wait(300), scrollTo('[data-testid="streamdoor.prefs"]')]),
  page('streaming-top-narrowest', NARROWEST, [open('streaming')]),
  page('streaming-dares-narrowest', NARROWEST, [open('streaming'), L.wait(500), unfold, L.wait(300), scrollTo('[data-testid="dares.prefs"]')]),
  page('snapping', WIDE, [open('snapping')]),
  page('snapping-off', WIDE, [open('snapping'), L.wait(700), { clickOn: '.ui-prefs-page [role="switch"]', after: 500 }]),
  page('features', WIDE, [open('features')]),
  page('general-narrow', NARROW, [open('general')]),
  page('performance-narrow', NARROW, [open('performance')]),
];
