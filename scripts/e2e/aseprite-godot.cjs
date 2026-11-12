// An Aseprite sprite exported from the real Export dialog as a Godot sprite sheet comes out at real size (one art pixel
// is one pixel, no 8x), with no question, and the real Godot reads it. Skipped unless GODOT_BIN points at a Godot 4 editor.
//
//   npm run build
//   GODOT_BIN=/path/to/godot xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/e2e/aseprite-godot.cjs
const { app, BrowserWindow } = require('electron');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const GODOT = process.env.GODOT_BIN;
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-ase-godot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (ok, what) => (ok ? true : (failures.push(what), false));

async function main() {
  app.setPath('userData', path.join(out, 'userdata'));
  process.env.FRAMELING_DEV_URL = pathToFileURL(path.join(root, 'dist/renderer/index.html')).href + '?debug=1';
  process.env.FRAMELING_AUTOMATION_DIR = path.join(out, 'files');
  fs.mkdirSync(process.env.FRAMELING_AUTOMATION_DIR, { recursive: true });
  require(path.join(root, 'dist/main/main.cjs'));
  app.on('browser-window-created', (_e, w) => w.on('show', () => w.hide()));
  await app.whenReady();
  for (let i = 0; i < 100 && !BrowserWindow.getAllWindows().length; i++) await sleep(100);
  const win = BrowserWindow.getAllWindows()[0];
  const ev = (js) => win.webContents.executeJavaScript(js, true);
  for (let i = 0; i < 200 && !(await ev('!!(window.__framelingIo && window.__frameling && window.__framelingExport)').catch(() => false)); i++) await sleep(100);
  await sleep(500);

  // No "switch to Pixel?" question in the way, and the sample sprite (28 x 24 frames, art pixel 1) opened like a double-click.
  await ev(`__framelingExport.setChoice('workspace.pixelDocs', 'stay'); __framelingExport.setChoice('pixel.keys', 'frameling'); __frameling.overlays.closeSheet()`);
  const file = path.join(root, 'scripts/docs/help/assets/slime-bounce.aseprite');
  check(await ev(`window.__framelingIo.openPath(${JSON.stringify(file)})`), 'the Aseprite file did not open');
  await sleep(500);
  const size = await ev(`(() => { const d = __frameling.store().get().doc; return [d.width, d.height, d.length]; })()`);
  check(size[0] === 28 && size[1] === 24, `unexpected sprite size ${size}`);

  const click = (sel, text) => ev(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`);
  await ev(`__frameling.run('file.export')`);
  await sleep(800);
  check(await click('.ex-card', 'Sprite sheet'), 'no Sprite sheet card');
  await sleep(200);
  check(await click('.ex-engine', 'Godot'), 'no Godot button');
  await sleep(300);
  const notes = await ev(`[...document.querySelectorAll('.ex-note')].map((n) => n.textContent).join(' | ')`);
  check(/Real size: one art pixel is one pixel \(28 × 24/.test(notes), `no Real size note: ${notes}`);
  check(!(await ev(`/Export this pixel art at its real size/i.test(document.body.textContent)`)), 'a question was asked');
  check(await click('.ex-go', 'Export'), 'no Export button');
  await sleep(3000);

  const files = fs.readdirSync(process.env.FRAMELING_AUTOMATION_DIR);
  check(['slime-bounce.png', 'slime-bounce.tres', 'slime-bounce.json'].every((n) => files.includes(n)), `files: ${files}`);
  const png = fs.readFileSync(path.join(process.env.FRAMELING_AUTOMATION_DIR, 'slime-bounce.png'));
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  // 7 frames of 28 x 24 on a sheet: never 224 x 192 frames (the old 8x).
  check(w <= 28 * 7 && h <= 24 * 7, `sheet is ${w} x ${h}, bigger than real size`);
  console.log(`sheet ${w} x ${h}`);

  if (GODOT && !failures.length) {
    const proj = path.join(out, 'godot');
    fs.mkdirSync(path.join(proj, 'sprites'), { recursive: true });
    for (const n of files) fs.copyFileSync(path.join(process.env.FRAMELING_AUTOMATION_DIR, n), path.join(proj, 'sprites', n));
    fs.writeFileSync(path.join(proj, 'project.godot'), 'config_version=5\n\n[application]\nconfig/name="e2e"\n');
    fs.writeFileSync(
      path.join(proj, 'check.gd'),
      `extends SceneTree
func _init():
	var sf: SpriteFrames = load("res://sprites/slime-bounce.tres")
	for a in sf.get_animation_names():
		var t = sf.get_frame_texture(a, 0)
		print("ANIM " + a + " " + str(sf.get_frame_count(a)) + " " + str(t.region.size.x) + "x" + str(t.region.size.y))
	quit()
`,
    );
    spawnSync(GODOT, ['--headless', '--path', proj, '--import'], { timeout: 120000 });
    const run = spawnSync(GODOT, ['--headless', '--path', proj, '--script', 'check.gd'], { timeout: 120000, encoding: 'utf8' });
    const lines = (run.stdout || '').split('\n').filter((l) => l.startsWith('ANIM '));
    check(lines.length >= 2, `Godot printed no animations: ${(run.stderr || '').slice(0, 200)}`);
    for (const l of lines) check(/ 28(\.0)?x24(\.0)?$/.test(l), `Godot frame is not 28x24: ${l}`);
    console.log(`godot: ${lines.join('; ')}`);
  } else if (!GODOT) console.log('GODOT_BIN not set: the Godot part was skipped');
  fs.rmSync(out, { recursive: true, force: true });
  console.log(failures.length ? `FAILED\n${failures.join('\n')}` : 'all good');
  app.exit(failures.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  app.exit(1);
});
