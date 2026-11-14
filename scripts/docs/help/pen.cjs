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
    // The page is taller than a picture: a short clip that draws on the pad, then scrolls down past the pressure curve
    // and its Reset, the leaning and press rows, to Swap my two pen buttons.
    size: [1280, 800],
    steps: [
      template('bouncing-ball'),
      js(`${F}.overlays.openPrefs('pen')`),
      wait(1500),
      ...settle,
      { rec: '@', el: '.ui-prefs', pad: 10, every: 100 },
      wait(500),
      penStroke('.tb-pad'),
      wait(1600),
      // Scroll in small, eased steps until the Swap row is in view, then rest there.
      js(`(() => {
        const pg = document.querySelector('.ui-prefs-page');
        const row = [...document.querySelectorAll('.ui-prefs-page *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Swap my two pen buttons');
        const to = pg.scrollTop + row.getBoundingClientRect().bottom - pg.getBoundingClientRect().bottom + 40;
        const from = pg.scrollTop, t0 = performance.now(), ms = 4200;
        const tick = () => { const k = Math.min(1, (performance.now() - t0) / ms); pg.scrollTop = from + (to - from) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); if (k < 1) setTimeout(tick, 30); };
        tick(); return true;
      })()`),
      wait(5600),
      { rec: 'stop' },
    ],
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
      // The panel is taller than the Preferences window, so let its parents grow for the picture.
      js(`(() => { const e = document.querySelector('.bt-beta'); for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const c = getComputedStyle(p); if (c.overflowY !== 'visible' || c.maxHeight !== 'none') { p.style.overflow = 'visible'; p.style.maxHeight = 'none'; p.style.height = 'auto'; } } return true; })()`),
      wait(300),
      ...shotOf('.bt-beta', 10),
    ],
  },
  {
    // After a crash: the dazed Quill and his offer (a pretend crash, since the capture never really crashes).
    name: 'crash-notes',
    prefs: CALM,
    steps: [template('bouncing-ball'), js(`${F}.crashOffer('ask')`), wait(1500), ...shotOf('.bt-crash', 16)],
  },
  {
    // Installing on Linux: the Diagnostics page, where Quill's pen check starts once the app is running.
    name: 'installing-on-linux',
    prefs: CALM,
    steps: [template('bouncing-ball'), js(`${F}.overlays.openPrefs('diagnostics')`), wait(1500), ...shotOf('.ui-prefs', 10)],
  },
];
