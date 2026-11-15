// What the page says when the actions door asks. Pure: the gate is handed in, so every answer is tested without the app.
import type { GateSnapshot, Verdict } from '../audience/gate';
import type { DoorList, DoorVerdict } from '../shared/streamDoor';

export interface GateLike {
  snapshot(): GateSnapshot;
  submit(id: string, raw?: unknown): Verdict;
}

/**
 * The list: ONLY the actions the gate says are available right now (an action that reaches the drawing is left out while
 * the streamer has not allowed that), with the cooldown the streamer's strictness really gives.
 */
export function listFor(g: GateLike): DoorList {
  const s = g.snapshot();
  return {
    on: s.on,
    actions: s.actions
      .filter((a) => a.available)
      .map((a) => ({ id: a.id, label: a.label, kind: a.kind, cooldownMs: Math.round(a.cooldown * s.limits.cooldownScale), touchesDrawing: a.touchesDrawing, ready: a.ready })),
  };
}

/** The answer to one question from the door: the list, the gate's verdict on a run, or null for something that is not a question. Never throws. */
export function answerAsk(op: unknown, g: GateLike): DoorList | DoorVerdict | null {
  try {
    if (!op || typeof op !== 'object') return null;
    const o = op as { op?: unknown; id?: unknown; payload?: unknown };
    if (o.op === 'list') return listFor(g);
    if (o.op === 'run' && typeof o.id === 'string') return g.submit(o.id, o.payload);
    return null;
  } catch {
    return null;
  }
}
