// How much unsaved work a restart will carry across as a copy. Bigger than this, and it falls back to asking first.
export const MAX_HANDOVER_BYTES = 400 * 1024 * 1024;

/** Can this copy of the work be handed over? Pure, so the page and the tests agree. */
export function handoverFits(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > 0 && bytes <= MAX_HANDOVER_BYTES;
}
