/**
 * Who registered what. A feature's registrations run inside `withOwner(featureId, ...)`; every registry that adds
 * something calls `ownedUndo` with the way to take it away again. `removeOwned(featureId)` then undoes exactly what
 * that feature added, so turning a feature off leaves nothing behind and turning it on again puts it all back.
 * Registrations made outside `withOwner` belong to no one and stay for good.
 */
const undoers = new Map<string, (() => void)[]>();
let current: string | null = null;

/** Runs `fn` with `owner` as the one registering things. Nests. */
export function withOwner<T>(owner: string, fn: () => T): T {
  const before = current;
  current = owner;
  try {
    return fn();
  } finally {
    current = before;
  }
}

export const currentOwner = (): string | null => current;

/** Registries call this right after adding something. Does nothing when no feature is registering. */
export function ownedUndo(undo: () => void): void {
  if (!current) return;
  const list = undoers.get(current);
  if (list) list.push(undo);
  else undoers.set(current, [undo]);
}

/** Takes away everything `owner` registered, newest first. Returns how many things went. */
export function removeOwned(owner: string): number {
  const list = undoers.get(owner) ?? [];
  undoers.delete(owner);
  for (let i = list.length - 1; i >= 0; i--) {
    try {
      list[i]();
    } catch {
      // One thing failing to go must not leave the rest behind.
    }
  }
  return list.length;
}

export const ownedCount = (owner: string): number => undoers.get(owner)?.length ?? 0;
