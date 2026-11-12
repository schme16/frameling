// The web engine check: loads Frameling's Phaser, PixiJS and CSS sprite sheet exports in the real thing (pinned builds
// of Phaser and PixiJS, and Chromium for CSS) inside a hidden Electron window, and compares what they draw with
// Frameling's own PNG of the same frames. Used by scripts/e2e/export.cjs when WEB_ENGINES=1.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { BrowserWindow } = require('electron');
const { ensureEngines } = require('./engines.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

/** Serves the case folder, the engine builds and the pages here, over http like a real site (loaders behave as on the web). */
function startServer(engines) {
  const state = { dir: '', missing: [] };
  const harness = __dirname;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const rel = decodeURIComponent(url.pathname);
    let file = null;
    if (rel.startsWith('/case/')) file = path.join(state.dir, rel.slice(6));
    else if (rel.startsWith('/harness/')) file = path.join(harness, rel.slice(9));
    else if (rel === '/engines/phaser.min.js') file = engines.phaser;
    else if (rel === '/engines/phaser4.min.js') file = engines.phaser4;
    else if (rel === '/engines/pixi.min.js') file = engines.pixi;
    const base = rel.startsWith('/case/') ? state.dir : rel.startsWith('/harness/') ? harness : null;
    if (!file || (base && !path.resolve(file).startsWith(path.resolve(base) + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (!rel.endsWith('favicon.ico')) state.missing.push(rel);
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state, origin: `http://127.0.0.1:${server.address().port}` })));
}

async function createWebChecker() {
  const engines = await ensureEngines();
  const srv = await startServer(engines);

  // Shown (inside the virtual display): a hidden window stops WebGL animation frames, so Phaser would never advance.
  async function openWindow(w, h, errors) {
    const win = new BrowserWindow({ show: false, width: Math.max(w, 120), height: Math.max(h, 120), useContentSize: true, webPreferences: { backgroundThrottling: false, offscreen: false } });
    // export.cjs hides every window that shows itself; this one must stay shown or its animation frames stop.
    win.keepShown = true;
    win.show();
    win.webContents.on('console-message', (e) => {
      const lvl = e.level ?? e.severity;
      if (lvl === 'error' || lvl === 3) errors.push(String(e.message ?? e));
    });
    win.webContents.on('render-process-gone', (_e, d) => errors.push(`the page crashed (${d.reason})`));
    return win;
  }

  /**
   * job: { engine: 'phaser'|'pixi'|'css', dir, key, image, json, anims, width, height, frameNames, meta,
   *        separate, css, html, animations: [{ name, fps, loop, count, checks: [{ i, ref }] }],
   *        variant: { phaser: 3 | 4, renderer: 'webgl' | 'canvas' | 'webgpu' }, display: 1 }
   * `ref` is a PNG file of the document frame, which must be inside dir. `width` and `height` are what the page draws:
   * the frame size times `display` (the factor the sprite is shown at; its refs are already that size).
   * Returns { problems, notes }.
   */
  async function run(job) {
    srv.state.dir = job.dir;
    srv.state.missing = [];
    const out = { problems: [], notes: [] };
    const v = job.variant ?? {};
    const tag = job.engine === 'phaser' ? `Phaser ${v.phaser ?? 3} ${v.renderer ?? 'webgl'}` : job.engine === 'pixi' ? `PixiJS ${v.renderer ?? 'webgl'}` : 'css';
    const errors = [];
    const win = await openWindow(job.width, job.height, errors);
    const ev = (js) => win.webContents.executeJavaScript(js, true);
    try {
      const refUrl = (f) => `/case/${path.basename(f)}`;
      const cfg = {
        renderer: v.renderer ?? 'webgl', display: job.display ?? 1,
        key: job.key, image: `/case/${job.image}`, json: `/case/${job.json}`, anims: job.anims ? `/case/${job.anims}` : null,
        width: job.width, height: job.height, frameNames: job.frameNames ?? [], meta: job.meta ?? null,
        // PHASER_RENDER='{"roundPixels":true}' adds to the game's render config; PHASER_STRICT=1 holds Phaser's canvas renderer to the exact limit too (to try a setting).
        extraRender: process.env.PHASER_RENDER ? JSON.parse(process.env.PHASER_RENDER) : undefined, strict: process.env.PHASER_STRICT === '1',
        animations: job.animations.map((a) => ({ ...a, checks: a.checks.map((c) => ({ i: c.i, ref: refUrl(c.ref) })) })),
      };
      if (job.engine === 'phaser' || job.engine === 'pixi') {
        await win.loadURL(`${srv.origin}/harness/${job.engine}.html?v=${v.phaser ?? 3}`);
        const r = await Promise.race([ev(`window.runCheck(${JSON.stringify(cfg)})`), sleep(120000).then(() => ({ problems: ['the check page never finished'], notes: [], shots: {} }))]);
        out.problems.push(...r.problems.map((p) => `[${tag}] ${p}`));
        out.notes.push(...r.notes, `${r.compared ?? 0} frames compared, worst mean ${r.worst ? r.worst.mean.toFixed(3) : '?'}, max ${r.worst ? r.worst.max.toFixed(0) : '?'}`);
        if (r.soft) out.notes.push(`${tag}: not pixel-exact in ${r.soft.n} frames (worst mean ${r.soft.mean.toFixed(2)}, max ${r.soft.max.toFixed(0)}); a plain drawImage of the same atlas is exact, so this is the engine's canvas drawing`);
        for (const [k, url] of Object.entries(r.shots ?? {})) fs.writeFileSync(path.join(job.dir, `_web-fail-${tag.replace(/[^A-Za-z0-9]+/g, '_')}-${k}.png`), Buffer.from(url.split(',')[1], 'base64'));
      } else {
        await cssCheck(job, cfg, win, ev, out, job.display ?? 1);
      }
    } catch (e) {
      out.problems.push(`${tag}: ${e?.stack ?? e}`);
    } finally {
      win.destroy();
    }
    for (const m of srv.state.missing) out.problems.push(`${tag}: the page asked for ${m}, which was not exported`);
    for (const e of errors) out.problems.push(`${tag}: the page logged an error: ${e}`);
    return out;
  }

  async function cssCheck(job, cfg, win, ev, out, zoom) {
    const css = fs.readFileSync(path.join(job.dir, job.css), 'utf8');
    const prefix = /class="([^"\s]+)/.exec(css.split('\n')[0])?.[1];
    const keyframes = [...css.matchAll(/@keyframes\s+(\S+)/g)].map((m) => m[1]);
    if (!prefix) return out.problems.push('css: the first line of the CSS does not show how to use it');
    await win.loadURL(`${srv.origin}/harness/css.html`);
    await ev(`cssSetup(${JSON.stringify(`/case/${job.css}`)})`);
    let compared = 0;
    let worst = 0;
    const shoot = async (label, classes, ms, want, refFile) => {
      let s2, img, size, url, res;
      // A first screenshot can be taken before the page has settled after a resize, so a miss gets one more go.
      for (let attempt = 0; attempt < 2; attempt++) {
        const s = await ev(`cssShow(${JSON.stringify(classes)}, ${ms === null ? 'null' : ms}, ${zoom})`);
        win.setContentSize(Math.max(s.w, 120), Math.max(s.h, 120));
        await sleep(30 + attempt * 200);
        s2 = await ev(`cssShow(${JSON.stringify(classes)}, ${ms === null ? 'null' : ms}, ${zoom})`);
        img = await win.webContents.capturePage({ x: 0, y: 0, width: s2.w, height: s2.h });
        size = img.getSize();
        url = img.toDataURL();
        res = await ev(`cssCompare(${JSON.stringify(url)}, ${s2.w}, ${s2.h}, ${JSON.stringify(`/case/${path.basename(refFile)}`)})`);
        if (res.ok) break;
      }
      compared++;
      if (res.m) worst = Math.max(worst, res.m.mean);
      if (!res.ok) {
        out.problems.push(`css ${label}: ${res.text}`);
        fs.writeFileSync(path.join(job.dir, `_web-fail-css-${label.replace(/[^A-Za-z0-9_.-]+/g, '_')}.png`), img.toPNG());
      }
      return { s: s2, size, want };
    };

    if (job.separate) {
      const html = fs.readFileSync(path.join(job.dir, job.html), 'utf8');
      const classes = [...html.matchAll(/<div class="([^"]+)"><\/div>/g)].map((m) => m[1]);
      if (classes.length !== job.animations[0].count) out.problems.push(`css: the page shows ${classes.length} sprites, wanted ${job.animations[0].count}`);
      for (const c of job.animations[0].checks) {
        if (!classes[c.i]) continue;
        await shoot(`sprite ${classes[c.i]}`, classes[c.i], null, null, c.ref);
      }
    } else {
      if (keyframes.length !== job.animations.length) out.problems.push(`css: ${keyframes.length} animations in the CSS, wanted ${job.animations.length}`);
      for (const [k, exp] of job.animations.entries()) {
        const cls = `${prefix} ${keyframes[k]}`;
        const total = (exp.count * 1000) / exp.fps;
        for (const c of exp.checks) {
          const frameMs = (c.i * 1000) / exp.fps;
          // Halfway through the frame, and just after it starts.
          const a = await shoot(`${exp.name} [${c.i}] mid`, cls, frameMs + 500 / exp.fps, null, c.ref);
          const t = a.s.animations[0];
          if (c.i === exp.checks[0].i && c === exp.checks[0]) {
            if (!t) out.problems.push(`css ${exp.name}: the class does not animate`);
            else {
              if (Math.abs(t.duration - total) > 0.6) out.problems.push(`css ${exp.name}: lasts ${t.duration} ms, wanted ${total}`);
              const times = exp.times || 1;
              if (t.iterations !== (exp.loop ? Infinity : times)) out.problems.push(`css ${exp.name}: plays ${t.iterations} times, wanted ${exp.loop ? 'forever' : times}`);
              if (!exp.loop && t.fill !== 'forwards' && t.fill !== 'both') out.problems.push(`css ${exp.name}: does not stay on its last frame (fill ${t.fill})`);
            }
          }
          await shoot(`${exp.name} [${c.i}] start`, cls, frameMs + 0.5, null, c.ref);
        }
        const last = exp.checks.find((c) => c.i === exp.count - 1);
        const firstC = exp.checks.find((c) => c.i === 0);
        // Past the end: a loop starts over, anything else keeps its last frame.
        if (exp.loop && firstC) await shoot(`${exp.name} loops`, cls, total + 500 / exp.fps, null, firstC.ref);
        if (!exp.loop && last) await shoot(`${exp.name} holds`, cls, total * (exp.times || 1) + 2000, null, last.ref);
        // A clip that repeats: the start of the second go shows the first frame again.
        if (!exp.loop && (exp.times || 1) > 1 && firstC) await shoot(`${exp.name} repeats`, cls, total + 500 / exp.fps, null, firstC.ref);
      }
      // The preview page the export makes: its animations are the same ones.
      await win.loadURL(`${srv.origin}/case/${job.html}`);
      await sleep(300);
      const live = await ev('document.getAnimations().map((a) => { const t = a.effect.getComputedTiming(); return { name: a.animationName, duration: t.duration, iterations: t.iterations }; })');
      if (live.length !== job.animations.length) out.problems.push(`css: the preview page runs ${live.length} animations, wanted ${job.animations.length}`);
      for (const [k, a] of live.entries()) {
        const exp = job.animations[k];
        if (exp && Math.abs(a.duration - (exp.count * 1000) / exp.fps) > 0.6) out.problems.push(`css: preview animation ${a.name} lasts ${a.duration} ms, wanted ${(exp.count * 1000) / exp.fps}`);
        if (exp && a.iterations !== (exp.loop ? Infinity : exp.times || 1)) out.problems.push(`css: preview animation ${a.name} plays ${a.iterations} times`);
      }
    }
    out.notes.push(`Chromium ${process.versions.chrome}: ${compared} CSS frames compared, worst mean ${worst.toFixed(3)}`);
  }

  return { run, close: () => srv.server.close(), engines };
}

module.exports = { createWebChecker };
