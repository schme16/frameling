// Re-ordering shapes in a drawing (index 0 is at the back). Pure: give an array and the selected ids, get a new array.

interface HasId {
  id: string;
}

/** Moves each selected item one step towards the front, keeping their order and not hopping over each other. */
export function bringForward<T extends HasId>(items: T[], ids: ReadonlySet<string>): T[] {
  const out = items.slice();
  for (let i = out.length - 2; i >= 0; i--) {
    if (ids.has(out[i].id) && !ids.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  }
  return out;
}

/** Moves each selected item one step towards the back. */
export function sendBackward<T extends HasId>(items: T[], ids: ReadonlySet<string>): T[] {
  const out = items.slice();
  for (let i = 1; i < out.length; i++) {
    if (ids.has(out[i].id) && !ids.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
  }
  return out;
}

export function bringToFront<T extends HasId>(items: T[], ids: ReadonlySet<string>): T[] {
  return [...items.filter((s) => !ids.has(s.id)), ...items.filter((s) => ids.has(s.id))];
}

export function sendToBack<T extends HasId>(items: T[], ids: ReadonlySet<string>): T[] {
  return [...items.filter((s) => ids.has(s.id)), ...items.filter((s) => !ids.has(s.id))];
}
