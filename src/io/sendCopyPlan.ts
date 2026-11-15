// Send a copy, the parts that are plain functions: how big a file is in words, what the choice says about size, and
// making the bytes of a copy. Nothing here touches the open drawing, the store or the screen.
import { uid } from '../core/doc';
import type { Doc } from '../core/format';
import type { HistorySource } from '../core/historyFile';
import { saveFileAsync, type SaveOptions } from './file';

/** A file size in plain words: "850 KB", "3.4 MB". Never zero KB. */
export function sizeWords(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / 1024 / 1024;
    return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** What the two sizes of a copy are, once both are known. `extra` is how much the history adds. */
export interface CopySizes {
  plain: number;
  full: number;
}

export function extraBytes(s: CopySizes): number {
  return Math.max(0, s.full - s.plain);
}

/**
 * The bytes of a copy to send. It is the drawing as it is, with its own id (so the copy has its own version history, as
 * Save as does) and the undo history only when `history` is given. The drawing passed in is never changed.
 */
export function packCopy(doc: Doc, appVersion: string, opts: { history?: HistorySource | null; preview?: Uint8Array; now?: Date } = {}): Promise<Uint8Array> {
  const save: SaveOptions = { ...(opts.preview ? { preview: opts.preview } : {}), ...(opts.history ? { history: opts.history } : {}) };
  return saveFileAsync({ ...doc, id: uid('d') }, appVersion, opts.now ?? new Date(), save);
}
