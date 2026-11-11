// Small helpers for the example cards on the welcome sheet: how big the picture is, and which tags show as chips.

/** The room for a card's picture, in CSS pixels. The bottom of the art box is kept for the Vector/Pixel badge. */
export const THUMB_BOX = { w: 168, h: 70 };

/** A page of w x h fitted whole inside the box (never cropped), in CSS pixels, at least 1 x 1. */
export function fitThumb(w: number, h: number, box = THUMB_BOX): { w: number; h: number; scale: number } {
  const scale = Math.min(box.w / Math.max(1, w), box.h / Math.max(1, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)), scale };
}

/** The tags shown on a card (the first few) and how many more there are. */
export function tagChips(tags: readonly string[] | undefined, max = 3): { shown: string[]; more: string[] } {
  const list = (tags ?? []).map((t) => t.trim()).filter(Boolean);
  // "+1" takes the same room as the tag itself, so show it instead.
  if (list.length <= max + 1) return { shown: list, more: [] };
  return { shown: list.slice(0, max), more: list.slice(max) };
}
