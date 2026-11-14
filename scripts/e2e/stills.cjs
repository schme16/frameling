// The small last-mile exports in the real app: JPEG, WebP (still and moving), app icon set, favicon, sticker pack and
// contact sheet. Starts the built app (dist/), drives exportDocument() the way the Export button does, and checks every
// file with real tools (Pillow, ImageMagick, icotool, unzip). Exits non-zero when anything fails.
//
//   npm run build
//   xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/stills.cjs [outDir]
const { app, BrowserWindow } = require('electron');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2).filter((a) => !a.endsWith('stills.cjs'));
const outDir = path.resolve(argv.find((a) => !a.startsWith('--')) ?? fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-stills-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gpu = require('../lib/gpu.cjs');
gpu.use('software');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const failures = [];
const lines = [];
const check = (ok, what) => {
  if (!ok) failures.push(what);
  lines.push(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  return ok;
};
const sh = (cmd, args) => {
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8' });
  return { out: r.stdout ?? '', err: r.stderr ?? '', code: r.status };
};
const py = (code, ...args) => {
  const r = sh('python3', ['-I', '-c', code, ...args]);
  try {
    return JSON.parse(r.out);
  } catch {
    return { error: r.err || r.out };
  }
};

let win;
const ev = (js) => win.webContents.executeJavaScript(js, true);
const X = (call) => ev(`window.__framelingExport.${call}`);

async function exportTo(name, settings) {
  const dir = path.join(outDir, name);
  fs.mkdirSync(dir, { recursive: true });
  process.env.FRAMELING_AUTOMATION_DIR = dir;
  const defaults = await X('defaults()');
  const res = await X(`run(${JSON.stringify({ ...defaults, ...settings })})`);
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith('_'));
  return { res, dir, files, file: files[0] ? path.join(dir, files[0]) : null };
}

async function main() {
  app.setPath('userData', path.join(outDir, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(outDir, 'misc');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => {
    w.webContents.setBackgroundThrottling(false);
    w.on('show', () => w.hide());
  });
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  win = BrowserWindow.getAllWindows()[0];
  await gpu.confirmOrExit(win);
  for (let i = 0; i < 200; i++) {
    try {
      if (await ev('!!(window.__framelingExport && window.__frameling)')) break;
    } catch {
      // still loading
    }
    await sleep(100);
  }

  // ---- a vector animation (bouncing ball: 1 doc, many frames)
  await X(`load('bouncing-ball')`);
  const doc = await X('doc()');
  const fps = doc.fps;
  const length = doc.length;
  lines.push(`bouncing-ball: ${doc.width} x ${doc.height}, ${length} frames at ${fps} fps`);

  // JPEG
  let r = await exportTo('jpeg', { format: 'jpeg', range: 'frame', scale: 1, jpegQuality: 90 });
  check(r.res.outcome === 'done' && r.file?.endsWith('.jpg'), `JPEG exported a .jpg (${r.res.outcome ?? r.res.error})`);
  if (r.file) {
    const info = py(`import json,sys;from PIL import Image;i=Image.open(sys.argv[1]);print(json.dumps({'f':i.format,'m':i.mode,'s':i.size}))`, r.file);
    check(info.f === 'JPEG' && info.m === 'RGB' && info.s?.[0] === doc.width && info.s?.[1] === doc.height, `JPEG is a ${doc.width}x${doc.height} RGB JPEG (${JSON.stringify(info)})`);
    const q40 = await exportTo('jpeg-q40', { format: 'jpeg', range: 'frame', scale: 1, jpegQuality: 40 });
    check(q40.file && fs.statSync(q40.file).size < fs.statSync(r.file).size, `quality 40 is smaller than 90 (${q40.file && fs.statSync(q40.file).size} < ${fs.statSync(r.file).size})`);
    const white = sh('convert', [r.file, '-crop', '1x1+0+0', '-format', '%[hex:u.p{0,0}]', 'info:']).out.trim();
    lines.push(`  JPEG corner colour ${white}`);
  }

  // Still WebP
  r = await exportTo('webp-still', { format: 'webp', range: 'frame', scale: 1 });
  check(r.res.outcome === 'done' && r.file?.endsWith('.webp'), `still WebP exported (${r.res.outcome ?? r.res.error})`);
  if (r.file) {
    const info = py(`import json,sys;from PIL import Image;i=Image.open(sys.argv[1]);print(json.dumps({'f':i.format,'n':getattr(i,'n_frames',1),'a':getattr(i,'is_animated',False),'s':i.size}))`, r.file);
    check(info.f === 'WEBP' && info.n === 1 && info.s?.[0] === doc.width, `still WebP is one frame (${JSON.stringify(info)})`);
  }

  // Moving WebP, lossy and loop
  r = await exportTo('webp-moving', { format: 'webp', range: 'all', scale: 1, webpQuality: 80, loop: true });
  check(r.res.outcome === 'done', `moving WebP exported (${r.res.outcome ?? r.res.error})`);
  if (r.file) {
    const info = py(`import json,sys;from PIL import Image
i=Image.open(sys.argv[1]);d=[];
for k in range(i.n_frames):
    i.seek(k);i.load();d.append(i.info.get('duration'))
i.seek(0);px=list(i.convert('RGBA').getdata())[:1]
print(json.dumps({'n':i.n_frames,'a':i.is_animated,'loop':i.info.get('loop'),'dur':d,'size':i.size,'px':px}))`, r.file);
    const total = (info.dur ?? []).reduce((a, b) => a + b, 0);
    check(info.a && info.n >= 1, `moving WebP is animated with ${info.n} distinct frames`);
    check(Math.abs(total - Math.round((1000 * length) / fps)) <= length, `moving WebP lasts ${total} ms (want about ${Math.round((1000 * length) / fps)})`);
    check(info.loop === 0, `moving WebP loops for ever (loop=${info.loop})`);
    const once = await exportTo('webp-once', { format: 'webp', range: 'all', scale: 1, loop: false });
    const oi = once.file && py(`import json,sys;from PIL import Image;i=Image.open(sys.argv[1]);print(json.dumps({'loop':i.info.get('loop')}))`, once.file);
    check(oi && oi.loop === 1, `WebP set to play once says so (loop=${oi?.loop})`);
    // Every frame must match what the PNG export of the same frame looks like (lossy, so a small tolerance).
    const png = await exportTo('png-frame0', { format: 'png', range: 'frame', scale: 1 });
    const cmp = py(`import json,sys;from PIL import Image,ImageChops
a=Image.open(sys.argv[1]);a.seek(0);a=a.convert('RGBA');b=Image.open(sys.argv[2]).convert('RGBA')
bg=Image.new('RGBA',a.size,(255,0,255,255));a=Image.alpha_composite(bg,a).convert('RGB');b=Image.alpha_composite(bg,b).convert('RGB')
d=ImageChops.difference(a,b);import statistics
h=d.histogram();tot=sum(i%256*c for i,c in enumerate(h))/(a.size[0]*a.size[1]*3)
print(json.dumps({'mean':tot}))`, r.file, png.file);
    check(cmp.mean !== undefined && cmp.mean < 3, `moving WebP frame 1 looks like the PNG (mean difference ${cmp.mean?.toFixed?.(2)})`);
  }

  // Lossless: exact pixels
  r = await exportTo('webp-lossless', { format: 'webp', range: 'frame', scale: 1, webpLossless: true });
  const png0 = await exportTo('png-for-lossless', { format: 'png', range: 'frame', scale: 1 });
  if (r.file && png0.file) {
    const cmp = py(`import json,sys;from PIL import Image,ImageChops
a=Image.open(sys.argv[1]).convert('RGBA');b=Image.open(sys.argv[2]).convert('RGBA')
print(json.dumps({'same':ImageChops.difference(a,b).getbbox() is None}))`, r.file, png0.file);
    check(cmp.same === true, 'lossless WebP has exactly the PNG\'s pixels');
  }

  // Contact sheet
  r = await exportTo('contact', { format: 'contact', range: 'all', scale: 1, contactSize: 'small', contactColumns: 4 });
  check(r.res.outcome === 'done' && r.file?.endsWith('.png'), `contact sheet exported (${r.res.outcome ?? r.res.error})`);
  if (r.file) {
    const info = py(`import json,sys;from PIL import Image;i=Image.open(sys.argv[1]);print(json.dumps({'s':i.size,'m':i.mode}))`, r.file);
    const rows = Math.ceil(length / 4);
    check(info.s && info.s[0] > 300 && info.s[1] > 100 * rows / 2, `contact sheet is a page of ${info.s?.join('x')} (${rows} rows of 4)`);
    fs.copyFileSync(r.file, path.join(outDir, 'contact-sheet.png'));
  }

  // Icons
  r = await exportTo('icons', { format: 'icons', range: 'frame', scale: 1, iconFiles: { png: true, ico: true, icns: true, mobile: true } });
  check(r.res.outcome === 'done' && r.file?.endsWith('-icons.zip'), `icon set exported (${r.res.outcome ?? r.res.error})`);
  if (r.file) {
    const ex = path.join(r.dir, '_x');
    sh('unzip', ['-q', '-o', r.file, '-d', ex]);
    const list = sh('unzip', ['-Z1', r.file]).out.split('\n').filter(Boolean);
    for (const want of ['ios/icon-1024.png', 'android/mipmap-hdpi/ic_launcher.png', 'android/play-store-512.png']) check(list.includes(want), `icon zip has ${want}`);
    const pngs = list.filter((f) => f.startsWith('png/'));
    check(pngs.length === 8, `icon zip has 8 PNG sizes (${pngs.length})`);
    const sizes = py(`import json,sys,os;from PIL import Image
out={}
for f in sys.argv[2:]:
    out[f]=list(Image.open(os.path.join(sys.argv[1],f)).size)
print(json.dumps(out))`, ex, ...pngs);
    const okSizes = pngs.every((f) => {
      const n = Number(/-(\d+)\.png$/.exec(f)[1]);
      return sizes[f]?.[0] === n && sizes[f]?.[1] === n;
    });
    check(okSizes, 'every PNG is exactly square at the size in its name');
    const ico = list.find((f) => f.endsWith('.ico'));
    const icoInfo = sh('icotool', ['-l', path.join(ex, ico)]).out;
    check(/--width=16/.test(icoInfo) && /--width=256/.test(icoInfo) && /--width=48/.test(icoInfo), `icotool reads the .ico: ${icoInfo.split('\n').length - 1} images`);
    const icns = list.find((f) => f.endsWith('.icns'));
    const icnsInfo = py(`import json,sys;from PIL import Image
i=Image.open(sys.argv[1]);print(json.dumps({'sizes':sorted(set(i.info.get('sizes',[]))) if 'sizes' in i.info else [i.size],'f':i.format}))`, path.join(ex, icns));
    check(icnsInfo.f === 'ICNS', `Pillow reads the .icns (${JSON.stringify(icnsInfo)})`);
    fs.copyFileSync(path.join(ex, 'png/' + pngs.find((f) => f.endsWith('-256.png')).slice(4)), path.join(outDir, 'icon-256.png'));
    sh('convert', [path.join(ex, pngs.find((f) => f.endsWith('-16.png'))), '-filter', 'point', '-resize', '256x256', path.join(outDir, 'icon-16-zoom.png')]);
  }

  // Favicon
  r = await exportTo('favicon', { format: 'favicon', range: 'frame', scale: 1 });
  check(r.res.outcome === 'done' && r.file?.endsWith('-favicon.zip'), `favicon set exported (${r.res.outcome ?? r.res.error})`);
  if (r.file) {
    const list = sh('unzip', ['-Z1', r.file]).out.split('\n').filter(Boolean);
    for (const want of ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest', 'head.html', 'README.txt']) check(list.includes(want), `favicon zip has ${want}`);
    const m = sh('unzip', ['-p', r.file, 'site.webmanifest']).out;
    let ok = false;
    try {
      ok = JSON.parse(m).icons.length === 2;
    } catch {
      ok = false;
    }
    check(ok, 'site.webmanifest is valid JSON with two icons');
  }

  // Stickers
  r = await exportTo('stickers', { format: 'stickers', range: 'frame', scale: 1 });
  check(r.res.outcome === 'done' && r.file?.endsWith('-stickers.zip'), `sticker pack exported (${r.res.outcome ?? r.res.error})`);
  if (r.file) {
    const ex = path.join(r.dir, '_x');
    sh('unzip', ['-q', '-o', r.file, '-d', ex]);
    const list = sh('unzip', ['-Z1', r.file]).out.split('\n').filter(Boolean);
    check(list.some((f) => f.startsWith('slack/') && f.endsWith('.png')) && list.some((f) => f.startsWith('telegram/') && f.endsWith('.webp')), `sticker zip has a folder per app (${list.length} files)`);
    const bad = [];
    for (const f of list) {
      const [svc] = f.split('/');
      const want = { slack: 128, teams: 128, 'discord-emoji': 128, 'discord-sticker': 320, telegram: 512, whatsapp: 512, signal: 512 }[svc];
      const info = py(`import json,sys;from PIL import Image;i=Image.open(sys.argv[1]);print(json.dumps({'s':i.size,'f':i.format}))`, path.join(ex, f));
      if (!(info.s?.[0] === want && info.s?.[1] === want)) bad.push(`${f} ${JSON.stringify(info)}`);
    }
    check(!bad.length, `every sticker is square at its app's size${bad.length ? ': ' + bad.join(', ') : ''}`);
    const wa = list.find((f) => f.startsWith('whatsapp/'));
    check(wa && fs.statSync(path.join(ex, wa)).size <= 100 * 1024, `WhatsApp sticker is under 100 KB (${wa && fs.statSync(path.join(ex, wa)).size} bytes)`);
  }
  const several = await exportTo('stickers-clip', { format: 'stickers', range: 'all', scale: 1, stickerFor: 'slack' });
  if (several.file) {
    const list = sh('unzip', ['-Z1', several.file]).out.split('\n').filter(Boolean);
    check(list.length === length && list.every((f) => f.startsWith('slack/')), `a whole animation gives one Slack picture per frame (${list.length} of ${length})`);
  }
  const none = await exportTo('stickers-none', { format: 'stickers', range: 'frame', scale: 1, stickerFor: '' });
  check(none.res.error || none.res.outcome !== 'done', 'a sticker pack with no app ticked does not export');

  // A drawing that is not square: "Show it all" keeps see-through margins, "Fill the square" has none (A/B picture for the board).
  const abDir = path.join(outDir, 'ab');
  fs.mkdirSync(abDir, { recursive: true });
  const shots = {};
  for (const mode of ['fit', 'fill']) {
    await X(`setChoice('export.iconFit', '${mode}')`);
    const ex = path.join(outDir, `_fit-${mode}`);
    r = await exportTo(`icons-${mode}`, { format: 'icons', range: 'frame', scale: 1, transparent: true, iconFiles: { png: true, ico: false, icns: false } });
    if (r.file) {
      sh('unzip', ['-q', '-o', r.file, '-d', ex]);
      const f = fs.readdirSync(path.join(ex, 'png')).find((n) => n.endsWith('-256.png'));
      shots[mode] = path.join(ex, 'png', f);
    }
    // Painted over the page colour instead of see-through: no pixel may be left empty, in either mode.
    const solid = await exportTo(`icons-${mode}-solid`, { format: 'icons', range: 'frame', scale: 1, transparent: false, iconFiles: { png: true, ico: false, icns: false } });
    if (solid.file) {
      const ex2 = path.join(outDir, `_solid-${mode}`);
      sh('unzip', ['-q', '-o', solid.file, '-d', ex2]);
      const f2 = path.join(ex2, 'png', fs.readdirSync(path.join(ex2, 'png')).find((n) => n.endsWith('-256.png')));
      const a = py(`import json,sys;from PIL import Image;i=Image.open(sys.argv[1]).convert('RGBA');print(json.dumps({'min':i.getchannel('A').getextrema()[0]}))`, f2);
      check(a.min === 255, `"${mode}" with a painted background has no empty pixel (${JSON.stringify(a)})`);
    }
    if (r.file && mode === 'fit') {
      const a = py(`import json,sys;from PIL import Image;i=Image.open(sys.argv[1]).convert('RGBA');print(json.dumps({'top':i.getpixel((128,2))[3],'bottom':i.getpixel((128,253))[3],'max':i.getchannel('A').getextrema()[1]}))`, shots.fit);
      check(a.top === 0 && a.bottom === 0 && a.max === 255, `"Show it all" leaves see-through margins above and below a wide drawing (${JSON.stringify(a)})`);
    }
  }
  await X(`setChoice('export.iconFit', undefined)`);
  if (shots.fit && shots.fill) {
    const flat = (src, label, out) => sh('convert', ['-size', '256x256', 'pattern:checkerboard', '-scale', '400%', '-crop', '256x256+0+0', '+repage', '-fill', '#d8d8de', '-colorize', '40%', src, '-gravity', 'center', '-composite', '-gravity', 'north', '-background', '#f4f4f7', '-splice', '0x34', '-fill', '#3a3a46', '-pointsize', '18', '-annotate', '+0+8', label, out]);
    flat(shots.fit, 'A: Show it all', path.join(abDir, 'a.png'));
    flat(shots.fill, 'B: Fill the square', path.join(abDir, 'b.png'));
    sh('convert', [path.join(abDir, 'a.png'), path.join(abDir, 'b.png'), '-background', '#f4f4f7', '-splice', '16x0', '+append', '-gravity', 'west', '-chop', '16x0', path.join(outDir, 'icon-fit-ab.png')]);
  }

  // ---- a pixel drawing: lossless by default, icons crisp
  await X(`load('hero-sprites')`);
  const pdoc = await X('doc()');
  r = await exportTo('pixel-webp', { format: 'webp', range: 'frame', scale: 1 });
  const ppng = await exportTo('pixel-png', { format: 'png', range: 'frame', scale: 1 });
  if (r.file && ppng.file) {
    const cmp = py(`import json,sys;from PIL import Image,ImageChops
a=Image.open(sys.argv[1]).convert('RGBA');b=Image.open(sys.argv[2]).convert('RGBA')
print(json.dumps({'same':ImageChops.difference(a,b).getbbox() is None}))`, r.file, ppng.file);
    check(cmp.same === true, `pixel art goes into WebP with no loss by default (${pdoc.width}x${pdoc.height})`);
  }
  r = await exportTo('pixel-icons', { format: 'icons', range: 'frame', scale: 1, iconFiles: { png: true, ico: false, icns: false } });
  check(r.res.outcome === 'done', `icons from pixel art (${r.res.outcome ?? r.res.error})`);

  fs.writeFileSync(path.join(outDir, 'report.txt'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  console.log(`\n${failures.length ? failures.length + ' FAILED' : 'all passed'}. Output: ${outDir}`);
}

main()
  .catch((e) => {
    console.error(e);
    failures.push(String(e));
  })
  .finally(() => app.exit(failures.length ? 1 : 0));
