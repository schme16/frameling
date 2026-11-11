// Units for showing sizes: the document is measured in pixels, and these turn pixels into mm, cm, inches or points
// (and back) at the document's DPI. Pure functions, no DOM.
//
// The default DPI is 96, not 72: a document pixel is drawn as one CSS pixel at 100% zoom, CSS and SVG both define
// an inch as 96 px, and the SVG and Interactives exports keep that size. So 96 is the only DPI where "1 in" in
// Frameling is also an inch in everything it exports to. Points are always 1/72 in, whatever the DPI.

export type Unit = 'px' | 'mm' | 'cm' | 'in' | 'pt';

export interface UnitInfo {
  id: Unit;
  /** What it's called in the UI. */
  label: string;
  /** Decimal places shown. */
  places: number;
}

export const UNITS: UnitInfo[] = [
  { id: 'px', label: 'Pixels', places: 0 },
  { id: 'mm', label: 'Millimetres', places: 1 },
  { id: 'cm', label: 'Centimetres', places: 2 },
  { id: 'in', label: 'Inches', places: 2 },
  { id: 'pt', label: 'Points', places: 1 },
];

export const DEFAULT_UNIT: Unit = 'px';
export const DEFAULT_DPI = 96;
export const MIN_DPI = 1;
export const MAX_DPI = 10000;

export const isUnit = (v: unknown): v is Unit => UNITS.some((u) => u.id === v);

export const unitInfo = (u: Unit): UnitInfo => UNITS.find((x) => x.id === u) ?? UNITS[0];

/** A sensible DPI: a number in range, else the default. */
export function cleanDpi(dpi: unknown): number {
  return typeof dpi === 'number' && Number.isFinite(dpi) && dpi >= MIN_DPI && dpi <= MAX_DPI ? dpi : DEFAULT_DPI;
}

/** The document's DPI (96 when it doesn't say). */
export const docDpi = (doc: { dpi?: number }): number => cleanDpi(doc.dpi);

// How many of the unit make an inch.
const PER_INCH: Record<Unit, number> = { px: 0, mm: 25.4, cm: 2.54, in: 1, pt: 72 };

/** Pixels to the unit. */
export function pxTo(px: number, unit: Unit, dpi = DEFAULT_DPI): number {
  if (unit === 'px') return px;
  return (px / cleanDpi(dpi)) * PER_INCH[unit];
}

/** The unit to pixels (not rounded: round when it becomes a document size). */
export function toPx(value: number, unit: Unit, dpi = DEFAULT_DPI): number {
  if (unit === 'px') return value;
  return (value / PER_INCH[unit]) * cleanDpi(dpi);
}

/** Rounds to the places the unit shows. */
export function roundIn(value: number, unit: Unit): number {
  const f = 10 ** unitInfo(unit).places;
  return Math.round(value * f) / f;
}

/** A number the way the UI shows it: no trailing zeros ("12.5", not "12.50"). */
export const showNumber = (value: number, unit: Unit): string => String(roundIn(value, unit));

/** "338.7 mm" for a length in pixels. */
export const formatLength = (px: number, unit: Unit, dpi = DEFAULT_DPI): string => `${showNumber(pxTo(px, unit, dpi), unit)} ${unit}`;

/** "1280 x 720 px" or "338.7 x 190.5 mm". */
export function formatSize(w: number, h: number, unit: Unit, dpi = DEFAULT_DPI): string {
  return `${showNumber(pxTo(w, unit, dpi), unit)} x ${showNumber(pxTo(h, unit, dpi), unit)} ${unit}`;
}
