// What reading a brush file gives back. Every format reader returns this and nothing else, so the dialog, the library and
// the tests never need to know which program the file came from. Pure, no DOM.
import type { DabBrush } from '../../dab/maths';

export type BrushFormat = 'gbr' | 'gih' | 'vbr' | 'abr' | 'kpp' | 'bundle' | 'procreate' | 'clip' | 'affinity';

/** The program a format belongs to and a plain name for the file, for the words the person reads. */
export const FORMAT_NAMES: Record<BrushFormat, { app: string; what: string }> = {
  gbr: { app: 'GIMP', what: 'GIMP brush' },
  gih: { app: 'GIMP', what: 'GIMP brush pipe' },
  vbr: { app: 'GIMP', what: 'GIMP generated brush' },
  abr: { app: 'Photoshop', what: 'Photoshop brush set' },
  kpp: { app: 'Krita', what: 'Krita brush preset' },
  bundle: { app: 'Krita', what: 'Krita resource bundle' },
  procreate: { app: 'Procreate', what: 'Procreate brush' },
  clip: { app: 'Clip Studio Paint', what: 'Clip Studio Paint brush' },
  affinity: { app: 'Affinity', what: 'Affinity brush set' },
};

export interface ImportedBrush {
  /** The name it had in the file (tidied when it lands in the library). */
  name: string;
  /** The brush, already through `cleanDab`: nothing in it is trusted from the file. */
  dab: DabBrush;
  /** Settings the file had that Frameling has no place for, in plain words. Empty means nothing was lost. */
  dropped: string[];
  /** Settings that came across but as the nearest thing Frameling has (a curve as a straight line, a picture shrunk). */
  changed: string[];
}

export type ImportResult =
  | {
      ok: true;
      format: BrushFormat;
      /** What to call the group the brushes go in: the set's own name, else the file's. */
      setName: string;
      brushes: ImportedBrush[];
      /** Things about the whole file (brushes that could not be read, a pipe with more pictures than one). */
      notes: string[];
    }
  | { ok: false; format?: BrushFormat; error: string };

/** A file that is damaged or not what it says. The message is written for the person, so it is shown as it is. */
export class BrushProblem extends Error {}

/** The most one brush file may be: past this it is refused before any of it is read. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
/** The most brushes one file may bring in (the library keeps a thousand). */
export const MAX_BRUSHES_PER_FILE = 1000;

export const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`;
