#!/usr/bin/env node
// Shoots the built app as it looks on a particular screen, under xvfb, at the screen's real size and pixel density.
// A wrapper round scripts/shoot.cjs (same variants, same steps files, same pictures): it starts the virtual screen at the
// screen's size, sizes the window to fill it the way a maximised window would, sets the density, and tells the app which
// screen it is on, so what it fits itself to is what it would fit on the real thing.
//
//   npm run build
//   node scripts/screen-shoot.cjs <outDir> [--screen 4k16 | --size 3840x2160 --dpr 2.5] [variant ...]
//
// --screen picks a preset (below). --size and --dpr override it (or stand alone: 1280x720 with no --dpr is a 1x screen).
// --window WxH uses a window smaller than the screen (in the screen's own units). Variants are shoot.cjs's `name:look:theme[:steps.json]`.
// Names get the screen's name added in front when --screen is used, so shots from different screens sit side by side.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Size is in real pixels. A screen's own units (what the interface is drawn in) are size / dpr.
const PRESETS = {
  // A 16 inch 4K laptop panel is about 275 pixels an inch. Windows recommends 250% there; macOS and Linux settle on 200%.
  '4k16': { size: '3840x2160', dpr: 2.5, note: '16 inch 4K laptop, Windows 250% (1536 x 864 units)' },
  '4k16-200': { size: '3840x2160', dpr: 2, note: '16 inch 4K laptop at 200% (1920 x 1080 units)' },
  '4k16-300': { size: '3840x2160', dpr: 3, note: '16 inch 4K laptop at 300% (1280 x 720 units)' },
  '4k-desktop': { size: '3840x2160', dpr: 1, note: '4K monitor left at 100% (everything small)' },
  '720': { size: '1280x720', dpr: 1, note: 'a 1280 x 720 screen' },
  '768': { size: '1366x768', dpr: 1, note: 'the common 1366 x 768 budget laptop' },
  'fhd-laptop': { size: '1920x1080', dpr: 1.25, note: '14 inch full HD laptop at 125% (1536 x 864 units)' },
  'mba13': { size: '2560x1600', dpr: 2, note: '13 inch retina (1280 x 800 units)' },
};

const args = process.argv.slice(2);
const take = (flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const preset = take('--screen');
let size = take('--size');
let dpr = take('--dpr');
let windowSize = take('--window');
if (args.includes('--list') || args.includes('--help')) {
  for (const [k, v] of Object.entries(PRESETS)) console.log(`${k.padEnd(12)} ${v.size} @ ${v.dpr}  ${v.note}`);
  process.exit(0);
}
const p = preset ? PRESETS[preset] : undefined;
if (preset && !p) {
  console.error(`No screen called "${preset}". Try --list.`);
  process.exit(1);
}
size = size || p?.size || '1280x720';
dpr = Number(dpr ?? p?.dpr ?? 1);
const [sw, sh] = size.split('x').map(Number);
if (!(sw > 0 && sh > 0 && dpr > 0)) {
  console.error('Give --size as WxH in pixels and --dpr as a number, for example --size 3840x2160 --dpr 2.5.');
  process.exit(1);
}
// The window, and the screen as the app is told about it, are in the screen's own units.
const unitsW = Math.round(sw / dpr);
const unitsH = Math.round(sh / dpr);
const [ww, wh] = windowSize ? windowSize.split('x').map(Number) : [unitsW, unitsH];
const [outDir, ...variants] = args;
if (!outDir) {
  console.error('Usage: node scripts/screen-shoot.cjs <outDir> [--screen <preset> | --size WxH --dpr N] [--window WxH] [variant ...]');
  process.exit(1);
}
const display = { id: 1, width: unitsW, height: unitsH, scaleFactor: dpr, workWidth: unitsW, workHeight: unitsH, windowWidth: ww, windowHeight: wh };
const named = preset ? variants.map((v) => `${preset}-${v}`) : variants;
const env = {
  ...process.env,
  SHOT_SHOW: '1',
  SHOT_W: String(ww),
  SHOT_H: String(wh),
  SHOT_SCALE: String(dpr),
  SHOT_DISPLAY: JSON.stringify(display),
};
console.log(`screen ${sw} x ${sh} px at ${dpr}x: the interface sees ${unitsW} x ${unitsH}, window ${ww} x ${wh}`);
const run = spawnSync(
  'xvfb-run',
  ['-a', '-s', `-screen 0 ${sw}x${sh}x24`, 'npx', 'electron', path.join(__dirname, 'shoot.cjs'), outDir, ...(named.length ? named : [`${preset || 'screen'}::`])],
  { stdio: 'inherit', env },
);
process.exit(run.status ?? 1);
