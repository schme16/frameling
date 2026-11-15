// Shared by scripts/perf/capture-live.cjs and scripts/e2e/capture-live-media.cjs: the test documents and the mouse paths.

/** JavaScript for the drawing page: loads a vector or a pixel document with something on it and sets sizes a stroke shows up at. Needs MKDOC run first. */
const docScript = (kind) => `(() => {
  const F = window.__frameling;
  const doc = window.__mkDoc({ width: 1280, height: 720, frames: 1, layers: 1, strokesPer: ${kind === 'vector' ? 40 : 0}, pts: 12 });
  const layer = doc.layers[0];
  if (${kind === 'pixel'}) {
    const W = 1280, H = 720, px = new Uint8ClampedArray(W * H * 4);
    // A pale page with some solid blocks on it, so a stroke on top is easy to see (and there is something to erase and move).
    let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 60; i++) {
      const bx = Math.floor(rnd() * (W - 120)), by = Math.floor(rnd() * (H - 80)), bw = 30 + Math.floor(rnd() * 90), bh = 20 + Math.floor(rnd() * 60);
      const c = [Math.floor(rnd() * 120) + 100, Math.floor(rnd() * 120) + 100, Math.floor(rnd() * 120) + 100];
      for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) { const o = (y * W + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; }
    }
    layer.kind = 'pixel'; layer.pixelSize = 1;
    const dr = { id: 'px-full', kind: 'pixel', width: W, height: H, pixels: px };
    doc.drawings = { [dr.id]: dr };
    layer.cels = [{ id: 'cel-full', start: 0, length: 1, drawingId: dr.id }];
  }
  F.store().load(doc);
  F.store().setUi({ tool: 'brush', activeLayerId: layer.id, frame: 0, color: '#d6204a', fillColor: '#4fa3ff', strokeOn: true, selection: [], brush: { ...F.store().get().ui.brush, size: 24 } });
  F.toolSettings.set({ pixelBrushSize: 14, pixelBrushShape: 'round', pixelPerfect: false, pencilSize: 10, eraserSize: 40, eraserPixelSize: 12 });
  F.run('view.fit');
  return true;
})()`;

/** Mouse paths inside the canvas box `b` ({x, y, w, h}), n points each. */
const PATHS = {
  curve: (b, n) => Array.from({ length: n }, (_, i) => ({ x: b.x + b.w * (0.2 + 0.6 * (i / (n - 1))), y: b.y + b.h * (0.5 + 0.22 * Math.sin((i / (n - 1)) * Math.PI * 3)) })),
  drag: (b, n) => Array.from({ length: n }, (_, i) => ({ x: b.x + b.w * (0.3 + 0.35 * (i / (n - 1))), y: b.y + b.h * (0.3 + 0.3 * (i / (n - 1))) })),
  // Starts away from the middle of the page (where a transform box has its pivot).
  move: (b, n) => Array.from({ length: n }, (_, i) => ({ x: b.x + b.w * (0.4 + 0.14 * Math.sin((i / (n - 1)) * Math.PI)), y: b.y + b.h * (0.4 + 0.1 * (i / (n - 1))) })),
};

module.exports = { docScript, PATHS };
