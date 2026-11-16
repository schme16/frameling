// A contact sheet: every frame as a small picture on one page, with its number under it, for a review or a quick look
// at the whole animation. The layout is plain maths here; the pictures are drawn in formats/contact.ts.

export type ContactSize = 'small' | 'medium' | 'large';
export type ContactPage = 'light' | 'dark';

/** The settings a contact sheet reads (all optional: see the defaults below). */
export interface ContactOpts {
  contactSize?: ContactSize;
  contactColumns?: number;
  contactLabels?: boolean;
  contactPage?: ContactPage;
}

/** The longest side of each small picture. */
export const CONTACT_SIDE: Record<ContactSize, number> = { small: 160, medium: 240, large: 360 };

export const contactSizeOf = (s: ContactOpts): ContactSize => (s.contactSize && s.contactSize in CONTACT_SIDE ? s.contactSize : 'medium');
export const contactLabelsOf = (s: ContactOpts): boolean => s.contactLabels !== false;
export const contactPageOf = (s: ContactOpts): ContactPage => (s.contactPage === 'dark' ? 'dark' : 'light');
export const contactColumnsOf = (s: ContactOpts): number => (typeof s.contactColumns === 'number' && s.contactColumns >= 1 ? Math.min(60, Math.round(s.contactColumns)) : 0);

export const CONTACT_MARGIN = 24;
export const CONTACT_GAP = 16;
export const CONTACT_LABEL = 24;
export const CONTACT_HEADER = 84;

/** The small picture's size: the drawing scaled so its longest side is `side`. */
export function thumbSize(w: number, h: number, side: number): { width: number; height: number } {
  const k = side / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

export interface ContactSpec {
  count: number;
  cellW: number;
  cellH: number;
  /** 0 picks a roughly page shaped layout. */
  columns: number;
  labels: boolean;
}

export interface ContactLayout {
  columns: number;
  rows: number;
  width: number;
  height: number;
  /** Top left of every small picture. */
  cells: { x: number; y: number }[];
  /** Where the page's title goes (the height of that band is CONTACT_HEADER). */
  cellW: number;
  cellH: number;
  labelH: number;
}

function sizeFor(spec: ContactSpec, columns: number): { width: number; height: number; rows: number; labelH: number } {
  const labelH = spec.labels ? CONTACT_LABEL : 0;
  const rows = Math.ceil(spec.count / columns);
  const width = CONTACT_MARGIN * 2 + columns * spec.cellW + (columns - 1) * CONTACT_GAP;
  const height = CONTACT_HEADER + CONTACT_MARGIN + rows * (spec.cellH + labelH) + (rows - 1) * CONTACT_GAP;
  return { width, height, rows, labelH };
}

/** How many columns make the page closest to the shape of a sheet of paper lying on its side (about 1.4 wide for 1 high). */
export function autoColumns(spec: ContactSpec): number {
  let best = 1;
  let bestScore = Infinity;
  for (let c = 1; c <= Math.max(1, Math.min(spec.count, 40)); c++) {
    const { width, height } = sizeFor(spec, c);
    const score = Math.abs(Math.log(width / height / 1.4));
    if (score < bestScore - 1e-9) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

export function contactLayout(spec: ContactSpec): ContactLayout {
  const count = Math.max(1, spec.count);
  const sp = { ...spec, count };
  const columns = Math.min(count, spec.columns >= 1 ? spec.columns : autoColumns(sp));
  const { width, height, rows, labelH } = sizeFor(sp, columns);
  const cells = Array.from({ length: count }, (_, i) => ({
    x: CONTACT_MARGIN + (i % columns) * (spec.cellW + CONTACT_GAP),
    y: CONTACT_HEADER + Math.floor(i / columns) * (spec.cellH + labelH + CONTACT_GAP),
  }));
  return { columns, rows, width, height, cells, cellW: spec.cellW, cellH: spec.cellH, labelH };
}

/** The biggest side a contact sheet picture may have (the most a canvas holds everywhere). */
export const CONTACT_MAX_SIDE = 16384;

/** Plain words when the sheet would be too big, or null. */
export function contactProblem(layout: Pick<ContactLayout, 'width' | 'height'>): string | null {
  if (layout.width > CONTACT_MAX_SIDE || layout.height > CONTACT_MAX_SIDE || layout.width * layout.height > 120_000_000) return 'That sheet would be too big for one picture. Choose smaller pictures, more columns, or one clip at a time.';
  return null;
}

/** The line under the page's title: "24 frames, 12 per second, 512 × 512". */
export function contactSubtitle(count: number, fps: number, w: number, h: number): string {
  const rate = Number.isInteger(fps) ? `${fps}` : fps.toFixed(1);
  return `${count} frame${count === 1 ? '' : 's'}, ${rate} per second, ${w} × ${h}`;
}

/** The size of each small picture and the page they sit on, for the settings. */
export function contactSheetSize(doc: { width: number; height: number }, count: number, s: ContactOpts): { thumb: { width: number; height: number }; layout: ContactLayout } {
  const thumb = thumbSize(doc.width, doc.height, CONTACT_SIDE[contactSizeOf(s)]);
  return { thumb, layout: contactLayout({ count, cellW: thumb.width, cellH: thumb.height, columns: contactColumnsOf(s), labels: contactLabelsOf(s) }) };
}
