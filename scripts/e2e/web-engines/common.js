// Shared by the engine pages: compare what an engine drew with Frameling's own PNG of the same frame.
// Both are laid over mid grey first, so see-through pixels count and rounding in the premultiplied maths does not.
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function loadImage(url) {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  }

  function pixels(source, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0);
    return g.getImageData(0, 0, w, h).data;
  }

  const over = (d, i, k) => {
    const a = d[i + 3] / 255;
    return d[i + k] * a + 128 * (1 - a);
  };

  /** How far apart two pictures are: mean and biggest difference per channel (0 to 255), and how many pixels differ by more than 8. */
  function measure(a, b, w, h) {
    let sum = 0;
    let max = 0;
    let bad = 0;
    for (let i = 0; i < w * h * 4; i += 4) {
      let worst = 0;
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(over(a, i, k) - over(b, i, k));
        sum += d;
        if (d > worst) worst = d;
      }
      if (worst > max) max = worst;
      if (worst > 8) bad++;
    }
    return { mean: sum / (w * h * 3), max, bad, total: w * h };
  }

  /** Compares a canvas or image with the reference PNG at a URL. Returns { ok, text, shot } (shot: the engine's picture, when it differs). */
  async function compare(source, sw, sh, refUrl) {
    const ref = await loadImage(refUrl);
    if (ref.naturalWidth !== sw || ref.naturalHeight !== sh) {
      return { ok: false, text: `drew ${sw}x${sh}, Frameling's frame is ${ref.naturalWidth}x${ref.naturalHeight}`, shot: toUrl(source, sw, sh) };
    }
    const m = measure(pixels(source, sw, sh), pixels(ref, sw, sh), sw, sh);
    const ok = m.bad <= Math.max(2, m.total * 0.0005) && m.mean < 0.3;
    return { ok, m, text: `mean ${m.mean.toFixed(3)}, max ${m.max.toFixed(0)}, ${m.bad} of ${m.total} pixels differ`, shot: ok ? null : toUrl(source, sw, sh) };
  }

  function toUrl(source, w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(source, 0, 0);
    return c.toDataURL('image/png');
  }

  /** Collects problems, notes, the worst pixel numbers and pictures of frames that differ. */
  function report() {
    const r = { problems: [], notes: [], shots: {}, worst: { mean: 0, max: 0, bad: 0 }, compared: 0 };
    r.problem = (t) => r.problems.push(t);
    r.expect = (cond, t) => {
      if (!cond) r.problems.push(t);
      return !!cond;
    };
    r.pixel = async (label, source, w, h, refUrl) => {
      const res = await compare(source, w, h, refUrl);
      r.compared++;
      if (res.m) {
        r.worst.mean = Math.max(r.worst.mean, res.m.mean);
        r.worst.max = Math.max(r.worst.max, res.m.max);
        r.worst.bad = Math.max(r.worst.bad, res.m.bad);
      }
      if (!res.ok) {
        r.problems.push(`${label}: ${res.text}`);
        if (res.shot) r.shots[label.replace(/[^A-Za-z0-9_.-]+/g, '_')] = res.shot;
      }
      return res.ok;
    };
    return r;
  }

  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  /** The report as plain data, which is what can cross back to the check script. */
  const plain = (r) => JSON.parse(JSON.stringify(r));
  window.WE = { sleep, loadImage, compare, report, near, plain };
})();
