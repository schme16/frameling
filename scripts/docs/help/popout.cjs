// The help clip for the second window shows two real windows, which this runner (one page, stubbed desktop side) cannot
// open. scripts/e2e/popout-media.cjs runs the real app and records both; this entry is how the media audit finds the name.
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/popout-media.cjs --help
module.exports = [
  {
    name: 'canvas-popout',
    external: 'scripts/e2e/popout-media.cjs',
    steps: [{ rec: '@' }],
  },
];
