// The demo drawing and the comments file used by the review page's help clip and its looks: a friendly face, two notes
// from "Shane", and what "Anna" sends back. The comments file is made when it is asked for, so "an hour ago" stays true.
const INK = '#1d1b26';
const KAPPA = 0.5522847498307936;
let nid = 0;
const hid = () => `d${++nid}`;
const ellPath = (x, y, w, h) => {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2, kx = KAPPA * rx, ky = KAPPA * ry;
  return { closed: true, points: [
    { x: cx + rx, y: cy, c1: { x: cx + kx, y: cy - ry }, c2: { x: cx + rx, y: cy - ky } },
    { x: cx, y: cy + ry, c1: { x: cx + rx, y: cy + ky }, c2: { x: cx + kx, y: cy + ry } },
    { x: cx - rx, y: cy, c1: { x: cx - kx, y: cy + ry }, c2: { x: cx - rx, y: cy + ky } },
    { x: cx, y: cy - ry, c1: { x: cx - rx, y: cy - ky }, c2: { x: cx - kx, y: cy - ry } },
  ] };
};
const shape = (paths, fill, stroke = INK, width = 6) => ({ id: hid(), type: 'path', paths, fill, stroke: stroke ? { color: stroke, width, join: 'round', cap: 'round' } : null, opacity: 1 });
const ell = (x, y, w, h, fill, stroke, width) => shape([ellPath(x, y, w, h)], fill, stroke, width);
const line = (x1, y1, x2, y2, color = INK, width = 8) => shape([{ closed: false, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] }], null, color, width);
const FACE = [
  ell(380, 140, 520, 470, '#ffd9a8', INK, 8),
  ell(470, 260, 120, 120, '#ffffff', INK, 6), ell(515, 305, 40, 40, INK, null),
  ell(720, 330, 64, 64, '#ffffff', INK, 6), ell(740, 350, 24, 24, INK, null),
  line(520, 520, 780, 470, '#d3445f', 12),
  line(640, 380, 625, 450, INK, 6),
];
/** The doc id the demo uses, so a comments file can name it. */
const DOC_ID = 'review-demo';
/** Steps that put the face and Shane's two notes into the open document. Run it as a record.cjs "eval". */
const SETUP = `(() => { const S = __frameling.store(); const shapes = ${JSON.stringify(FACE)};
  S.update('setup', (d) => { d.id = ${JSON.stringify(DOC_ID)}; d.name = 'Sunny face'; const l = d.layers.find((x) => x.name === 'Lines') ?? d.layers[0]; d.drawings[l.cels[0].drawingId].shapes.push(...shapes);
    d.notes = [
      { id: 'n-eye', x: 740, y: 340, text: 'Raise this eye a touch', by: 'Shane', at: Date.now() - 86400000 },
      { id: 'n-mouth', x: 800, y: 480, text: 'Is the mouth too wide?', by: 'Shane', at: Date.now() - 86000000 },
    ]; }); })(); 0`;
/** What Anna sends back, as the bytes of a comments file. */
function commentsBytes() {
  const now = Date.now();
  const file = {
    format: 'frameling-review', doc: DOC_ID, from: 'Anna', sent: now - 7200000, made: now - 1800000,
    notes: [{ id: 'a-eyes', x: 560, y: 300, text: 'The eyes feel a little far apart', by: 'Anna', at: now - 1800000 }],
    replies: [{ note: 'n-mouth', id: 'a-r1', text: 'A bit, yes. Try 20% narrower?', by: 'Anna', at: now - 1700000 }],
    marks: [{ id: 'a-ring', kind: 'circle', pts: [500, 440, 800, 560], color: '#3b82f6', by: 'Anna', at: now - 1750000 }],
    done: ['n-eye'],
  };
  return new TextEncoder().encode(JSON.stringify(file));
}
module.exports = { DOC_ID, SETUP, commentsBytes, FACE };
