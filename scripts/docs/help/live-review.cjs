// The help clip for live review shows two real windows, a sharer's and a reviewer's, joined by the real link, which this runner
// (one page, stubbed desktop side) cannot open. scripts/e2e/review-media.cjs runs the real app and records both; this entry is
// how the media audit finds the name.
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/review-media.cjs --theme dark --help
module.exports = [
  {
    name: 'live-review',
    external: 'scripts/e2e/review-media.cjs',
    steps: [{ rec: '@' }],
  },
];
