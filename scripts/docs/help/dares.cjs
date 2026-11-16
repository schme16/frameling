// Help clips for dares. The first: the view dares one after another (a challenge banner, a countdown, a flipped view,
// greyscale, a close zoom), each put back by "Put every dare back". The second: the dares that reach the drawing
// (googly eyes, a splat, a shape, a jelly wobble, a budge), then Undo taking every one back. Each dare is fired with its
// "Try the dare" command, so nothing real is touched and no door is needed. Reduce motion is OFF here: the clips are
// about motion.
const { template, wait, js, cmd } = require('./_lib.cjs');

const say = (ms) => wait(ms);

module.exports = [
  {
    name: 'dares',
    size: [1280, 800],
    prefs: { reduceMotion: false },
    steps: [
      // A sack with a badge on one side, so a flipped view is plain to see.
      template('flour-sack-hop'),
      js('__framelingAudience.demo(); __framelingAudience.on(0)'),
      wait(800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      { rec: '@', crop: [0, 0, 1280, 800], every: 100 },
      wait(600),
      cmd('dares.try.challenge'),
      say(2600),
      cmd('dares.try.countdown'),
      say(2800),
      cmd('dares.stop'),
      wait(500),
      cmd('dares.try.flip'),
      say(2600),
      cmd('dares.stop'),
      wait(500),
      cmd('dares.try.grey'),
      say(2400),
      cmd('dares.stop'),
      wait(500),
      cmd('dares.try.zoom'),
      say(2600),
      cmd('dares.stop'),
      wait(900),
      { rec: 'stop' },
    ],
  },
  {
    name: 'dares-drawing',
    size: [1280, 800],
    // The first-edit tip about explanations would pop up over the clip, so it is off here.
    prefs: { reduceMotion: false, showExplanations: false },
    steps: [
      template('flour-sack-hop'),
      // Audience features on, the interrupt switch OFF (as it starts): the first dare through the gate is turned away.
      js('__framelingAudience.demo(); __framelingAudience.on(0)'),
      // Make the layer that holds the sack the one in hand, on its first frame, so the wobble and the budge have something to move.
      js(`(() => { const s = __frameling.store(); const { doc } = s.get(); for (const l of [...doc.layers].sort((a, b) => (b.name === 'Sack') - (a.name === 'Sack'))) { const c = l.cels[0]; const d = c && doc.drawings[c.drawingId]; if (l.kind === 'vector' && d && d.kind === 'vector' && d.shapes.some((x) => x.type === 'path' || x.type === 'stroke' || x.type === 'fill')) { s.setUi({ activeLayerId: l.id, frame: c.start }); return l.name; } } return 'none'; })()`),
      wait(800),
      { shot: 'kick', crop: [0, 0, 8, 8] },
      { rec: '@', crop: [0, 0, 1280, 800], every: 100 },
      wait(600),
      cmd('audience.show'),
      wait(1200),
      js(`__framelingAudience.submit('dare.googly')`),
      wait(2400),
      { key: 'Escape' },
      wait(500),
      // Now the streamer switches "Let the audience interrupt your drawing" on, and the same dare gets through.
      cmd('audience.drawing'),
      wait(700),
      js(`__framelingAudience.submit('dare.googly')`),
      wait(1800),
      cmd('dares.try.splat'),
      say(1500),
      cmd('dares.try.shape'),
      say(1500),
      cmd('dares.try.jelly'),
      say(1500),
      cmd('dares.try.budge'),
      say(1800),
      cmd('edit.undo'),
      say(500),
      cmd('edit.undo'),
      say(500),
      cmd('edit.undo'),
      say(500),
      cmd('edit.undo'),
      say(500),
      cmd('edit.undo'),
      say(1200),
      { rec: 'stop' },
    ],
  },
];
