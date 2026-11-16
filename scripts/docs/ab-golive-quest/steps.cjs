// Steps for a clip and a picture per step of the Go live quest, walked as a person would: start it from the
// Streaming tab, press what the ring points at, answer the two questions, and finish with the badge.
// Pretend OBS and Twitch come from the ?debug hooks (__framelingObs, __framelingTwitch); the door and overlay are the
// harness's stand-ins (scripts/ipc-stubs.cjs, with SHOT_STREAM_OK=1 so a copy and a save work).
//
//   scripts/docs/ab-golive-quest/run.sh            both themes, into brand/ab/golive-quest/
//
// Writes the steps as JSON on stdout, for scripts/docs/record.cjs.
const W = 1280;
const H = 800;
const js = (code) => ({ eval: code });
const wait = (ms) => ({ wait: ms });
const press = (sel, after = 900, extra = {}) => ({ clickOn: sel, after, ...extra });
const still = (name) => ({ shot: name });

const steps = [
  js(`__frameling.overlays.openPrefs('streaming')`),
  wait(900),
  js(`__framelingObs.fake()`),
  { rec: 'golive-quest', crop: [0, 0, W, H], every: 70 },
  wait(1500),
  press('[data-testid="streaming-start-quest"]', 1800),
  // 1 audience: the switch, then Quill's two questions
  still('step-1-audience'),
  press('[data-testid="audience.switch"]', 1400),
  still('question-careful'),
  press('[data-testid="choice.audience.strictness.ok"]', 1400),
  still('question-viewers'),
  press('[data-testid="choice.audience.view.ok"]', 1800),
  // 2 the actions door: the Firebot setup file
  still('step-2-door'),
  press('[data-testid="streamdoor.firebotSetup"]', 2200),
  // 3 OBS
  still('step-3-obs'),
  press('[data-obs-section] [role="switch"]', 2200),
  // 4 Stream-safe
  still('step-4-safe'),
  press('[role="switch"][aria-label="Stream-safe mode"]', 1800),
  // 5 Twitch: the approval happens on twitch.tv, so the pretend sign-in stands in for it
  still('step-5-twitch'),
  wait(1200),
  js(`__framelingTwitch.connected('quillfan')`),
  wait(1800),
  // 6 overlay
  still('step-6-overlay'),
  press('[data-testid="streamoverlay.copy"]', 2200),
  // 7 the test
  still('step-7-test'),
  press('[data-testid="streamoverlay.test"]', 1600),
  still('finished'),
  wait(2600),
  { rec: 'stop' },
];
process.stdout.write(JSON.stringify(steps));
