// Names for drawings (a cel's `name`). One tidy-up used by the file reader and by the rename, so what is saved is what
// was typed, trimmed.

/** The longest a drawing's name can be. */
export const CEL_NAME_MAX = 60;

/** A name made tidy: spaces trimmed and runs of them folded, cut to length. Empty, or not text at all, is no name. */
export function cleanCelName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const n = v.replace(/\s+/g, ' ').trim().slice(0, CEL_NAME_MAX).trim();
  return n || undefined;
}

/** For spreading into a cel: `{ name }` when there is one, nothing when there is not (so a file never carries an empty one). */
export function celNameField(v: unknown): { name?: string } {
  const n = cleanCelName(v);
  return n ? { name: n } : {};
}
