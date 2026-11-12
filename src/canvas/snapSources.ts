/**
 * Lines other parts of the app (plugins) offer for snapping. Each source answers with the lines it has right now, in
 * document coordinates; Frameling asks only while the "Plugin guides" tick is on. A source goes away with its owner.
 */
import { ownedUndo } from '../core/owners';

export interface SourceLines {
  /** Up-and-down lines, by x. */
  x: number[];
  /** Sideways lines, by y. */
  y: number[];
}

type Source = () => SourceLines;

const sources: Source[] = [];

export function registerSnapSource(s: Source): void {
  sources.push(s);
  ownedUndo(() => {
    const i = sources.indexOf(s);
    if (i >= 0) sources.splice(i, 1);
  });
}

/** Every source's lines together (a source that throws is skipped). */
export function sourceLines(): SourceLines {
  const out: SourceLines = { x: [], y: [] };
  for (const s of sources) {
    try {
      const l = s();
      out.x.push(...l.x);
      out.y.push(...l.y);
    } catch {
      // A broken source only loses its own lines.
    }
  }
  return out;
}
