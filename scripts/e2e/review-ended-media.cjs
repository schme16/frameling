// Pictures of a reviewer's window, live and then after the sharer stops: the help picture for the "review ended" topic and the
// board's before/after looks. Real app, real link over the in-memory network. Run in xvfb, after `npm run build`:
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/review-ended-media.cjs --theme dark [--help] [--ab <dir>]
//
// --help   writes public/help/review-ended-<theme>.png (the picture the help topic shows)
// --ab DIR writes DIR/live-<theme>.png and DIR/ended-<theme>.png (the same window before and after Stop; run it in a build of the
//          base commit for the "before" and in this one for the "after")
// It only reads what both builds have (the link state on the window), so the same file runs in either.
const { app } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { boot, sleep, DOC, startReview, joinAndAdmit, root } = require('./review-lib.cjs');

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const theme = arg('--theme', 'dark');
const wantHelp = process.argv.includes('--help');
const abDir = process.argv.includes('--ab') ? path.resolve(arg('--ab')) : null;

(async () => {
  const h = await boot({ theme, width: 900, height: 800 });
  const { js, main } = h;
  await js(DOC);
  await js(`window.__frameling.store().setUi({ tool: 'brush', frame: 4 })`);
  await sleep(400);
  const code = await startReview(h);
  const rw = await joinAndAdmit(h, code, 'Sam');
  rw.setBounds({ x: 0, y: 0, width: 1000, height: 720 });
  main.setBounds({ x: 1000, y: 0, width: 600, height: 720 });
  await sleep(1200);
  const shoot = async (name) => {
    const png = (await rw.webContents.capturePage()).toPNG();
    const tmp = path.join(require('node:os').tmpdir(), `rev-${process.pid}-${name}.png`);
    fs.writeFileSync(tmp, png);
    return tmp;
  };
  const live = await shoot('live');
  await js(`document.querySelector('[data-testid="review.stop"]').click()`);
  for (let i = 0; i < 80; i++) {
    if (await js(`document.querySelector('[data-testid="review.win"]')?.dataset.link === 'ended'`, rw).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(900);
  const ended = await shoot('ended');
  if (abDir) {
    fs.mkdirSync(abDir, { recursive: true });
    fs.copyFileSync(live, path.join(abDir, `live-${theme}.png`));
    fs.copyFileSync(ended, path.join(abDir, `ended-${theme}.png`));
    console.log(`wrote ${abDir}/live-${theme}.png and ended-${theme}.png`);
  }
  if (wantHelp) {
    const out = path.join(root, 'public/help', `review-ended-${theme}.png`);
    execFileSync('convert', [ended, '-resize', '1000x>', '-colors', '256', '-dither', 'None', '-strip', '-define', 'png:compression-level=9', `PNG8:${out}`]);
    console.log(`wrote ${out}`);
  }
  for (const f of [live, ended]) fs.rmSync(f, { force: true });
  app.exit(0);
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
