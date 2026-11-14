// Worker thread for taking the colours of a picture (see quantiseRun.ts). Counts the chunks it is handed, then picks colours on request.
import { Histogram, pickSteps, type ColourTable } from './quantise';

export type ToWorker = { t: 'add'; pixels: Uint8Array | Uint8ClampedArray } | { t: 'pick'; id: number; max: number };
export type FromWorker =
  | { t: 'ack' }
  | { t: 'picked'; id: number; colours: number[]; distinct: number; exact: boolean; solid: number };

const scope = self as unknown as { onmessage: ((e: MessageEvent<ToWorker>) => void) | null; postMessage(msg: FromWorker): void };
const hist = new Histogram();
let table: ColourTable | null = null;

scope.onmessage = (e) => {
  const m = e.data;
  if (m.t === 'add') {
    hist.add(m.pixels);
    scope.postMessage({ t: 'ack' });
    return;
  }
  table ??= hist.table();
  const g = pickSteps(table, m.max);
  let r = g.next();
  while (!r.done) r = g.next();
  scope.postMessage({ t: 'picked', id: m.id, colours: r.value, distinct: table.keys.length, exact: table.exact, solid: table.solid });
};
