// Version 2 example: a tool that answers pointer events with a picture to show (the overlay) and changes to make (ops).
// Frameling draws the overlay and applies the ops (one undo step); the plugin never touches the canvas.

let start = null; // Where the drag began, and the layer's opacity then.

frameling.tools.register({ id: 'fade', label: 'Layer fader', icon: 'plugin', layers: ['vector', 'pixel'] }, async (e) => {
  if (e.type === 'down') {
    const [doc, st] = await Promise.all([frameling.document.get(), frameling.document.state()]);
    const layer = doc.layers.find((l) => l.id === st.activeLayerId);
    if (!layer) return { hint: 'Pick a layer first.' };
    start = { y: e.y, layerId: layer.id, opacity: layer.opacity };
    return {};
  }
  if (!start) return {};
  const range = 300; // Dragging this far up or down fades all the way.
  const next = Math.max(0, Math.min(1, start.opacity + (start.y - e.y) / range));
  if (e.type === 'move') {
    const h = (next * range) | 0;
    return { overlay: [{ type: 'rect', x: e.x + 20, y: start.y - range / 2, w: 12, h: range, stroke: '#888888', width: 1, screen: true }, { type: 'rect', x: e.x + 20, y: start.y + range / 2 - h, w: 12, h, fill: '#00aaff' }, { type: 'text', x: e.x + 38, y: start.y, text: Math.round(next * 100) + '%', size: 16, fill: '#00aaff' }] };
  }
  if (e.type === 'up') {
    const layerId = start.layerId;
    start = null;
    return { label: 'Fade layer', ops: [{ op: 'setLayer', layerId, opacity: next }], overlay: [] };
  }
  if (e.type === 'cancel') {
    start = null;
    return { overlay: [] };
  }
  return {};
});
