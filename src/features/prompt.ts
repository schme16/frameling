// When an opened drawing holds data of a feature that is turned off, asks whether to turn it on. Saying no changes
// nothing: the data stays in the file (see io/ext.ts) and the drawing still opens.
import type { Doc } from '../core/format';
import { ask } from '../platform/ask';
import { offFeaturesUsedBy, setFeatureOn } from './host';

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

/** Asks about every turned-off feature `doc` uses. Resolves to the ids that were turned on. */
export async function offerTurnOn(doc: Doc): Promise<string[]> {
  const used = offFeaturesUsedBy(doc);
  if (!used.length) return [];
  const answer = await ask({ ...promptText(used.map((f) => f.name)), buttons: [{ value: 'on', label: 'Turn on', primary: true }, { value: 'off', label: 'Not now' }], cancel: 'off' });
  if (answer !== 'on') return [];
  return used.filter((f) => setFeatureOn(f.id, true).ok).map((f) => f.id);
}
