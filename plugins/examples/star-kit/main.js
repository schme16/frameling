// Version 2 example: its own kind of shape ("star"), a tool that stamps it, and a panel that changes it afterwards
// (and the shape's settings also show in Properties when a star is picked).
// The star is described by a few settings (its "props"). Frameling asks this script for a draw list from the props,
// stores the result as ordinary shapes in the drawing, and keeps the props with them, so the drawing opens fine without
// this plugin and the star can be redrawn from new settings with it.

let settings = { points: 5, size: 40, inner: 0.45, color: '#f5b301' };

// The draw list is in local coordinates: (0, 0) is the middle of the star. Frameling puts it where it belongs.
function starList(p) {
  const points = Math.max(3, Math.min(12, Math.round(p.points)));
  const outer = Math.max(4, Math.min(400, p.size));
  const inner = outer * Math.max(0.1, Math.min(0.9, p.inner));
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 === 0 ? outer : inner;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return [{ type: 'polygon', points: pts, fill: p.color, stroke: '#8a5a00', width: 2, join: 'round' }];
}

// The options describe the form Properties shows when a star is picked ("Change settings"); Frameling draws the form.
const COLOURS = [
  { value: '#f5b301', label: 'Amber' },
  { value: '#e5484d', label: 'Red' },
  { value: '#3e63dd', label: 'Blue' },
  { value: '#30a46c', label: 'Green' },
  { value: '#8e4ec6', label: 'Purple' },
];
frameling.shapes.register(
  {
    kind: 'star',
    label: 'Star',
    options: [
      { id: 'points', type: 'number', label: 'Points', min: 3, max: 12, step: 1, default: 5 },
      { id: 'size', type: 'number', label: 'Size', min: 8, max: 200, step: 1, default: 40 },
      { id: 'inner', type: 'number', label: 'Pointiness (smaller is pointier)', min: 0.1, max: 0.9, step: 0.05, default: 0.45 },
      { id: 'color', type: 'choice', label: 'Colour', choices: COLOURS, default: '#f5b301' },
    ],
  },
  (props) => starList({ ...settings, ...props }),
);

// The Star stamp tool. A faint preview follows the pointer and a click adds a star there. The star just added shows a
// round handle: drag it to make that star bigger or smaller. The tool asks for `snap`, so clicks land on Frameling's snap
// lines (guides, the page edge, other shapes), and it names two keys ("Bigger", "Smaller") that people can give a shortcut
// in Preferences > Keyboard (they have none to start with).
let last = null; // The star just added: { inst, x, y } (x, y is its middle).

const handle = () => (last ? [{ type: 'handle', id: 'size', x: last.x + settings.size, y: last.y, shape: 'circle', fill: '#ffffff', stroke: '#8a5a00' }] : []);
const label = () => (last ? [{ type: 'text', x: last.x, y: last.y + settings.size + 22, text: 'Size ' + Math.round(settings.size), size: 16, font: 'Nunito', weight: 700, align: 'center', fill: '#8a5a00' }] : []);

async function resize(size) {
  settings.size = Math.max(8, Math.min(200, size));
  if (last) await frameling.shapes.update(last.inst, 'star', settings);
}

frameling.tools.register(
  { id: 'stamp', label: 'Star stamp', icon: 'polygon', layers: ['vector'], snap: true, keys: [{ id: 'bigger', label: 'Bigger stars' }, { id: 'smaller', label: 'Smaller stars' }] },
  async (e) => {
    try {
      if (e.type === 'key') {
        await resize(settings.size * (e.key === 'bigger' ? 1.2 : 1 / 1.2));
        return { overlay: [...handle(), ...label()], hint: 'Size ' + Math.round(settings.size) };
      }
      // Dragging the handle: the star follows the pointer's distance from its middle.
      if (e.handle === 'size') {
        if (e.type === 'move') await resize(Math.hypot(e.x - last.x, e.y - last.y));
        return { overlay: [...handle(), ...label()] };
      }
      if (e.type === 'hover' || e.type === 'move') {
        const preview = starList(settings).map((item) => ({ ...item, points: item.points.map(([x, y]) => [x + e.x, y + e.y]), fill: undefined, stroke: '#8a5a00', dash: [4, 3], screen: true, width: 1 }));
        return { overlay: [...preview, ...handle(), ...label()] };
      }
      if (e.type === 'down') {
        last = { inst: await frameling.shapes.place('star', settings, { x: e.x, y: e.y }), x: e.x, y: e.y };
        return { overlay: [...handle(), ...label()], hint: 'Drag the round handle to resize it' };
      }
      if (e.type === 'leave' || e.type === 'cancel') return { overlay: [...handle(), ...label()] };
    } catch (err) {
      return { hint: err.message };
    }
  },
);

const ui = () => ({
  type: 'column',
  children: [
    { type: 'text', text: 'Pick the Star stamp tool and click. Change the settings, then press the button to redraw the star you picked.', style: 'muted' },
    { type: 'slider', id: 'points', label: 'Points', min: 3, max: 12, step: 1, value: settings.points },
    { type: 'slider', id: 'size', label: 'Size', min: 8, max: 200, step: 1, value: settings.size },
    { type: 'slider', id: 'inner', label: 'Pointiness (smaller is pointier)', min: 0.1, max: 0.9, step: 0.05, value: settings.inner },
    { type: 'color', id: 'color', label: 'Colour', value: settings.color },
    { type: 'button', id: 'redraw', label: 'Redraw the picked star', primary: true },
  ],
});

// Finds the star (its inst) that the first picked shape belongs to.
async function pickedStar() {
  const [doc, st] = await Promise.all([frameling.document.get(), frameling.document.state()]);
  const drawing = doc.drawings[st.drawingId];
  const shape = drawing && drawing.shapes.find((s) => st.selection.includes(s.id) && s.ext && s.ext['plugin.star-kit']);
  return shape ? shape.ext['plugin.star-kit'].inst : null;
}

const panel = frameling.panels.register({ id: 'stars', title: 'Stars' }, ui(), async (e) => {
  if (e.id === 'points' || e.id === 'size' || e.id === 'inner') settings[e.id] = Number(e.value);
  else if (e.id === 'color') settings.color = e.value;
  else if (e.id === 'redraw') {
    const inst = await pickedStar();
    if (!inst) await frameling.ui.notify('Pick a star first (use the Select tool).', 'info');
    else await frameling.shapes.update(inst, 'star', settings);
  }
  panel.update(ui());
});
