// Help pictures and clips for the drawing topics (tools, colours, canvas), once per theme: see scripts/docs/help-media.cjs.
// Window coordinates: the canvas viewport is 808 x 444 at (69, 47), so view(z, cx, cy) puts stage point (cx, cy) at its
// middle (473, 269) and screen(x, y) says where a stage point lands.
const T = (id) => ({ eval: `__frameling.template(${JSON.stringify(id)})` });
const UI = (o) => ({ eval: `__frameling.store().setUi(${JSON.stringify(o)})` });
const dom = (js) => ({ eval: js });
const away = { move: [720, 28] };
const CV = [69, 47, 808, 444];
let view_ = { z: 0.5, cx: 640, cy: 360 };
const view = (z = 0.5, cx = 640, cy = 360) => {
  view_ = { z, cx, cy };
  return UI({ zoom: z, panX: 404 - cx * z, panY: 222 - cy * z });
};
const at = (x, y, v = view_) => [Math.round(473 + (x - v.cx) * v.z), Math.round(269 + (y - v.cy) * v.z)];
const INK = '#1d1b26';
const KAPPA = 0.5522847498307936;
let nid = 0;
const hid = () => `h${++nid}`;
const rectPath = (x, y, w, h) => ({ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const ellPath = (x, y, w, h) => {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = KAPPA * rx, ky = KAPPA * ry;
  return { closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] };
};
const shapeOf = (paths, fill, stroke = INK, width = 4) => ({ id: hid(), type: 'path', paths, fill, stroke: stroke ? { color: stroke, width, join: 'round', cap: 'round' } : null, opacity: 1 });
const rect = (x, y, w, h, fill, stroke, width) => shapeOf([rectPath(x, y, w, h)], fill, stroke, width);
const ell = (x, y, w, h, fill, stroke, width) => shapeOf([ellPath(x, y, w, h)], fill, stroke, width);
const line = (x1, y1, x2, y2, color = INK, width = 6) => shapeOf([{ closed: false, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] }], null, color, width);
/** Puts shapes on a layer's first drawing (by layer name) and, with `sel`, selects the ones whose index is listed. */
const put = (layer, shapes, sel) => dom(`(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(shapes)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.name === ${JSON.stringify(layer)}); d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); const l = S.get().doc.layers.find((x) => x.name === ${JSON.stringify(layer)}); S.setUi({ activeLayerId: l.id, selection: ${JSON.stringify(sel ?? [])}.map((i) => shapes[i].id) }); })()`);
/** Folds Properties sections (by panel id) that are open; leaves folded ones alone. */
const fold = (...ids) => dom(`for (const id of ${JSON.stringify(ids)}) { const b = document.getElementById('rd-sec-h-' + id); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); }`);
const tool = (id) => dom(`__frameling.run('tools.${id}')`);
/** A hand-drawn style stroke along points ([x, y] pairs), for pictures that need a squiggle without drawing one. */
const squiggle = (pts, color, size = 6, crisp = false) => ({ id: hid(), type: 'stroke', points: pts.map(([x, y]) => ({ x, y, p: 0.5 })), brush: { size, thinning: 0, smoothing: crisp ? 0 : 0.5, streamline: crisp ? 0 : 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true }, color, opacity: 1 });
const wave = (x0, x1, y, amp, waves, color, size) => squiggle(Array.from({ length: 61 }, (_, i) => [x0 + ((x1 - x0) * i) / 60, y + amp * Math.sin((i / 60) * waves * Math.PI * 2)]), color, size);
/** A drag through stage points, slow enough to look drawn. */
const draw = (pts, o = {}) => ({ drag: pts.map(([x, y]) => at(x, y)), steps: o.steps ?? 12, delay: o.delay ?? 12, ...(o.mods ? { mods: o.mods } : {}) });
/** A click at a stage point, with a short settle after it. */
const tap = (x, y, after = 700) => ({ click: at(x, y), after });
const PANEL = [69, 47, 1131, 444];
const REC = (crop, every = 80) => ({ rec: '@', crop, every });
const STOP = { rec: 'stop' };
/** A throwaway capture first: a hidden window can hand back a stale frame for the first one. */
const WARM = { shot: 'warm', crop: [0, 0, 32, 32] };
/** The 560 x 320 window of the page the small tool clips show, around the stage's middle at 100%. */
const SMALL = [193, 109, 560, 320];
const BRUSH = (size) => UI({ brush: { size, thinning: 0.1, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true } });
/** Points along a curve f(t), t from 0 to 1. */
const along = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
// The pixel art sheet that asks about the Pixel workspace: keep the layout and carry on.
const keepLayout = [dom("[...document.querySelectorAll('.ui-modal [role=radio], .ui-modal label, .io-modal [role=radio], .io-modal label')].find((e) => /Keep my layout/.test(e.textContent))?.click()"), { wait: 200 }, dom("[...document.querySelectorAll('.ui-modal button')].find((b) => b.textContent.trim() === 'OK')?.click()"), { wait: 700 }];
module.exports = [
  { name: 'fill-and-stroke-boxes', steps: [T('blank-vector'), UI({ fillColor: '#9b7bff' }), fold('tool-options'), { wait: 600 }, dom("document.querySelector('.cv-well-fill').click()"), { wait: 300 }, away, { wait: 300 }, { shot: '@', el: '.cv-wells', pad: 14 }] },
  { name: 'colours', steps: [T('blank-vector'), UI({ fillColor: '#9b7bff', activeWell: 'fill' }), fold('tool-options'), { wait: 600 }, away, { wait: 300 }, { shot: '@', crop: [879, 116, 305, 540] }] },
  { name: 'tool-options', steps: [T('blank-vector'), fold('colors'), { wait: 600 }, away, { wait: 300 }, { shot: '@', crop: [879, 78, 305, 528] }] },
  { name: 'canvas-size', prefs: { units: 'mm' }, steps: [T('blank-vector'), { wait: 500 }, { eval: "__frameling.run('document.settings')" }, { wait: 700 }, dom("document.querySelector('.ds-modal input').focus()"), { type: '450' }, { wait: 300 }, dom("document.querySelector('.ds-anchor [aria-label=left]').click()"), { wait: 300 }, { shot: '@', el: '.ds-modal', pad: 0 }] },
  { name: 'recolour-animation', steps: [T('hero-sprites'), UI({ color: '#5ab8ff' }), { wait: 900 }, ...keepLayout, { eval: "__frameling.run('colors.recolourAll')" }, { wait: 900 }, dom("document.querySelectorAll('.io-modal .cv-swatch')[3].click()"), { wait: 300 }, dom("[...document.querySelectorAll('.cv-recolour button')].find(b => /current colour/.test(b.textContent)).click()"), { wait: 800 }, { shot: '@', el: '.io-modal', pad: 0 }] },

  // Rulers along the page, a guide dragged out of each, and the ball snapped to the vertical one.
  { name: 'rulers-guides', steps: [T('bouncing-ball'), view(0.5, 640, 360), { wait: 500 }, dom("__frameling.run('view.rulers')"), { wait: 500 },
    { key: 'v' }, { click: at(640, 100) }, { wait: 300 },
    { drag: [[79, 330], at(640, 330)], steps: 14, delay: 14 }, { wait: 200 },
    { drag: [[400, 57], [400, 330]], steps: 14, delay: 14 }, { wait: 300 }, away, { wait: 300 },
    { shot: '@', crop: [69, 47, 808, 380] }] },
  // Snapping: a rectangle's corner jumps onto a guide (pink line and the note), then Guides and Other shapes are unticked in the Snap popover and the next one does not.
  // (This layout puts the page's middle 44 px to the right of where view() assumes, so the points are nudged.)
  ...(() => {
    const p = (x, y) => { const [sx, sy] = at(x, y); return [sx + 44, sy]; };
    return [{ name: 'snapping', steps: [T('blank-vector'), view(0.6), UI({ fillColor: '#9b7bff' }), dom("__frameling.store().update('guide', (d) => { d.guides = [{ id: 'g1', axis: 'x', at: 900 }]; })"), tool('rect'), { wait: 500 }, away, { wait: 300 }, WARM,
      REC([0, 40, 1000, 760], 80), { wait: 500 },
      { down: p(380, 190) }, { held: p(600, 330) }, { held: p(880, 420) }, { wait: 500 }, { held: p(903, 425) }, { wait: 1500 }, { up: p(903, 425) }, { wait: 700 },
      dom("__frameling.run('view.snapOptions')"), { wait: 1200 }, dom("document.querySelector('[aria-label=\"Guides, vector layers\"]').click()"), { wait: 600 },
      // Other shapes is on to begin with, and the first rectangle's edge sits on the guide, so it goes off too.
      dom("document.querySelector('[aria-label=\"Other shapes, vector layers\"]').click()"), { wait: 1000 },
      dom("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"), { wait: 500 },
      { down: p(380, 470) }, { held: p(600, 520) }, { held: p(880, 600) }, { wait: 500 }, { held: p(903, 605) }, { wait: 1200 }, { up: p(903, 605) }, { wait: 600 },
      // Equal gaps are on to begin with: a third rectangle's top edge settles one gap below the second, the same 45 as between the first two, and the bars say so.
      { down: p(420, 690) }, { held: p(700, 670) }, { held: p(900, 640) }, { wait: 400 }, { held: p(900, 653) }, { wait: 1800 }, { up: p(900, 653) }, { wait: 600 },
      dom("__frameling.run('view.snapOptions')"), { wait: 2200 }, STOP] }];
  })(),
  { name: 'grids-perspective', steps: [T('bouncing-ball'), view(0.5, 640, 360), dom("__frameling.run('view.perspective2')"), { wait: 5200 }, away, { wait: 300 }, { shot: '@', crop: CV }] },
  // The light table: the ball up high on frame 1 shows faintly while you draw the squash on frame 9.
  { name: 'light-table', size: [1600, 900], width: 900, steps: [T('bouncing-ball'), { wait: 400 }, dom("__frameling.run('view.lightTable')"), { wait: 300 }, UI({ frame: 8 }), dom("__frameling.dock.toggleCollapsed('right', true)"), { wait: 800 }, dom("__frameling.run('view.fit')"), { wait: 5200 }, away, { wait: 300 }, { shot: '@', crop: [330, 80, 900, 610] }] },
  { name: 'where-did-it-go', steps: [T('blank-vector'), put('Lines', [ell(470, 220, 340, 280, '#ff6f91', INK, 8)]), dom("(() => { const S = __frameling.store(); const l = S.get().doc.layers.find((x) => x.name === 'Lines'); S.update('hide', (d) => { d.layers.find((x) => x.id === l.id).visible = false; }); })()"), { wait: 1800 }, away, { wait: 300 }, { shot: '@' }] },

  // Rectangle and ellipse follow the perspective guides: a wall on each side, a window and a round window drawn on them.
  { name: 'perspective-shapes', width: 1000, steps: [T('blank-vector'), view(0.6), dom("__frameling.run('view.perspective2')"), { wait: 500 }, tool('rect'), UI({ fillColor: '#8fd0ff' }),
    draw([[340, 210], [540, 430]]), UI({ fillColor: '#fff2c8' }), draw([[400, 290], [480, 350]]), UI({ fillColor: '#ff8fb1' }), draw([[740, 210], [940, 430]]),
    tool('ellipse'), UI({ fillColor: '#ffffff' }), draw([[790, 290], [880, 360]]), { wait: 5200 }, away, { wait: 300 }, { shot: '@', crop: [69, 47, 1131, 444] }] },
  { name: 'shapes', steps: [T('blank-vector'), view(0.6), tool('rect'), UI({ fillColor: null }), draw([[140, 110], [560, 360]]),
    tool('ellipse'), UI({ fillColor: '#9b7bff' }), draw([[760, 200], [1130, 470]]), tool('line'), draw([[160, 560], [700, 640]]), away, { wait: 400 }, { shot: '@', crop: [89, 53, 768, 432] }] },
  { name: 'select', steps: [T('blank-vector'), view(0.6),
    put('Lines', [rect(200, 100, 320, 220, '#6a52d4', null), ell(700, 90, 320, 240, '#e07790', null), wave(60, 460, 560, 60, 1, '#5b4bd6', 7), line(640, 480, 1220, 660, '#4a9f7a', 7)]),
    tool('select'), { click: at(360, 210) }, { wait: 300 }, away, { wait: 400 }, { shot: '@', crop: [89, 53, 768, 432] }] },
  { name: 'copy-paste', steps: [T('bouncing-ball'), view(0.5), tool('select'), { click: at(640, 100) }, { wait: 300 }, { click: [206, 23] }, { wait: 500 }, { shot: '@', crop: [0, 0, 640, 400] }] },
  { name: 'tool-points', width: 1000, steps: [T('blank-vector'), view(0.6),
    put('Lines', [shapeOf([{ closed: true, points: [
      { x: 320, y: 400, c1: { x: 520, y: 650 }, c2: { x: 360, y: 500 } },
      { x: 640, y: 170, c1: { x: 440, y: 230 }, c2: { x: 540, y: 170 } },
      { x: 960, y: 400, c1: { x: 740, y: 170 }, c2: { x: 880, y: 260 } },
      { x: 640, y: 650, c1: { x: 900, y: 520 }, c2: { x: 760, y: 650 } },
    ] }], '#93cdb0', INK, 4)]),
    tool('points'), { click: at(640, 400) }, { wait: 300 }, { click: at(640, 170) }, { wait: 300 }, fold('symbol-props', 'effects'), { wait: 500 }, away, { wait: 300 }, { shot: '@', crop: [69, 47, 1131, 444] }] },
  { name: 'polygon-star', width: 1000, steps: [T('blank-vector'), view(0.6), tool('polygon'), UI({ fillColor: '#f7c95a' }), draw([[250, 200], [480, 430]], { mods: ['shift'] }),
    tool('star'), UI({ fillColor: '#f07a94', activeWell: 'fill' }), draw([[740, 180], [1010, 450]], { mods: ['shift'] }), { wait: 300 }, fold('colors'), { wait: 300 }, away, { wait: 400 }, { shot: '@', crop: [69, 47, 1131, 444] }] },
  // A linear gradient on a rectangle (with the Gradient tool's two ends showing) and a radial one on a star.
  { name: 'gradients', width: 1000, steps: [T('blank-vector'), view(0.6), UI({ activeWell: 'fill', fillColor: '#ff6f91', strokeOn: false }), fold('tool-options'), { wait: 500 },
    dom("[...document.querySelectorAll('#rd-sec-colors button')].find((b) => b.textContent.trim() === 'Linear').click()"), { wait: 300 },
    tool('rect'), draw([[180, 140], [520, 440]]),
    dom("[...document.querySelectorAll('#rd-sec-colors button')].find((b) => b.textContent.trim() === 'Solid').click()"), UI({ fillColor: '#9b7bff' }), { wait: 200 },
    dom("[...document.querySelectorAll('#rd-sec-colors button')].find((b) => b.textContent.trim() === 'Radial').click()"), { wait: 300 },
    tool('star'), draw([[720, 120], [1100, 500]], { mods: ['shift'] }),
    tool('select'), { click: at(350, 290) }, { wait: 200 }, tool('gradient'), draw([[200, 420], [500, 160]], { steps: 16, delay: 14 }), { wait: 300 }, fold('symbol-props', 'effects'), { wait: 500 }, away, { wait: 400 }, { shot: '@', crop: [69, 47, 1131, 580] }] },
  // The brush: a wave, then a circle in another colour.
  { name: 'draw-brush', steps: [T('blank-vector'), view(0.6), UI({ color: '#5b4bd6' }), BRUSH(14), { wait: 700 }, WARM, REC([89, 53, 768, 432]), { wait: 500 },
    draw(along(46, (t) => [140 + 1000 * t, 250 - 90 * Math.sin(t * Math.PI * 3.2 + 0.3)]), { steps: 2, delay: 14 }), { wait: 400 }, UI({ color: '#e07790' }),
    draw(along(40, (t) => [640 + 95 * Math.cos(t * Math.PI * 2.15 - 1.6), 530 + 95 * Math.sin(t * Math.PI * 2.15 - 1.6)]), { steps: 2, delay: 14 }), { wait: 1000 }, STOP] },
  // The pencil: thin, even lines for sketching.
  { name: 'tool-pencil', steps: [T('blank-vector'), view(1), tool('pencil'), UI({ color: '#2a2a6a' }), { wait: 700 }, WARM, REC(SMALL), { wait: 500 },
    draw([[380, 350], [440, 265], [500, 245], [560, 235], [610, 290], [650, 400], [690, 415], [740, 430], [800, 370], [850, 275], [905, 295]], { steps: 12, delay: 14 }), { wait: 300 },
    draw([[390, 470], [480, 485], [570, 495], [650, 475], [700, 460], [770, 480], [840, 495], [910, 470]], { steps: 12, delay: 14 }), { wait: 1000 }, STOP] },
  // The eraser takes out a whole line with one swipe.
  { name: 'tool-eraser', steps: [T('blank-vector'), view(1),
    put('Lines', [squiggle(along(30, (t) => [390 + 500 * t, 240 + 6 * t]), '#e8457a', 7), squiggle(along(30, (t) => [390 + 500 * t, 360 + 6 * t]), '#46b59b', 7), squiggle(along(30, (t) => [390 + 500 * t, 480 + 6 * t]), '#6a52d4', 7)]),
    tool('eraser'), { wait: 700 }, WARM, REC(SMALL), { wait: 900 }, draw([[560, 300], [610, 340], [660, 380], [700, 420]], { steps: 14, delay: 28 }), { wait: 1200 }, STOP] },
  // Duplicate (Ctrl+D) three times, then Delete the top copy.
  { name: 'duplicate-delete', steps: [T('blank-vector'), view(1),
    put('Lines', [ell(600, 250, 220, 200, '#f4c04f', '#3a2d5c', 3), rect(500, 230, 180, 180, '#e84a78', '#3a2d5c', 3)]), tool('select'), { click: at(530, 260) }, { wait: 500 }, WARM, REC(SMALL), { wait: 800 },
    { key: 'd', mods: ['control'], after: 700 }, { key: 'd', mods: ['control'], after: 700 }, { key: 'd', mods: ['control'], after: 900 }, { key: 'Delete', after: 1000 }, STOP] },
  // Flip left-right turns an arrow round.
  { name: 'flip', steps: [T('blank-vector'), view(1), tool('select'),
    put('Lines', [squiggle(along(20, (t) => [770 - 280 * t, 360]), '#7c5cf5', 18, true), squiggle([...along(10, (t) => [550 - 60 * t, 300 + 60 * t]), ...along(10, (t) => [490 + 60 * t, 360 + 60 * t])], '#7c5cf5', 18, true)], [0, 1]), { wait: 600 }, WARM, REC(SMALL), { wait: 900 },
    dom("__frameling.run('select.flipH')"), { wait: 1100 }, dom("__frameling.run('select.flipH')"), { wait: 1000 }, dom("__frameling.run('select.flipH')"), { wait: 1300 }, STOP] },
  // Bring forward and send back change which shape is on top.
  { name: 'arrange', steps: [T('blank-vector'), view(1), tool('select'),
    put('Lines', [rect(500, 240, 180, 180, '#e84a78', '#3a2d5c', 3), ell(600, 250, 220, 200, '#f4c04f', '#3a2d5c', 3)], [0]), { wait: 600 }, WARM, REC(SMALL), { wait: 900 },
    dom("__frameling.run('arrange.front')"), { wait: 1200 }, dom("__frameling.run('arrange.back')"), { wait: 1000 }, dom("__frameling.run('arrange.front')"), { wait: 1300 }, STOP] },
  // The eyedropper picks colours up off the page: the ball, its stripe, the ground.
  { name: 'tool-eyedropper', steps: [T('bouncing-ball'), view(0.7, 640, 340), UI({ activeWell: 'stroke' }), tool('eyedropper'), fold('tool-options'), { wait: 800 }, away, WARM, REC(PANEL, 80), { wait: 900 },
    tap(610, 110, 1300), tap(640, 168, 1300), tap(200, 620, 1500), { wait: 600 }, STOP] },
  // The paint bucket pours colour into a closed shape.
  { name: 'fill-bucket', steps: [T('blank-vector'), view(0.8), UI({ color: '#25233a', fillColor: '#e0788f' }), BRUSH(6), { wait: 700 }, WARM, REC([173, 54, 600, 430]), { wait: 600 },
    draw(along(44, (t) => [640 + 150 * Math.cos(-1.9 + t * 6.5), 360 + 150 * Math.sin(-1.9 + t * 6.5)]), { steps: 2, delay: 14 }), { wait: 500 }, tool('fill'), { wait: 700 }, tap(640, 360, 1800), STOP] },
  // Close gaps lets the bucket fill a shape whose line does not quite meet.
  { name: 'fill-gaps', steps: [T('blank-vector'), view(0.8), UI({ color: '#25233a', fillColor: '#8ad0a8' }), BRUSH(6), { wait: 700 }, WARM, REC(PANEL), { wait: 600 },
    draw(along(44, (t) => [640 + 150 * Math.cos(-1.5 + 0.12 + t * (Math.PI * 2 - 0.24)), 360 + 150 * Math.sin(-1.5 + 0.12 + t * (Math.PI * 2 - 0.24))]), { steps: 2, delay: 14 }), { wait: 500 }, tool('fill'), { wait: 900 },
    tap(640, 360, 1600), dom("[...document.querySelectorAll('.fl-fill-seg button')].find((b) => b.textContent.trim() === 'Large').click()"), { wait: 1000 }, tap(640, 360, 1800), STOP] },
  // Merge drawing: a different colour drawn on top cuts the colour under it, and moving it away leaves a hole.
  { name: 'merge-drawing', steps: [T('blank-vector'), view(0.6), UI({ strokeOn: false }), tool('rect'), { wait: 700 }, away, WARM, REC(PANEL, 80), { wait: 1000 },
    { key: 'j', after: 1200 }, UI({ fillColor: '#e0685e' }), draw([[250, 200], [650, 520]], { steps: 14, delay: 14 }), { wait: 600 },
    tool('ellipse'), UI({ fillColor: '#4a7cf0' }), draw([[520, 300], [800, 560]], { steps: 14, delay: 14 }), { wait: 1200 },
    tool('select'), { click: at(760, 430), after: 900 }, fold('symbol-props', 'effects'), { wait: 500 }, draw([[760, 430], [900, 430], [1010, 430]], { steps: 14, delay: 28 }), { wait: 1800 }, STOP] },
  // Lasso: draw round part of a merge layer's painting to lift out just that bit.
  { name: 'lasso', steps: [T('blank-vector'), view(0.6),
    put('Lines', [ell(450, 190, 380, 380, '#f29566', null), ell(520, 250, 90, 90, '#3a2a5a', null)]), dom("__frameling.run('draw.toggleMerge')"), tool('select'), { key: 'l', mods: ['shift'], after: 400 }, { wait: 600 }, away, WARM, REC(PANEL, 80), { wait: 1000 },
    draw([[470, 200], [560, 175], [650, 190], [700, 260], [680, 340], [590, 380], [510, 360], [450, 300], [470, 200]], { steps: 10, delay: 22 }), { wait: 1200 },
    fold('symbol-props', 'effects'), { wait: 600 },
    draw([[560, 290], [500, 250], [430, 220]], { steps: 14, delay: 28 }), { wait: 1800 }, STOP] },
  // Moving around the page: zoom in with the Zoom tool, slide with the Hand tool, then fit it all again.
  { name: 'canvas-navigation', steps: [T('bouncing-ball'), { wait: 600 }, tool('zoom'), { wait: 600 }, away, WARM, REC([0, 0, 1280, 800], 100), { wait: 1000 },
    { click: [473, 160], after: 1000 }, { click: [473, 160], after: 1000 }, { click: [473, 160], after: 1200 }, tool('hand'), { wait: 700 },
    { drag: [[480, 260], [440, 330], [400, 400]], steps: 10, delay: 26 }, { wait: 1000 }, { key: '0', mods: ['control'], after: 1800 }, STOP] },
  // The pen: click for corners, drag for curves, click the first point to close the leaf.
  { name: 'tool-pen', steps: [T('blank-vector'), view(0.6), UI({ color: '#1d1b26', fillColor: '#93cdb0' }), tool('pen'), { wait: 700 }, away, WARM, REC([69, 47, 808, 385], 80), { wait: 900 },
    tap(320, 380, 800), draw([[640, 180], [760, 180]], { steps: 10, delay: 28 }), { wait: 800 }, tap(960, 380, 800), draw([[640, 580], [520, 580]], { steps: 10, delay: 28 }), { wait: 800 },
    tap(320, 380, 1000), { move: [700, 700] }, { wait: 2000 }, STOP] },
];
