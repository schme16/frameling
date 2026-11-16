// Shared by the shape effects entries: a character with a soft shadow under it, and a glowing title, done the old way (the
// shape alone on a layer of its own, with the layer's effect) and the new way (the shape picked, with the effect on the shape).
// Files starting with _ are not entries. The window is the Animate workspace: the canvas, the layers list and Properties.
const F = '__frameling';
const js = (code) => ({ eval: code });
const ANSWERS = { 'timeline.holdLonger': 'push', 'timeline.newKey': 'blank', 'timeline.frameScope': 'all', 'effects.maskScope': 'below', 'effects.maskStart': 'show', 'effects.maskLeavesFolder': 'keep', 'draw.heldFrame': 'new-key', 'draw.sharedDrawing': 'everywhere', 'draw.tweenFrame': 'new-key', 'canvas.spaceTap': 'play', 'draw.newLayerMode': 'object', 'workspace.follow': 'never', 'effects.addTarget': 'shapes', 'effects.breakApart': 'keep' };
const PANELS = ['tool-options', 'timeline', 'colors', 'palette', 'library', 'tileset', 'symbol-props', 'effects', 'particles', 'camera', 'text', 'rig', 'clip-flow', 'artboards', 'lipsync', 'preview', 'quests', 'help'];
const quiet = (keep) => [js(`localStorage.setItem('frameling.choices.v1', ${JSON.stringify(JSON.stringify(ANSWERS))}); localStorage.setItem('frameling.inspector.v1', ${JSON.stringify(JSON.stringify({ folded: PANELS.filter((p) => !keep.includes(p)) }))}); setTimeout(() => location.reload(), 0); true`), { wait: 2500 }];
const only = (id) => [js(`${F}.showPanel(${JSON.stringify(id)})`), { wait: 600 }, js(`document.querySelectorAll('.rd-sec-toggle[aria-expanded=true]').forEach((b) => { if (b.id !== 'rd-sec-h-${id}') b.click(); })`), { wait: 600 }];

const INK = '#1d1b26';
const KAPPA = 0.5522847498307936;
let nid = 0;
const hid = (p = 'h') => `${p}${++nid}`;
const ellPath = (x, y, w, h) => {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = KAPPA * rx, ky = KAPPA * ry;
  return { closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] };
};
const ell = (x, y, w, h, fill, sw = 0, opacity = 1) => ({ id: hid(), type: 'path', paths: [ellPath(x, y, w, h)], fill, stroke: sw ? { color: INK, width: sw, join: 'round', cap: 'round' } : null, opacity });
const title = (text, color) => ({ id: hid('t'), type: 'text', text, font: 'Nunito', size: 110, weight: 800, color, align: 'center', lineHeight: 1.2, letterSpacing: 0, opacity: 1, transform: { x: 640, y: 120, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 } });

/** The character, put together at the middle of the stage. */
const character = (body) => [
  ell(500, 200, 280, 270, body, 8),
  ell(560, 290, 56, 66, '#ffffff', 6),
  ell(664, 290, 56, 66, '#ffffff', 6),
  ell(582, 314, 14, 26, INK),
  ell(686, 314, 14, 26, INK),
  ell(596, 392, 88, 40, '#ff8fb1', 6),
];

const SCENES = {
  shadow: { background: '#fffaf0', body: '#ff9e6d', thing: ell(448, 440, 384, 60, '#1d1b26', 0, 0.5), what: 'blur', set: { radius: 14 } },
  glow: { background: '#1b2342', body: '#8fd0ff', thing: title('Moonlight', '#fff3c4'), what: 'glow', set: { size: 36, strength: 1.4, color: '#ffb703' } },
};

/** Puts shapes on the Lines layer's drawing, the thing to be softened first (so it is under the character). */
const put = (shapes) => js(`(() => { const S = ${F}.store(); const shapes = ${JSON.stringify(shapes)}; S.update('setup', (d) => { const l = d.layers.find((x) => x.name === 'Lines'); d.drawings[l.cels[0].drawingId].shapes.push(...shapes); }); const l = S.get().doc.layers.find((x) => x.name === 'Lines'); S.setUi({ activeLayerId: l.id, selection: [], tool: 'select' }); })()`);

/** The old way: the thing alone on a new layer of its own, under Lines. */
const ownLayer = (thing) => js(`(() => { const S = ${F}.store(); const thing = ${JSON.stringify(thing)}; S.update('own layer', (d) => { const at = d.layers.findIndex((x) => x.name === 'Lines'); const did = 'own-d'; d.drawings[did] = { id: did, kind: 'vector', shapes: [thing] }; d.layers.splice(at, 0, { id: 'own-l', name: ${JSON.stringify(thing.type === 'text' ? 'Title' : 'Shadow')}, kind: 'vector', visible: true, locked: false, opacity: 1, cels: [{ id: 'own-c', start: 0, length: d.length, drawingId: did }] }); }); S.setUi({ activeLayerId: 'own-l', selection: [] }); })()`);

/** Settings for the effect just added, whoever holds it (a layer or a shape). */
const setValues = (set) => js(`__frameling.store().update('settings', (d) => { const hold = []; for (const l of d.layers) if (l.effects) hold.push(l.effects[0]); for (const dr of Object.values(d.drawings)) if (dr.kind === 'vector') for (const s of dr.shapes) if (s.effects) hold.push(s.effects[0]); for (const e of hold) Object.assign(e.values, ${JSON.stringify(set)}); })`);

/**
 * One picture. `way` is 'old' or 'new'. 'new' picks the shape and puts the effect on it with the real command; 'old' puts it on
 * a layer of its own and does the same on the layer.
 */
function scene(kind, way, shot) {
  const sc = SCENES[kind];
  const steps = [
    ...quiet(['effects']),
    js(`${F}.template('blank-vector'); ${F}.dock.applyWorkspace('animate')`), { wait: 1500 },
    js(`${F}.store().update('background', (d) => { d.background = ${JSON.stringify(sc.background)}; })`),
  ];
  if (way === 'old') steps.push(ownLayer(sc.thing), put(character(sc.body)), js(`${F}.store().setUi({ activeLayerId: 'own-l', selection: [] })`));
  else steps.push(put([sc.thing, ...character(sc.body)]));
  steps.push({ wait: 500 });
  if (way === 'new') steps.push(js(`(() => { const S = ${F}.store(); const l = S.get().doc.layers.find((x) => x.name === 'Lines'); const d = S.get().doc.drawings[l.cels[0].drawingId]; S.setUi({ activeLayerId: l.id, selection: [d.shapes[0].id] }); })()`));
  steps.push({ wait: 500 }, js(`${F}.run('effects.add.${sc.what}')`), { wait: 500 }, setValues(sc.set), ...only('effects'), { move: [640, 785] }, { wait: 900 });
  return [...steps, ...shot];
}

module.exports = { scene, js, F, SCENES };
