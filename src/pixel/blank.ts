// Is a sprite still blank? A quick look at its drawings: no pixel has any colour yet.
import type { Doc } from '../core/format';

export function isBlankDocQuick(doc: Doc): boolean {
  for (const d of Object.values(doc.drawings)) {
    if (d.kind !== 'pixel') continue;
    for (let i = 3; i < d.pixels.length; i += 4) if (d.pixels[i] !== 0) return false;
  }
  return true;
}
