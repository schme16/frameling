// Help pictures for drawing with a pen: Preferences, Pen and tablet (the pad, the curve editor), and Quill's pen check.
// Pen events are made in the page, since no pen is plugged in: real PointerEvents with pointerType "pen".
const { cmd, template, wait, js } = require('./_lib.cjs');

const F = '__frameling';
const CALM = { reduceMotion: true };
const tag = (sel) =>
  js(`(() => { document.querySelectorAll('[data-shot]').forEach((e) => e.removeAttribute('data-shot')); const el = document.querySelector(${JSON.stringify(sel)}); if (!el) throw new Error('tag: nothing for ' + ${JSON.stringify(sel)}); el.setAttribute('data-shot', '1'); return true; })()`);
const settle = [{ shot: 'kick', crop: [0, 0, 8, 8] }, wait(500)];
const shotOf = (sel, pad = 12) => [...settle, tag(sel), { shot: '@', el: '[data-shot]', pad }];

/** Draws with a pen on an element: along a swoosh with pressure rising then falling and the pen leaning. */
const penStroke = (sel, n = 40, hover = 8) =>
  js(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    const r = el.getBoundingClientRect();
    const fire = (type, i, buttons, p) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', isPrimary: true,
      clientX: r.left + r.width * (0.08 + 0.84 * i), clientY: r.top + r.height * (0.55 + 0.3 * Math.sin(i * Math.PI * 2)), pressure: p, buttons, button: type === 'pointerdown' ? 0 : -1, tiltX: -30 + 60 * i, tiltY: 20 * Math.sin(i * 6) }));
    for (let k = 0; k < ${hover}; k++) fire('pointermove', k / 100, 0, 0);
    fire('pointerdown', 0.02, 1, 0.05);
    for (let k = 1; k <= ${n}; k++) { const i = k / ${n}; fire('pointermove', i, 1, Math.max(0.03, Math.sin(i * Math.PI))); }
    fire('pointerup', 1, 0, 0);
    return true;
  })()`);

/** The pen check's pad: hover, then a pressure ramp, so the first two steps are ticked off. */
const penCheckSteps = js(`(() => {
  const el = document.querySelector('[data-testid=check-pad]');
  const r = el.getBoundingClientRect();
  const fire = (type, i, buttons, p) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', isPrimary: true,
    clientX: r.left + r.width * (0.1 + 0.8 * i), clientY: r.top + r.height * (0.5 + 0.25 * Math.sin(i * 7)), pressure: p, buttons, button: type === 'pointerdown' ? 0 : -1, tiltX: 0, tiltY: 0 }));
  for (let k = 0; k < 10; k++) fire('pointermove', k / 50, 0, 0);
  fire('pointerdown', 0.1, 1, 0.05);
  for (let k = 1; k <= 30; k++) fire('pointermove', 0.1 + k / 40, 1, k / 30);
  fire('pointerup', 0.9, 0, 0);
  return true;
})()`);

module.exports = [
  {
    name: 'pen-tablet',
    prefs: CALM,
    steps: [template('bouncing-ball'), js(`${F}.overlays.openPrefs('pen')`), wait(1500), penStroke('.tb-pad'), wait(300), js("document.querySelector('.ui-prefs-page').scrollTop = 175"), wait(300), ...shotOf('.ui-prefs', 10)],
  },
  {
    name: 'pen-check',
    prefs: CALM,
    steps: [template('bouncing-ball'), cmd('pen.check'), wait(1500), penCheckSteps, wait(500), ...shotOf('.tb-check', 10)],
  },
  {
    // Telling the makers: the beta report panel with the switch on and a note written, so the picture shows what it asks
    // for and the two buttons. The switch is off for everyone by default, so the shot turns it on first.
    name: 'beta-reports',
    prefs: CALM,
    steps: [
      template('bouncing-ball'),
      js(`${F}.prefs.set({ betaReports: true })`),
      js(`${F}.overlays.openPrefs('diagnostics')`),
      wait(1500),
      js(`(() => { const t = document.querySelector('.bt-beta textarea'); if (!t) return false; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'It froze when I pressed Export, with the timeline open.'); t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`),
      wait(600),
      ...shotOf('.bt-beta', 10),
    ],
  },
  {
    // Installing on Linux: the Diagnostics page, where Quill's pen check starts once the app is running.
    name: 'installing-on-linux',
    prefs: CALM,
    steps: [template('bouncing-ball'), js(`${F}.overlays.openPrefs('diagnostics')`), wait(1500), ...shotOf('.ui-prefs', 10)],
  },
];
