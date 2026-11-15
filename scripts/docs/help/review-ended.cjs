// The help picture for the review-ended topic is a reviewer's real window after the sharer stops, which this runner (one page,
// stubbed desktop side) cannot open. scripts/e2e/review-ended-media.cjs runs the real app and shoots it; this entry is how the
// media audit finds the name.
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/review-ended-media.cjs --theme dark --help
module.exports = [
  {
    name: 'review-ended',
    external: 'scripts/e2e/review-ended-media.cjs',
    steps: [{ shot: '@' }],
  },
];
