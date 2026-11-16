// What of the sharer's drawing a reviewer is sent. A whitelist: every field of the document is named below and has to be
// answered, so a field added to the format later does not reach a reviewer until somebody decides it should (the type
// below fails to compile until then). The reviewer gets what the picture window paints and nothing more: no notes or marks
// of the sharer's own, no sound, no reference pictures, no export settings, no plugin data, no history.
//
// Pure, and the drawing passed in is never changed. The patch filter is the same list applied to a change.
import type { Patch } from 'immer';
import type { Doc } from '../core/format';
import type { Look, ToPopout } from '../popout/protocol';

type Answer = 'send' | 'withhold';

/** Every field of a document, and whether a reviewer gets it. The compiler checks this lists them all. */
export const REVIEWER_FIELDS: Record<keyof Doc, Answer> = {
  format: 'send',
  version: 'send',
  id: 'send',
  name: 'send',
  lineage: 'send',
  width: 'send',
  height: 'send',
  fps: 'send',
  dpi: 'send',
  length: 'send',
  animated: 'send',
  background: 'send',
  layers: 'send',
  drawings: 'send',
  clips: 'send',
  tileset: 'send',
  palette: 'send',
  folders: 'send',
  symbols: 'send',
  editing: 'send',
  inOut: 'send',
  artboards: 'send',
  activeArtboard: 'send',
  sharedLayers: 'send',
  // The painter does not read these, and most are the sharer's own.
  markers: 'withhold',
  swatches: 'withhold',
  flow: 'withhold',
  audio: 'withhold',
  pictures: 'withhold',
  guides: 'withhold',
  notes: 'withhold',
  marks: 'withhold',
  perspective: 'withhold',
  sprite: 'withhold',
  ext: 'withhold',
  exports: 'withhold',
  history: 'withhold',
};

const SENT = new Set(Object.entries(REVIEWER_FIELDS).filter(([, a]) => a === 'send').map(([k]) => k));

/** The drawing as a reviewer gets it. The same object comes back when there is nothing to take out. */
export function forReviewer(doc: Doc): Doc {
  const out: Record<string, unknown> = {};
  let dropped = false;
  for (const k of Object.keys(doc)) {
    if (SENT.has(k)) out[k] = (doc as unknown as Record<string, unknown>)[k];
    else dropped = true;
  }
  return dropped ? (out as unknown as Doc) : doc;
}

/** The patches of a change that a reviewer may have. A patch on a withheld field (or one that replaces the whole document) is left out. */
export function reviewerPatches(patches: readonly Patch[]): Patch[] | 'whole' {
  const out: Patch[] = [];
  for (const p of patches) {
    if (p.path.length === 0) return 'whole';
    if (SENT.has(String(p.path[0]))) out.push(p);
  }
  return out;
}

/** The look a reviewer is sent: the sharer's own marks, active layer and capture settings are not theirs to see. */
export function reviewerLook(look: Look): Look {
  const { capture: _capture, ...rest } = look;
  return { ...rest, activeLayerId: null, marks: false };
}

/**
 * The messages for one review, made from the ones the picture window would get. Patches that only touch withheld fields
 * disappear, so the numbering that the reviewer's copy checks is made again here and stays one after another.
 */
export class ReviewOut {
  private seq = 0;
  /** True after a message that cannot be made into a clean step: ask the mirror for the whole drawing. */
  wantsWhole = false;

  map(m: ToPopout): ToPopout | null {
    switch (m.t) {
      case 'doc':
        this.seq = m.seq;
        return { t: 'doc', seq: m.seq, doc: forReviewer(m.doc) };
      case 'patch': {
        const p = reviewerPatches(m.patches);
        if (p === 'whole') {
          this.wantsWhole = true;
          return null;
        }
        if (p.length === 0) return null;
        return { t: 'patch', seq: ++this.seq, patches: p };
      }
      case 'look':
        return { t: 'look', look: reviewerLook(m.look) };
      default:
        return m;
    }
  }
}
