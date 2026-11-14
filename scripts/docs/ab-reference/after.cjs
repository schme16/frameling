// The looks for fn-reference-image and fn-video-reference (brand/ab/reference): a photo placed behind a drawing and traced,
// a clip of moving, sizing, turning and fading it with real mouse drags, the video window, and a clip of the frames landing
// and playing. Each is made in dark and light. Run through help-media.cjs with --entries, --out (see docs/testing.md):
//   SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-reference --out brand/ab/reference
const help = require('../help/reference.cjs');
const { BOX, CLICK, ADD_PHOTO, INK_ON, OPEN_VIDEO, SCRUB, view, T, away, CV, NO_QUESTIONS, at } = help.parts;
const { wait } = require('../help/_lib.cjs');

const REC = { rec: '@', crop: CV, every: 80 };
const STOP = { rec: 'stop' };
const drag = (from, to, steps = 14) => ({ drag: [at(...from), at(...to)], steps, delay: 16 });
const place = (o) => ({ eval: `__framelingReference.place(${JSON.stringify(o)}); 0` });
const fades = (list) => list.flatMap((f) => [place({ fade: f }), wait(90)]);

// The photo is fitted in the page: 72% of its size, its middle at (640, 360). After the first drag it sits 120 across and
// 40 up; the sized corner then drags in towards the middle; the knob drags round a little.
const MID = [640, 360];
const MOVED = [760, 320];

module.exports = [
  { ...help.find((e) => e.name === 'reference-picture'), name: 'reference-traced' },
  {
    name: 'reference-move-scale-fade',
    ...NO_QUESTIONS,
    steps: [
      T('blank-vector'), view(), ADD_PHOTO, wait(1200), INK_ON, CLICK('reference.done'), wait(300), { eval: "__frameling.run('reference.place'); 0" }, away, wait(900),
      REC, wait(500),
      // Move it: drag the picture itself.
      drag(MID, MOVED), wait(400),
      // Size it: drag a corner in towards the middle (the top right one starts at the picture's corner, now moved).
      drag([1336, -40], [1192, 50]), wait(400),
      // Turn it: drag the knob above it round.
      drag([760, -21], [831, -13]), wait(500),
      // Fade it right down and back up.
      ...fades([0.5, 0.4, 0.3, 0.2, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8]), wait(700),
      STOP,
    ],
    poster: 1,
  },
  {
    name: 'video-dialog',
    ...NO_QUESTIONS,
    steps: [T('blank-vector'), OPEN_VIDEO, wait(2500), SCRUB('1.2'), wait(1500), { shot: '@', el: '.im-modal', pad: 12 }],
  },
  {
    name: 'video-frames-land',
    ...NO_QUESTIONS,
    choices: { 'reference.longVideo': 'extend' },
    steps: [
      T('blank-vector'), view(), OPEN_VIDEO, wait(2500), SCRUB('0'), wait(800),
      { ...REC, crop: [110, 40, 960, 700] }, wait(900),
      CLICK('video.go'), wait(2200),
      CLICK('reference.done'), wait(600),
      { eval: "__frameling.run('timeline.play'); 0" }, wait(3200), { eval: "__frameling.run('timeline.play'); 0" }, wait(500),
      STOP,
    ],
    poster: 1,
  },
];
