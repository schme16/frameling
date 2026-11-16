// Shared by the live review harnesses (review.cjs checks it, review-media.cjs records it): the real built app with the loopback
// peer network (no sockets), a sharer's drawing window, a reviewer's window, and a drawing that is worth following.
// Run inside xvfb, never on the desktop.
process.env.FRAMELING_REVIEW_LOOPBACK = '1';
const { boot, popReady, sleep, root } = require('./popout-lib.cjs');

// A square page with a ball that bounces across it, and an empty layer on top to draw on.
const DOC = `(() => {
  const K = 0.5522847498307936;
  const ell = (cx, cy, rx, ry) => { const kx = K * rx, ky = K * ry; return { closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] }; };
  const path = (id, paths, fill, opacity = 1) => ({ id, type: 'path', paths, fill, stroke: null, opacity });
  let n = 0; const id = (p) => p + '-' + ++n;
  const doc = { format: 'frameling', version: 1, lineage: true, id: id('doc'), name: 'Bouncing ball', width: 800, height: 800, fps: 12, length: 12, background: '#fff6e5', layers: [], drawings: {}, clips: [], markers: [], swatches: [] };
  const ball = { id: id('l'), name: 'Ball', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
  const ground = { id: id('l'), name: 'Ground', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
  const gd = { id: id('dr'), kind: 'vector', shapes: [path(id('sh'), [{ closed: true, points: [{ x: 0, y: 640 }, { x: 800, y: 640 }, { x: 800, y: 800 }, { x: 0, y: 800 }] }], '#bfe8c6')] };
  doc.drawings[gd.id] = gd; ground.cels.push({ id: id('c'), start: 0, length: 12, drawingId: gd.id });
  for (let f = 0; f < 12; f++) {
    const t = f / 11;
    const x = 140 + t * 520;
    const h = Math.abs(Math.sin(t * Math.PI * 2));
    const y = 560 - h * 330;
    const squash = 1 - Math.min(1, h * 6) * 0 + (h < 0.12 ? 0.18 * (1 - h / 0.12) : 0);
    const rx = 62 * squash, ry = 62 / squash;
    const d = { id: id('dr'), kind: 'vector', shapes: [
      path(id('sh'), [ell(x, 650, 54 - h * 26, 11 - h * 5)], '#2a2533', 0.18 + (1 - h) * 0.12),
      path(id('sh'), [ell(x, y, rx, ry)], '#ff6f91'),
      path(id('sh'), [ell(x - 18, y - 20, 14, 10)], '#ffffff', 0.55),
    ] };
    doc.drawings[d.id] = d; ball.cels.push({ id: id('c'), start: f, length: 1, drawingId: d.id });
  }
  const lines = { id: id('l'), name: 'Lines', kind: 'vector', visible: true, locked: false, opacity: 1, cels: [] };
  const ld = { id: id('dr'), kind: 'vector', shapes: [] };
  doc.drawings[ld.id] = ld; lines.cels.push({ id: id('c'), start: 0, length: 12, drawingId: ld.id });
  doc.layers.push(ground, ball, lines);
  const S = window.__frameling.store();
  S.load(doc);
  S.setUi({ tool: 'brush', activeLayerId: lines.id, frame: 0, playing: false, brush: { ...S.get().ui.brush, size: 10 }, color: '#2a2533' });
  return true;
})()`;

/** Finds the reviewer's window (the picture window's page with ?review=1). */
const reviewWin = (h) => h.windows.find((w) => !w.isDestroyed() && /popout\.html/.test(w.webContents.getURL()) && /review=1/.test(w.webContents.getURL()));

/** Starts a review in the drawing window and returns the code. */
async function startReview(h) {
  await h.js(`window.__frameling.run('review.toggle')`);
  for (let i = 0; i < 100; i++) {
    const t = await h.js(`document.querySelector('[data-testid="review.code"]')?.textContent || ''`);
    if (t) return t.trim();
    await sleep(100);
  }
  throw new Error('no code appeared');
}

/** A reviewer joins with the code and the sharer lets them in. Resolves with their window once it is following. */
async function joinAndAdmit(h, code, name, before = 0) {
  await h.js(`window.frameling.review.join(${JSON.stringify(code)}, ${JSON.stringify(name)})`);
  for (let i = 0; i < 150; i++) {
    if (await h.js(`!!document.querySelector('[data-testid="review.letIn"]')`)) break;
    await sleep(100);
  }
  await h.js(`document.querySelector('[data-testid="review.letIn"]').click()`);
  let w = null;
  for (let i = 0; i < 150; i++) {
    w = reviewWin(h);
    if (w && (await h.js(`document.querySelector('[data-testid="review.win"]')?.dataset.link === 'in' && !!document.querySelector('[data-testid="popout.root"][data-ready]')`, w).catch(() => false))) return w;
    await sleep(100);
  }
  throw new Error('the reviewer never got the picture');
}

module.exports = { boot, popReady, sleep, root, DOC, reviewWin, startReview, joinAndAdmit };
