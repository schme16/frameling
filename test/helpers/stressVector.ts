// A big vector document shaped like the perf sweep's `stress-vector`: 40 layers in nested folders, 240 keys each, three
// shapes per key (two paths and a stroke).
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { Doc, Shape } from '../../src/core/format';

const hex = (i: number) => '#' + ((((i * 2654435761) >>> 8) & 0xffffff).toString(16)).padStart(6, '0');
const BRUSH = { size: 6, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 0, capStart: true, capEnd: true };

export function stressVectorDoc(layers = 40, keys = 240): Doc {
  let n = 0;
  const id = (p: string) => p + (++n).toString(36);
  const blob = (cx: number, cy: number, r: number, i: number): Shape => ({
    id: id('s'),
    type: 'path',
    fill: hex(i + 7),
    stroke: { color: '#1d1b26', width: 3, join: 'round', cap: 'round' },
    opacity: 1,
    paths: [
      {
        closed: true,
        points: Array.from({ length: 6 }, (_, k) => {
          const a = (k / 6) * Math.PI * 2;
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          return { x, y, c1: { x: x - Math.sin(a) * r * 0.3, y: y + Math.cos(a) * r * 0.3 }, c2: { x: x + Math.sin(a) * r * 0.3, y: y - Math.cos(a) * r * 0.3 } };
        }),
      },
    ],
  });
  const line = (x: number, y: number, i: number): Shape => ({
    id: id('s'),
    type: 'stroke',
    color: hex(i + 3),
    opacity: 1,
    brush: BRUSH,
    points: Array.from({ length: 24 }, (_, k) => ({ x: x + k * 5, y: y + Math.sin(k / 3 + i) * 14, p: 0.5 })),
  });
  const d = newDoc({ name: 'stress', width: 1280, height: 720, fps: 24, length: keys, background: null });
  d.layers = [];
  d.drawings = {};
  d.folders = {};
  for (let b = 0; b < 8; b++) d.folders[`fold${b}`] = { id: `fold${b}`, name: 'Group ' + b, visible: true, opacity: 1, parent: b >= 4 ? `fold${b - 4}` : undefined } as any;
  const per = Math.ceil(layers / 8);
  for (const b of [0, 4, 1, 5, 2, 6, 3, 7])
    for (let j = 0; j < per; j++) {
      const i = b * per + j;
      if (i >= layers) continue;
      const L = newVectorLayer('Layer ' + (i + 1));
      L.id = id('l');
      L.folder = `fold${b}`;
      for (let f = 0; f < keys; f++) {
        const x = 100 + ((i * 29) % 900) + 40 * Math.sin(f / 10 + i);
        const y = 80 + ((i * 17) % 500) + 30 * Math.cos(f / 8);
        const dr = { id: id('v'), kind: 'vector' as const, shapes: [blob(x, y, 28, i), line(x - 40, y + 40, i + f), blob(x + 60, y + 20, 14, f)] };
        for (const s of dr.shapes) (s as any).origin = s.id;
        d.drawings[dr.id] = dr;
        L.cels.push({ id: id('c'), start: f, length: 1, drawingId: dr.id });
      }
      d.layers.push(L);
    }
  return d;
}
