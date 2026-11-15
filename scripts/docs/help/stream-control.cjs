// The help picture for Stream control shows two real windows (the drawing window and the board), which this runner (one
// page, stubbed desktop side) cannot open. scripts/e2e/streamboard-private.cjs runs the real app, checks the board and makes it.
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/streamboard-private.cjs --help --theme dark
module.exports = [
  {
    name: 'stream-control',
    external: 'scripts/e2e/streamboard-private.cjs',
    steps: [{ shot: '@' }],
  },
];
