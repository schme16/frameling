// Says which drawing engine a mode really gets, and fails if it is not that one. Run it before a long measurement, or
// to see what this machine does:
//
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/lib/gpu-check.cjs card
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/lib/gpu-check.cjs software
//
// Prints one line (see scripts/lib/gpu.cjs) and exits 0, or prints why not and exits 1.
const { app } = require('electron');
const gpu = require('./gpu.cjs');

const mode = process.argv.slice(2).find((a) => a === 'card' || a === 'software') || 'software';
gpu.use(mode);
app.whenReady().then(async () => {
  try {
    await gpu.confirm();
    app.exit(0);
  } catch {
    app.exit(1);
  }
});
