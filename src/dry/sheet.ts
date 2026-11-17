// The paper as a thing about the sheet, not about each tool. The sheet has one paper (set once, kept between sessions),
// and every tool that catches on paper uses it. A pixel brush may keep a paper of its own, which wins over the sheet's
// for that brush only. Pure functions, so which tools show the Paper group and what happens when two papers disagree can
// be tested without drawing anything.
import { paperInfo, type PaperKind } from './paper';

/** The tool ids the group is shown for. */
export const DRY_TOOL = 'charcoal';
export const PIXEL_BRUSH = 'pixel-brush';
export const BRUSH_TOOL = 'brush';

/** What the group needs to know about the tool you are on. */
export interface PaperFacts {
  tool: string;
  /** The pixel brush's grain is on. */
  grainOn?: boolean;
  /** The brush's tip, when it is a chalk or charcoal one: its kind, and whether it catches on paper. */
  tipKind?: string | null;
  tipDry?: boolean;
}

/**
 * Whether a tool carries the Paper group. 'on' shows it open, 'off' shows just its switch (the tool can catch on paper
 * but is not at the moment), 'none' leaves it out because the tool never touches paper.
 */
export type PaperGroupMode = 'on' | 'off' | 'none';

export function paperGroupMode(f: PaperFacts): PaperGroupMode {
  if (f.tool === DRY_TOOL) return 'on';
  if (f.tool === PIXEL_BRUSH) return f.grainOn ? 'on' : 'off';
  if (f.tool === BRUSH_TOOL && (f.tipKind === 'chalk' || f.tipKind === 'charcoal')) return f.tipDry ? 'on' : 'off';
  return 'none';
}

/** Which tools can ever carry the group, for the audit that every one of them does. */
export const PAPER_TOOLS: string[] = [DRY_TOOL, PIXEL_BRUSH, BRUSH_TOOL];

/** Which paper a stroke lands on, and whose it is. */
export interface PaperNow {
  paper: PaperKind;
  source: 'sheet' | 'brush';
  /** The brush has its own paper and it is not the sheet's, so the two disagree. */
  differs: boolean;
}

export function paperNow(sheet: PaperKind, own?: PaperKind): PaperNow {
  if (!own) return { paper: sheet, source: 'sheet', differs: false };
  return { paper: own, source: 'brush', differs: own !== sheet };
}

/** The paper a stroke is made on: the brush's own when it has one, else the sheet's. */
export const effectivePaper = (sheet: PaperKind, own?: PaperKind): PaperKind => own ?? sheet;

/** The two papers a chip click can change. */
export interface PaperState {
  sheet: PaperKind;
  own?: PaperKind;
}

/**
 * What picking a paper in the group does. A brush on the sheet's paper changes the sheet, since that is the one shared
 * setting. A brush with its own paper is a real question (the brush you are looking at, or the whole sheet), and
 * `where` is the answer.
 */
export function pickPaper(now: PaperState, picked: PaperKind, where: 'sheet' | 'brush'): PaperState {
  if (now.own === undefined) return { sheet: picked };
  // Changing the sheet takes the brush along with it, so what you picked is what you get.
  return where === 'sheet' ? { sheet: picked } : { sheet: now.sheet, own: picked };
}

/** True when picking a paper with this state is a question: the brush has its own paper and the pick is a different one. */
export const pickNeedsAnswer = (now: PaperState, picked: PaperKind): boolean => now.own !== undefined && picked !== now.own;

/** Keeps the brush on the paper it is on now, so a later change of sheet leaves it alone. */
export const pinBrush = (now: PaperState): PaperState => ({ sheet: now.sheet, own: now.own ?? now.sheet });

/** Puts the brush back on the sheet's paper. */
export const unpinBrush = (now: PaperState): PaperState => ({ sheet: now.sheet });

/**
 * Using a saved dry brush that was kept on one paper while the sheet is on another. 'sheet' moves the sheet to the
 * brush's paper (so the brush looks as it was saved); 'keep' leaves the sheet where it is. A brush saved with no paper
 * never moves the sheet.
 */
export function sheetAfterUsing(sheet: PaperKind, saved: PaperKind | undefined, answer: 'sheet' | 'keep'): PaperKind {
  return saved && answer === 'sheet' ? saved : sheet;
}

/** True when using a saved dry brush would move the sheet, so there is something to ask. */
export const savedPaperDiffers = (sheet: PaperKind, saved: PaperKind | undefined): boolean => !!saved && saved !== sheet;

/** The line under the paper choice that says which paper this is, in plain words. */
export function paperSaid(now: PaperNow, sheet: PaperKind): string {
  if (now.source === 'sheet') return 'This is the sheet’s paper. Every tool that catches on paper uses it.';
  return now.differs
    ? `This brush keeps its own paper. Your sheet is on ${paperInfo(sheet).label}.`
    : 'This brush keeps its own paper, which is the same as your sheet’s for now.';
}
