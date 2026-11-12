// Version 2 example: a guide drawn on top of the canvas, and an event that keeps it up to date.
// The guide is a draw list (lines and text) that Frameling draws itself. It is never part of your drawing or exports.

const WIDTH = 1280;
const HEIGHT = 720; // The guide assumes a 1280 x 720 stage; a real plugin would read the size with document.get().
let on = { thirds: true, counter: true };
let frame = 0;

function list() {
  const out = [];
  if (on.thirds) {
    for (const f of [1 / 3, 2 / 3]) {
      out.push({ type: 'line', x1: WIDTH * f, y1: 0, x2: WIDTH * f, y2: HEIGHT, stroke: '#00aaffcc', width: 1, dash: [6, 6], screen: true });
      out.push({ type: 'line', x1: 0, y1: HEIGHT * f, x2: WIDTH, y2: HEIGHT * f, stroke: '#00aaffcc', width: 1, dash: [6, 6], screen: true });
    }
  }
  if (on.counter) out.push({ type: 'text', x: 16, y: HEIGHT - 16, text: 'Frame ' + (frame + 1), size: 24, fill: '#00aaff' });
  return out;
}

const show = () => frameling.canvas.overlay(list());

frameling.events.on('frame.changed', (e) => {
  frame = e.frame;
  show();
});

const ui = () => ({
  type: 'column',
  children: [
    { type: 'checkbox', id: 'thirds', label: 'Rule of thirds', value: on.thirds },
    { type: 'checkbox', id: 'counter', label: 'Frame counter', value: on.counter },
  ],
});

const panel = frameling.panels.register({ id: 'guides', title: 'Guides' }, ui(), (e) => {
  on[e.id] = !!e.value;
  show();
  panel.update(ui());
});

show();
