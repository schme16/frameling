// When an opened drawing holds data of a feature that is turned off, asks whether to turn it on. Saying no changes
// nothing: the data stays in the file (see io/ext.ts) and the drawing still opens.
import type { Doc } from '../core/format';
import { notify } from '../io/notify';
import { ask } from '../platform/ask';
import type { FeatureDescriptor } from './feature';
import { hiddenFeatureOpening, hiddenFeaturesUsedBy, offFeaturesUsedBy, setFeatureOn } from './host';

const list = (names: string[]): string => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** The words of the question for these feature names. */
export function promptText(names: string[]): { title: string; message: string; detail: string } {
  const one = names.length === 1;
  return {
    title: one ? 'A feature is turned off' : 'Some features are turned off',
    message: `This drawing uses ${list(names)}, which ${one ? 'is' : 'are'} turned off. Turn ${one ? 'it' : 'them'} on?`,
    detail: `If you leave ${one ? 'it' : 'them'} off, nothing is lost: the drawing keeps all its data. You can turn ${one ? 'it' : 'them'} on any time in Preferences, Features.`,
  };
}

/** What to say about a drawing that holds data of a hidden feature (Interactives while it is off for everyone). No question: there is no switch to offer. */
export const hiddenDocText = (name: string): string =>
  `This drawing came out of ${name}, which isn't in this version of Frameling yet. It opens as a plain drawing, and nothing is lost: the ${name} part stays in the file.`;

/** What to say about a file only a hidden feature opens. */
export const hiddenFileText = (name: string, fileName: string): string =>
  `"${fileName}" is an ${name} file, and ${name} isn't in this version of Frameling yet, so it can't be opened here. The file hasn't been touched.`;

/** Opening a file that needs a hidden feature: says so plainly. Resolves true when it said something (so the caller leaves the file alone). */
export function explainHiddenFile(path: string, fileName: string): boolean {
  const f = hiddenFeatureOpening(path);
  if (!f) return false;
  notify(hiddenFileText(f.name, fileName), 'warn', undefined, 9000);
  return true;
}

/** A file this app can only open with a feature that is off (a .flplay without Interactives): asks, and says whether it was turned on. */
export async function offerTurnOnForFile(feature: FeatureDescriptor, fileName: string): Promise<boolean> {
  const answer = await ask({
    id: 'feature-off',
    title: 'A feature is turned off',
    message: `"${fileName}" needs ${feature.name}, which is turned off. Turn it on?`,
    detail: `You can turn it on or off any time in Preferences, Features.`,
    buttons: [{ value: 'on', label: 'Turn on', primary: true }, { value: 'off', label: 'Not now' }],
    cancel: 'off',
  });
  return answer === 'on' && setFeatureOn(feature.id, true).ok;
}

/** Something a person asked for needs a feature that is off (a Tiles pick in the hello): asks, and says whether it was turned on. */
export async function offerTurnOnForWish(feature: FeatureDescriptor, why: string): Promise<boolean> {
  const answer = await ask({
    id: 'feature-off',
    title: 'A feature is turned off',
    message: `${why} Turn ${feature.name} on?`,
    detail: `You can turn it on or off any time in Preferences, Features.`,
    buttons: [{ value: 'on', label: 'Turn on', primary: true }, { value: 'off', label: 'Not now' }],
    cancel: 'off',
  });
  return answer === 'on' && setFeatureOn(feature.id, true).ok;
}

/** Asks about every turned-off feature `doc` uses. Resolves to the ids that were turned on. */
export async function offerTurnOn(doc: Doc): Promise<string[]> {
  for (const f of hiddenFeaturesUsedBy(doc)) notify(hiddenDocText(f.name), 'info', undefined, 9000);
  const used = offFeaturesUsedBy(doc);
  if (!used.length) return [];
  const answer = await ask({ id: 'feature-off', ...promptText(used.map((f) => f.name)), buttons: [{ value: 'on', label: 'Turn on', primary: true }, { value: 'off', label: 'Not now' }], cancel: 'off' });
  if (answer !== 'on') return [];
  return used.filter((f) => setFeatureOn(f.id, true).ok).map((f) => f.id);
}
