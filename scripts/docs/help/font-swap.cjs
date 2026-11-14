// Help picture for Swap fonts: a small poster whose text asks for two fonts that are not on this computer, and the window
// open with a replacement picked for each, so the Now and After pictures differ. Also used for the look in brand/ab/font-swap.
const L = require('./_lib.cjs');

const text = (id, t, font, x, y, size, color, weight = 800) => ({ id, type: 'text', text: t, font, size, weight, color, align: 'left', lineHeight: 1.2, letterSpacing: 0, opacity: 1, transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 } });
const SHAPES = [
  text('fs1', 'Moon Picnic', 'Brandon Grotesque', 110, 260, 120, '#e0447a', 900),
  text('fs2', 'Saturday, bring a blanket', 'Gotham Rounded', 114, 400, 56, '#1d1b26', 500),
  text('fs3', 'Snacks provided', 'Nunito', 114, 520, 44, '#1d1b26', 700),
];
const setup = L.js(`__frameling.store().update('Poster', (d) => { d.background = '#fff6e5'; const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...${JSON.stringify(SHAPES)}); })`);
const choose = (id, value) => L.js(`(() => { const el = document.querySelector('[data-testid=${JSON.stringify(id)}]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);

module.exports = [
  {
    name: 'text-swap-fonts',
    prefs: { showTips: false, firstDrawn: true },
    size: [1280, 1000],
    width: 1000,
    steps: [
      L.template('blank-vector'),
      L.wait(1200),
      setup,
      L.wait(600),
      L.cmd('text.swapFonts'),
      L.wait(900),
      choose('fontswap.to.Brandon Grotesque', 'Georgia'),
      choose('fontswap.to.Gotham Rounded', 'Inter'),
      L.wait(1200),
      { move: [640, 990] },
      { shot: '@', el: '.io-modal', pad: 0 },
    ],
  },
];
