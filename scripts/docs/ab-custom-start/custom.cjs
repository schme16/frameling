// The Custom starter (brand/ab/custom-start): the form, the sizes kept through a Pixel art tick and untick, animation as a
// tick, and the favourites row. Shot in the real app once per theme.
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-custom-start --renderer <dir> --out <dir>
// Run it against a build from before the change and one from after: the entries only use what both have, except the
// ones named for animation and favourites, which are after-only.
const { js, wait, cmd } = require('../help/_lib.cjs');

const CALM = { showTips: false, firstDrawn: true };
// Page, cards and form together: the region of the sheet that matters.
const openCustom = [cmd('file.new'), wait(1500), { clickOn: '.ui-preset', text: 'Custom' }, wait(500)];
const label = (t) => `[...document.querySelectorAll('.ui-custom label')].find((l) => l.textContent.trim().startsWith(${JSON.stringify(t)}))`;
const focus = (t) => js(`${label(t)}.querySelector('input').focus()`);
const tick = (t) => js(`${label(t)}.querySelector('input').click()`);
const typeInto = (t, v) => [focus(t), { type: String(v) }];
const away = { move: [1100, 40] };

const form = { shot: '@', el: '.ui-custom', pad: 14 };
const whole = { shot: '@', el: '.ui-welcome', pad: 0 };

module.exports = [
  // The form as it opens.
  { name: 'form', prefs: CALM, width: 1100, wait: 3500, steps: [...openCustom, away, wait(300), whole] },
  // Typed 1920 by 1080, then Pixel art ticked, then unticked: the numbers should come back.
  { name: 'size-1-typed', prefs: CALM, width: 1100, wait: 3500, steps: [...openCustom, ...typeInto('Width', 1920), ...typeInto('Height', 1080), away, wait(300), form] },
  { name: 'size-2-ticked', prefs: CALM, width: 1100, wait: 3500, steps: [...openCustom, ...typeInto('Width', 1920), ...typeInto('Height', 1080), tick('Pixel art'), away, wait(300), form] },
  { name: 'size-3-unticked', prefs: CALM, width: 1100, wait: 3500, steps: [...openCustom, ...typeInto('Width', 1920), ...typeInto('Height', 1080), tick('Pixel art'), wait(200), tick('Pixel art'), away, wait(300), form] },
  // After only: animation off (no frame rate), then on.
  { name: 'animation-off', prefs: CALM, width: 1100, wait: 3500, steps: [...openCustom, away, wait(300), form] },
  { name: 'animation-on', prefs: CALM, width: 1100, wait: 3500, steps: [...openCustom, tick('Add animation'), ...typeInto('Frames a second', 24), away, wait(300), form] },
  // After only: one favourite saved from an animation setup, sitting beside the cards.
  {
    name: 'favourites',
    wait: 3500,
    prefs: CALM,
    width: 1100,
    steps: [
      ...openCustom,
      ...typeInto('Width', 1920),
      ...typeInto('Height', 1080),
      tick('Add animation'),
      ...typeInto('Frames a second', 24),
      { clickOn: 'button', text: 'Save as favourite' },
      wait(300),
      js(`document.querySelector('[data-testid="welcome.favourite.name"]').focus()`),
      { type: 'Film 1080' },
      js(`document.querySelector('[data-testid="welcome.favourite.keep"]').click()`),
      wait(1500),
      away,
      wait(800),
      whole,
    ],
  },
];
