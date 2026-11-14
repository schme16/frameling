// Putting away the optional areas the hello's picks don't need, and bringing them back. The choosing is in flow.ts
// (featuresToTuck); this is the part that talks to the features host.
import { isFeatureOn, setFeatureOn, switchableFeatures } from '../../features/host';
import { featuresToTuck, nameList, type Interest } from './flow';

/** The areas that would be put away for these picks, with their plain names. */
export function tuckPlan(interests: readonly Interest[]): { ids: string[]; names: string[] } {
  const list = switchableFeatures();
  const ids = featuresToTuck(
    interests,
    list.map((f) => ({ id: f.id, on: isFeatureOn(f.id), requires: f.requires })),
  );
  return { ids, names: ids.map((id) => list.find((f) => f.id === id)?.name ?? id) };
}

/** Switches the areas off (they are remembered as off, so Preferences > Features shows them off). Returns the ones that went. */
export function tuckAway(ids: readonly string[]): string[] {
  const went: string[] = [];
  for (const id of ids) if (setFeatureOn(id, false).ok) went.push(id);
  return went;
}

/** Switches them back on. */
export function bringBack(ids: readonly string[]): void {
  for (const id of ids) setFeatureOn(id, true);
}

export { nameList };
