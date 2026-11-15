// The streaming family: the features that are only for people who stream, taken as one thing. The first-run hello asks
// whether you stream and tucks them away if not, the Features page has one switch for the lot, and the audience menu and
// switch only show while any of them is on. Nothing here deletes anything: tucked away is just switched off, and each one
// is still in the palette as "Turn on ..." and on Preferences > Features.
import { isFeatureOn, setFeatureOn } from './host';
import { STREAM_FEATURES } from './streamIds';

export { STREAMING_NAME, STREAM_FEATURES } from './streamIds';

/** True while at least one streaming feature is on. */
export const streamingOn = (): boolean => STREAM_FEATURES.some(isFeatureOn);

/** How many of them are on right now. */
export const streamingCount = (): number => STREAM_FEATURES.filter(isFeatureOn).length;

/** Turns the whole family on or off. Returns the ones that changed. Off goes the other way round, so a feature that needs another is gone before it. */
export function setStreaming(on: boolean, opts: { remember?: boolean } = {}): string[] {
  const order = on ? [...STREAM_FEATURES] : [...STREAM_FEATURES].reverse();
  const changed: string[] = [];
  for (const id of order) {
    if (isFeatureOn(id) === on) continue;
    if (setFeatureOn(id, on, opts).ok) changed.push(id);
  }
  return changed;
}
