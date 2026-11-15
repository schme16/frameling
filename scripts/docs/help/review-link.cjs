// The help clip for review links shows two windows, the sharer's and a friend's, joined by the real link and a real "second launch"
// carrying the link, which this runner (one page, stubbed desktop side) cannot do. scripts/e2e/review-link-media.cjs runs the real
// app and records it; this entry is how the media audit finds the name.
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/review-link-media.cjs --theme dark --help
module.exports = [
  {
    name: 'review-link',
    external: 'scripts/e2e/review-link-media.cjs',
    steps: [{ rec: '@' }],
  },
];
