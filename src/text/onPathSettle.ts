// Keeps words on a curve glued to the line they follow. After any change to a drawing, text that names a source line
// gets its curve worked out again from that line, in the same undo step, so moving or reshaping the line moves the words.
// Registered for good with the text kind (kind.ts), so it holds even while the Text feature is switched off.
import type { Draft } from 'immer';
import type { Doc, Id, SubPath, TextShape } from '../core/format';
import { transformMatrix } from '../core/symbols';
import { registerSettler, type SettleContext } from '../core/store';
import { curveInTextSpace, curveOfShape, sameCurve } from './onPath';

interface Job {
  drawing: Id;
  text: Id;
  curve: SubPath;
}

/** The recipe that brings every followed curve up to date, or null when nothing has drifted. */
export function settlePathText(doc: Doc, ctx?: SettleContext): ((d: Draft<Doc>) => void) | null {
  if (!ctx) return null;
  const touched = new Set<Id>();
  for (const p of ctx.patches) if (p.path[0] === 'drawings' && typeof p.path[1] === 'string') touched.add(p.path[1]);
  if (!touched.size) return null;
  const jobs: Job[] = [];
  for (const id of touched) {
    const d = doc.drawings[id];
    if (!d || d.kind !== 'vector') continue;
    for (const s of d.shapes) {
      if (s.type !== 'text' || !s.onPath?.source) continue;
      const src = d.shapes.find((x) => x.id === s.onPath!.source);
      const stage = src && curveOfShape(src);
      // A source that is gone, or has no line left, leaves the words on the curve they last had.
      if (!stage) continue;
      const next = curveInTextSpace(stage, transformMatrix(s.transform, { x: 0, y: 0 }));
      if (!sameCurve(next, s.onPath.curve)) jobs.push({ drawing: id, text: s.id, curve: next });
    }
  }
  if (!jobs.length) return null;
  return (draft) => {
    for (const j of jobs) {
      const d = draft.drawings[j.drawing];
      if (!d || d.kind !== 'vector') continue;
      const t = d.shapes.find((x) => x.id === j.text) as Draft<TextShape> | undefined;
      if (t?.onPath) t.onPath.curve = j.curve as Draft<SubPath>;
    }
  };
}

registerSettler(settlePathText);
