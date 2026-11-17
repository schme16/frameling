// Opens Frameling's PSD exports in a real Adobe Photoshop (Windows, through COM) and checks them against what
// Frameling wrote: Photoshop's own flatten of the layers against the finished picture Frameling stores in the file, and
// each layer's name, visibility, opacity, blend mode, clipping and group mask as Photoshop reads them.
//
//   npm run build
//   npx electron scripts/e2e/export.cjs <outDir> --only=psd --skip=files,godot,unity,web
//   node scripts/e2e/photoshop-psd.cjs <outDir> [--keep-going]
//
// Every .psd under <outDir> is checked (the throwaway userdata folder is skipped). Photoshop's pictures and layer
// lists are written beside each file (<psd>.ps.png, <psd>.ps.json). It refuses to start when Photoshop is already open
// (someone may be working in it) unless --keep-going is given; then it uses the open one, closes only the files it
// opened, and leaves Photoshop open. Otherwise it quits Photoshop when done. Exits non-zero on any failure.
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { initializeCanvas, readPsd } = require('ag-psd');
const { readPng } = require('../lib/png-node.cjs');

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--'));
if (!dir || process.platform !== 'win32') {
  console.log('usage (Windows, with Photoshop installed): node scripts/e2e/photoshop-psd.cjs <folder of PSD exports> [--keep-going]');
  process.exit(2);
}
initializeCanvas(
  () => {
    throw new Error('no canvas');
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'userdata' ? [] : walk(path.join(d, e.name))) : e.name.toLowerCase().endsWith('.psd') ? [path.join(d, e.name)] : []));
const psds = walk(path.resolve(dir));
if (!psds.length) {
  console.log(`no .psd files under ${dir}`);
  process.exit(1);
}

// Photoshop
const open = /Photoshop\.exe/i.test(cp.spawnSync('tasklist', ['/FI', 'IMAGENAME eq Photoshop.exe', '/NH'], { encoding: 'utf8' }).stdout ?? '');
if (open && !argv.includes('--keep-going')) {
  console.log('Photoshop is already open, and someone may be working in it: close it, or pass --keep-going');
  process.exit(1);
}
const work = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fl-psd-'));
const fwd = (p) => p.replace(/\\/g, '/');
const list = path.join(work, 'list.txt');
for (const p of psds) for (const ext of ['.ps.png', '.ps.json']) fs.rmSync(p + ext, { force: true });
fs.writeFileSync(list, psds.map(fwd).join('\n') + '\n');
const jsx = path.join(work, 'run.jsx');
fs.writeFileSync(jsx, `var LIST = ${JSON.stringify(fwd(list))};\n` + fs.readFileSync(path.join(__dirname, 'photoshop-psd-check.jsx'), 'utf8'));
const ps1 = path.join(work, 'run.ps1');
fs.writeFileSync(ps1, ['$ErrorActionPreference = "Stop"', '$ps = New-Object -ComObject Photoshop.Application', `$null = $ps.DoJavaScriptFile('${jsx.replace(/'/g, "''")}')`, open ? '' : '$ps.Quit()'].join('\r\n'));
const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1], { encoding: 'utf8', timeout: 30 * 60 * 1000 });
if (r.status !== 0) console.log(`Photoshop run: ${r.stdout}\n${r.stderr}`);
const psLog = fs.existsSync(list + '.result.txt') ? fs.readFileSync(list + '.result.txt', 'utf8') : '';

// Comparing
const flatOrder = (nodes, out = []) => {
  for (const n of nodes) {
    out.push(n);
    if (n.children) flatOrder(n.children, out);
  }
  return out;
};
let failed = 0;
for (const p of psds) {
  const short = path.relative(dir, p);
  const bad = [];
  const b = fs.readFileSync(p);
  const ours = readPsd(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { useImageData: true, skipLayerImageData: true });
  if (!fs.existsSync(p + '.ps.png')) bad.push(`Photoshop could not open or flatten it: ${psLog.split('\n').find((l) => l.includes(fwd(p))) ?? 'no word from Photoshop'}`);
  else {
    // The flatten against the finished picture, both laid on white.
    const ps = readPng(p + '.ps.png');
    const mine = ours.imageData;
    if (ps.width !== mine.width || ps.height !== mine.height) bad.push(`size: Frameling ${mine.width}x${mine.height}, Photoshop ${ps.width}x${ps.height}`);
    else {
      let max = 0, off = 0;
      for (let i = 0; i < mine.width * mine.height; i++) {
        const a1 = mine.data[i * 4 + 3] / 255, a2 = ps.pixels[i * 4 + 3] / 255;
        let worst = Math.abs(a1 - a2) * 255;
        for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(mine.data[i * 4 + c] * a1 + 255 * (1 - a1) - (ps.pixels[i * 4 + c] * a2 + 255 * (1 - a2))));
        max = Math.max(max, worst);
        if (worst > 8) off++;
      }
      if (off) bad.push(`Photoshop's flatten differs from Frameling's picture in ${off} pixels (most ${Math.round(max)} of 255)`);
      else bad.note = `pictures within ${Math.round(max)} of 255`;
    }
    // The layers, top first as Photoshop lists them.
    const got = flatOrder(JSON.parse(fs.readFileSync(p + '.ps.json', 'utf8')).layers);
    const reverse = (nodes) => [...nodes].reverse().map((n) => (n.children ? { ...n, children: reverse(n.children) } : n));
    const want = flatOrder(reverse(ours.children ?? []));
    if (got.length !== want.length) bad.push(`Photoshop finds ${got.length} layers and groups, Frameling wrote ${want.length}`);
    else
      want.forEach((w, i) => {
        const g = got[i];
        const say = (what, a, e) => bad.push(`"${w.name}": ${what} is ${a} in Photoshop, ${e} in the file`);
        if (g.name !== w.name) return say('the name', JSON.stringify(g.name), JSON.stringify(w.name));
        if (g.visible !== !w.hidden) say('visible', g.visible, !w.hidden);
        if (Math.abs(g.opacity - Math.round((w.opacity ?? 1) * 100)) > 1) say('the opacity', g.opacity, Math.round((w.opacity ?? 1) * 100));
        if (!!w.children !== (g.type === 'group')) say('a group', g.type === 'group', !!w.children);
        if (!w.children && !!g.clipped !== !!w.clipping) say('clipped', !!g.clipped, !!w.clipping);
        if (!!g.userMask !== !!w.mask) say('masked', !!g.userMask, !!w.mask);
        // Photoshop says a pass-through group is "PASSTHROUGH"; the rest by name.
        const blend = String(g.blend).toLowerCase().replace(/[^a-z]/g, '');
        const theirs = (w.blendMode ?? 'normal').replace(/[^a-z]/gi, '').toLowerCase();
        if (blend !== theirs) say('the blend mode', g.blend, w.blendMode);
      });
  }
  if (bad.length) failed++;
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${short}${bad.note ? `  (${bad.note})` : ''}`);
  for (const m of bad) console.log(`       - ${m}`);
}
console.log(`\n${psds.length - failed} of ${psds.length} PSD files passed in Photoshop.`);
fs.rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
