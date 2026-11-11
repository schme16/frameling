// An example Frameling plugin: a command and a small panel that mirror every other key on the current layer.
// It runs in a sandbox and only talks to Frameling through the `frameling` object.

let axis = 'horizontal';
let which = 'odd';

// The keys (cels) on a layer, in order, and the drawings to flip: every second key, starting with the 2nd
// ('odd', frames 2, 4, 6...) or the 1st ('even'). A drawing shared with a key we're not flipping is left alone.
function drawingsToFlip(layer) {
  const keys = [...layer.cels].sort((a, b) => a.start - b.start);
  const flip = new Set();
  const keep = new Set();
  keys.forEach((cel, i) => ((i % 2 === 1) === (which === 'odd') ? flip : keep).add(cel.drawingId));
  return [...flip].filter((id) => !keep.has(id));
}

async function run() {
  const doc = await frameling.document.get();
  const state = await frameling.document.state();
  const layer = doc.layers.find((l) => l.id === state.activeLayerId);
  if (!layer) return frameling.ui.notify('Pick a layer first.', 'warn');
  if (layer.kind === 'tilemap') return frameling.ui.notify("Tilemap layers can't be flipped this way.", 'warn');
  const ids = drawingsToFlip(layer);
  if (!ids.length) return frameling.ui.notify(`"${layer.name}" needs at least two keys.`, 'info');
  await frameling.document.edit(`Flip every other frame`, ids.map((drawingId) => ({ op: 'flipDrawing', drawingId, axis })));
  frameling.ui.notify(`Flipped ${ids.length} ${ids.length === 1 ? 'frame' : 'frames'} on "${layer.name}".`, 'success');
}

frameling.commands.register({ id: 'flip', label: 'Flip every other frame', description: 'Mirror every other key on the layer you are on.' }, run);

const ui = () => ({
  type: 'column',
  children: [
    { type: 'text', text: 'Mirror every other key on the layer you are on.', style: 'muted' },
    { type: 'select', id: 'axis', label: 'Mirror', value: axis, options: [{ value: 'horizontal', label: 'Left to right' }, { value: 'vertical', label: 'Top to bottom' }] },
    { type: 'select', id: 'which', label: 'Which keys', value: which, options: [{ value: 'odd', label: '2nd, 4th, 6th...' }, { value: 'even', label: '1st, 3rd, 5th...' }] },
    { type: 'button', id: 'go', label: 'Flip them', primary: true },
  ],
});

const panel = frameling.panels.register({ id: 'flip', title: 'Flip frames' }, ui(), async (e) => {
  if (e.id === 'axis') axis = e.value === 'vertical' ? 'vertical' : 'horizontal';
  else if (e.id === 'which') which = e.value === 'even' ? 'even' : 'odd';
  else if (e.id === 'go') await run();
  panel.update(ui());
});
