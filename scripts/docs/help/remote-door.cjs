// The help clip for the remote door shows a real program driving the real app, which this runner (one page, stubbed desktop
// side) cannot do. scripts/e2e/remote-door-media.cjs runs the real app and a real Python process and records both; this
// entry is how the media audit finds the name.
//   for t in dark light; do xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/remote-door-media.cjs --theme $t; done
module.exports = [
  {
    name: 'remote-door',
    external: 'scripts/e2e/remote-door-media.cjs',
    steps: [{ rec: '@' }],
  },
];
