// A/B clips for guides on a depth (parallax) layer, into brand/ab/depth-guides/.
//   A: guides, grid and snap lines follow the picked layer (how it is built).
//   B: they stay on the stage, as before.
// The camera pans while a layer at depth 0.5 (then one at depth 1) is picked and the guides show. Run under xvfb:
//   npm run build && SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" node scripts/docs/depth-guides-ab.cjs [--shots]
// With --shots it only takes one picture per variant at three frames, to check the setup.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const OUT = path.join(ROOT, 'brand/ab/depth-guides');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'depth-guides-'));
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const shotsOnly = process.argv.includes('--shots');

// Peaks of the hills, where the guides go, so a guide on the layer stays on its peak as the camera pans.
const CASES = {
  'depth-0_5': { layer: 'Near hills', depth: 0.5, hide: ['Ground', 'Far hills'], x: [245, 694, 1143], y: [300] },
  'depth-1': { layer: 'Far hills', depth: 1, hide: ['Ground', 'Near hills'], x: [82, 531, 980], y: [210] },
};

const setup = (c, onStage) => ({
  eval: `(() => {
    const F = __frameling, S = F.store();
    F.template('camera-parallax');
    S.update('guides', (d) => {
      const L = (n) => d.layers.find((l) => l.name === n);
      L(${JSON.stringify(c.layer)}).depth = ${c.depth};
      for (const n of ${JSON.stringify(c.hide)}) L(n).visible = false;
      d.guides = [...${JSON.stringify(c.x)}.map((at, i) => ({ id: 'gx' + i, axis: 'x', at })), ...${JSON.stringify(c.y)}.map((at, i) => ({ id: 'gy' + i, axis: 'y', at }))];
    });
    const layer = S.get().doc.layers.find((l) => l.name === ${JSON.stringify(c.layer)});
    S.setUi({ activeLayerId: layer.id, tool: 'select', frame: 0 });
    F.anim.view({ throughCamera: true, guides: true, grid: 'square', gridSize: 100, rulers: false });
    F.anim.guidesOnStage(${onStage});
    F.dock.togglePanelsAway(true);
    return true;
  })()`,
});

const CROP = [0, 0, 1280, 800];
const FIT = { eval: `__frameling.run('view.fit')` };
const goto = (f) => ({ eval: `__frameling.store().setUi({ frame: ${f} })` });

function stepsFor(c, onStage, name) {
  const steps = [setup(c, onStage), { wait: 800 }, FIT, { wait: 800 }];
  if (shotsOnly) {
    for (const f of [0, 18, 36]) steps.push(goto(f), { wait: 400 }, { shot: `${name}-f${f}`, crop: CROP });
    return steps;
  }
  steps.push({ rec: name, crop: CROP, every: 50 }, { wait: 600 });
  for (let f = 0; f <= 36; f++) steps.push(goto(f), { wait: 90 });
  steps.push({ wait: 900 }, { rec: 'stop' });
  return steps;
}

fs.mkdirSync(OUT, { recursive: true });
const made = [];
for (const [key, c] of Object.entries(CASES)) {
  for (const [side, onStage] of [['A', false], ['B', true]]) {
    const name = `${key}-${side}`;
    const stepsFile = path.join(work, `${name}.json`);
    fs.writeFileSync(stepsFile, JSON.stringify(stepsFor(c, onStage, name)));
    execFileSync('npx', ['electron', path.join(ROOT, 'scripts/docs/record.cjs'), work, stepsFile, '--prefs', '{"showTips":false}'], { stdio: 'inherit', cwd: ROOT });
    made.push(name);
    if (shotsOnly) continue;
    const mp4 = path.join(OUT, `${name}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(work, name, 'list.txt'), '-vf', 'fps=30,scale=960:-2:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', '-an', mp4], { stdio: 'inherit' });
  }
}
if (shotsOnly) {
  for (const f of fs.readdirSync(work).filter((n) => n.endsWith('.png'))) fs.copyFileSync(path.join(work, f), path.join(process.env.SHOTS_TO || work, f));
  console.log(work);
} else {
  // Side by side: A on the left, B on the right, for each depth.
  for (const key of Object.keys(CASES))
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, `${key}-A.mp4`), '-i', path.join(OUT, `${key}-B.mp4`), '-filter_complex', `[0:v]drawtext=fontfile=${FONT}:text='A  guides follow the picked layer (built)':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.6:boxborderw=8:x=16:y=16[a];[1:v]drawtext=fontfile=${FONT}:text='B  guides stay on the stage (before)':fontcolor=white:fontsize=22:box=1:boxcolor=black@0.6:boxborderw=8:x=16:y=16[b];[a][b]hstack=inputs=2,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', '-an', path.join(OUT, `${key}-A-left-B-right.mp4`)], { stdio: 'inherit' });
}
console.log('made', made.join(', '));
