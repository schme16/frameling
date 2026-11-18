// The pixel brush in use, as one thing the library can keep: whichever of the Pixel brush, the soft paint tools or Chalk
// and charcoal you are on, with its settings. Reading it gives a PixelSpec; using a saved one puts the settings back and
// picks the tool.
import { withChoice } from '../core/choices';
import { findLayer } from '../core/doc';
import { store } from '../core/store';
import { PAPER_SAVED_CHOICE } from '../dry/choices';
import type { PaperKind } from '../dry/paper';
import { savedPaperDiffers, sheetAfterUsing } from '../dry/sheet';
import { setDryTool, setMedium, setPaper, getDry, subscribeDry } from '../dry/settings';
import { getSoft, setSoftTool, subscribeSoft } from '../soft/settings';
import { pickTool } from '../tools/pick';
import { setWholeDab, getDab, subscribeDab } from './settings';
import { SOFT_KINDS, specTool, type PixelSpec } from './spec';

export const PIXEL_BRUSH_TOOL = 'pixel-brush';
export const DRY_TOOL_ID = 'charcoal';

/** The tools whose settings the pixel side of the library keeps. */
export const isPixelBrushTool = (tool: string): boolean => tool === PIXEL_BRUSH_TOOL || tool === DRY_TOOL_ID || (SOFT_KINDS as string[]).includes(tool);

/**
 * The tool whose brush is in hand. The plain Brush (B) on a pixel layer draws with the Pixel brush's brush (the one
 * shared panel and list), so for its settings it counts as the Pixel brush; everywhere else the tool is itself.
 */
export function brushToolOf(tool: string, layerKind: string | undefined): string {
  return tool === 'brush' && layerKind === 'pixel' ? PIXEL_BRUSH_TOOL : tool;
}

/** `brushToolOf` for the tool and layer you are on now. */
export function liveBrushTool(): string {
  const { ui, doc } = store().get();
  return brushToolOf(ui.tool, (findLayer(doc, ui.activeLayerId) ?? doc.layers[doc.layers.length - 1])?.kind);
}

/** The pixel brush in use, or null when the tool you are on is not one of them. */
export function currentSpec(tool: string = liveBrushTool()): PixelSpec | null {
  if (tool === PIXEL_BRUSH_TOOL) return { kind: 'dab', dab: getDab() };
  if (tool === DRY_TOOL_ID) {
    const d = getDry();
    const o = d.tools[d.medium];
    return { kind: 'dry', medium: d.medium, paper: d.paper, size: o.size, hardness: o.hardness, press: o.press };
  }
  if ((SOFT_KINDS as string[]).includes(tool)) {
    const k = tool as (typeof SOFT_KINDS)[number];
    const o = getSoft().tools[k];
    return { kind: 'soft', tool: k, size: o.size, hardness: o.hardness, flow: o.flow };
  }
  return null;
}

/** Hears about any change to the settings of the pixel brush tools. */
export function subscribeSpecs(fn: () => void): () => void {
  const off = [subscribeDab(fn), subscribeSoft(fn), subscribeDry(fn)];
  return () => off.forEach((f) => f());
}

let applying = false;
const whileApplying = (fn: () => void): void => {
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
};
/** True while a saved brush is being put back (its settings go in one at a time, so the middle of it matches nothing). */
export const isApplying = (): boolean => applying;

/** Uses a saved pixel brush: its settings go back where they live, and its tool is picked. */
export function applySpec(spec: PixelSpec, pick = true): void {
  whileApplying(() => putSpec(spec));
  // The plain Brush on a pixel layer keeps its tool for a pixel brush: it draws with it. The soft and dry ones are tools of their own.
  if (pick && !(spec.kind === 'dab' && liveBrushTool() === PIXEL_BRUSH_TOOL)) pickTool(specTool(spec));
  if (spec.kind === 'dry') usePaperOf(spec.paper);
}

/** A brush saved on another paper: the sheet moves to it or stays, as the person has said (asked once, then remembered). */
function usePaperOf(saved: PaperKind | undefined): void {
  const sheet = getDry().paper;
  if (!savedPaperDiffers(sheet, saved)) return;
  withChoice<'sheet' | 'keep'>(PAPER_SAVED_CHOICE, (answer) => whileApplying(() => setPaper(sheetAfterUsing(getDry().paper, saved, answer))), { gently: { undo: () => whileApplying(() => setPaper(sheet)) } });
}

/** Puts a spec's settings back where they live, without picking its tool (the picker's size slider uses this). */
export function putSpec(spec: PixelSpec): void {
  if (spec.kind === 'dab') setWholeDab(spec.dab);
  else if (spec.kind === 'soft') setSoftTool(spec.tool, { size: spec.size, hardness: spec.hardness, flow: spec.flow });
  else {
    setMedium(spec.medium);
    setDryTool(spec.medium, { size: spec.size, hardness: spec.hardness, press: spec.press });
  }
}
