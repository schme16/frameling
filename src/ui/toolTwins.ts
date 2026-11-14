// Some tools come in pairs with the same name and key: Select and Lasso are one tool for a vector layer and another
// for a pixel layer. Lists of tools (the Draw menu, the command palette) show each name once.

/**
 * One entry per name. Where a name appears more than once, the one usable right now wins; with none usable (or all
 * of them), the first. Order follows each name's first appearance.
 */
export function oneOfEach<T>(items: T[], label: (t: T) => string, usable: (t: T) => boolean): T[] {
  const kept = new Map<string, T>();
  for (const it of items) {
    const key = label(it);
    const have = kept.get(key);
    if (!have || (!usable(have) && usable(it))) kept.set(key, it);
  }
  const out: T[] = [];
  const done = new Set<string>();
  for (const it of items) {
    const key = label(it);
    if (done.has(key)) continue;
    done.add(key);
    out.push(kept.get(key)!);
  }
  return out;
}
