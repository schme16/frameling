// Small things that happen while drawing, for whoever wants to notice them (Quill's pixel moments, src/pixel/moments.ts).
// The tools only say what happened; they don't know who is listening.
export type ToolEvent = 'altPick' | 'perfectFix';

const listeners = new Set<(e: ToolEvent) => void>();

export function onToolEvent(fn: (e: ToolEvent) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function toolEvent(e: ToolEvent): void {
  for (const fn of listeners) fn(e);
}
