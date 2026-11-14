// Where the perf harness may put its window. On the user's own desktop it is parked off-screen so nothing shows; in a
// virtual display (xvfb) nobody sees it, and an off-screen window gets no frames there, so it stays on-screen.
//
// PERF_ONSCREEN=1 forces on-screen, PERF_ONSCREEN=0 forces off-screen; otherwise it is on-screen under xvfb only.
const { spawnSync } = require('node:child_process');

function onVirtualDisplay() {
  const display = process.env.DISPLAY;
  if (!display) return false;
  // xvfb-run puts its auth file in its own folder.
  if (/xvfb-run/.test(process.env.XAUTHORITY || '')) return true;
  // Or an Xvfb server for exactly this display (started by hand).
  const r = spawnSync('pgrep', ['-a', 'Xvfb'], { encoding: 'utf8' });
  const esc = display.replace(/\.\d+$/, '').replace(/[^\w:]/g, '');
  return r.status === 0 && new RegExp(`(^|\\s)${esc}(\\s|$)`, 'm').test(r.stdout || '');
}

function keepOnScreen(env = process.env, virtual = onVirtualDisplay) {
  if (env.PERF_ONSCREEN === '1') return true;
  if (env.PERF_ONSCREEN === '0') return false;
  return virtual();
}

module.exports = { keepOnScreen, onVirtualDisplay };
