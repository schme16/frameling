// Where the geometry code finds "the document" when it was not handed one. The store says so when it is loaded, so the
// geometry (which the picture window shares) never has to import the store itself.
import type { Doc } from './format';

let source: (() => Doc) | null = null;

export function registerDocSource(fn: () => Doc): void {
  source = fn;
}

export function currentDoc(): Doc {
  if (!source) throw new Error('No document is open yet.');
  return source();
}
