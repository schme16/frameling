// Quick self-test of the accessibility check: scenarios must work alone, not only after the ones before them.
// Runs a popup and a dialog scenario each on its own with --only, and fails if either finds nothing or exits badly.
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npm run a11y:selftest     (after npm run build)
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const electron = require('electron');
const script = path.join(__dirname, 'a11y.cjs');
let failed = 0;
for (const only of ['popup layer options', 'dialog about']) {
  const r = spawnSync(electron, [script, '--only', only], { encoding: 'utf8', timeout: 120000 });
  const out = `${r.stdout}${r.stderr}`;
  const ok = r.status === 0 && /\n1 views checked: 0 axe rules broken/.test(out) && !/not found|opener not found/.test(out);
  console.log(`${ok ? 'ok' : 'x '} --only "${only}"`);
  if (!ok) {
    failed++;
    console.log(out.split('\n').filter((l) => !/NSS|nss_util/.test(l)).slice(-12).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
