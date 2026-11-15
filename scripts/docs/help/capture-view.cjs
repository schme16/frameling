// The help picture for the capture view shows two real windows (the drawing window and the capture view), which this runner
// (one page, stubbed desktop side) cannot open. scripts/e2e/capture-view-media.cjs runs the real app and makes it; this entry
// is how the media audit finds the name.
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/capture-view-media.cjs --help --theme dark
module.exports = [
  {
    name: 'stream-capture',
    external: 'scripts/e2e/capture-view-media.cjs',
    steps: [{ shot: '@' }],
  },
];
