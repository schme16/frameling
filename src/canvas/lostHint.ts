// "Where did my drawing go?" at run time: a short while after you land on a frame that looks empty but has a
// drawing on it, a gentle note says why, with a button that fixes it. Each cause is mentioned once per document, so
// it never nags. The command runs the same check on demand.
import type { Doc, Id, VectorDrawing } from '../core/format';
import { celAt, findLayer } from '../core/doc';
import { registerCommands } from '../core/registry';
import { store, type State, type Store } from '../core/store';
import * as ops from '../timeline/ops';
import { toast } from '../ui/toast';
import { center } from './controller';
import { transformShape, translate } from './geometry';
import { findLost, lostFixLabel, lostMessage, nearestShown, type LostCause } from './lost';

/** How long the frame has to stay put before it's checked (scrubbing past empty frames says nothing). */
export const LOST_WAIT_MS = 700;

const told = new Set<string>();
let toldDoc: Id | null = null;

const keyOf = (docId: Id, c: LostCause) => `${docId}:${c.kind}:${c.layerId}`;

/** Puts the drawing back where it can be seen. One undo step. */
export function fixLost(c: LostCause, frame = store().get().ui.frame): void {
  const s = store();
  switch (c.kind) {
    case 'hidden-layer':
      void ops.setLayerVisible(c.layerId, true);
      break;
    case 'clear-layer':
      void ops.setLayerOpacity(c.layerId, 1);
      break;
    case 'masked':
      if (c.maskId) void ops.setLayerVisible(c.maskId, false);
      break;
    case 'hidden-folder':
    case 'clear-folder':
      s.update(c.kind === 'hidden-folder' ? 'Show folder' : 'Make folder solid', (d) => {
        const f = c.folderId ? d.folders?.[c.folderId] : undefined;
        if (!f) return;
        if (c.kind === 'hidden-folder') f.visible = true;
        else f.opacity = 1;
      });
      break;
    case 'clear-shapes':
    case 'off-page':
      s.update(c.kind === 'off-page' ? 'Bring drawing onto the page' : 'Make drawing solid', (d) => {
        const layer = findLayer(d as Doc, c.layerId);
        const cel = layer && celAt(layer, frame);
        const dr = cel ? (d.drawings[cel.drawingId] as VectorDrawing | undefined) : undefined;
        if (dr?.kind !== 'vector') return;
        if (c.kind === 'clear-shapes') {
          const ids = new Set(c.shapeIds);
          for (const sh of dr.shapes) if (ids.has(sh.id) && 'opacity' in sh) sh.opacity = 1;
          return;
        }
        const b = c.bounds!;
        const m = translate(Math.round(d.width / 2 - (b.x + b.w / 2)), Math.round(d.height / 2 - (b.y + b.h / 2)));
        dr.shapes = dr.shapes.map((sh) => transformShape(JSON.parse(JSON.stringify(sh)), m));
      });
      center();
      break;
  }
  s.setUi({ activeLayerId: c.layerId });
}

function tell(c: LostCause, frame: number): void {
  toast(lostMessage(c), { action: { label: lostFixLabel(c), run: () => fixLost(c, frame) }, duration: 9000 });
}

/**
 * Checks the frame and says what's hiding the drawing. `onlyNew` skips causes already mentioned for this document.
 * Returns the cause it told you about, if any.
 */
export function checkLost(onlyNew: boolean, s: Store = store()): LostCause | undefined {
  const { doc, ui } = s.get();
  const docId = doc.id;
  if (toldDoc !== docId) {
    told.clear();
    toldDoc = docId;
  }
  const causes = findLost(doc, ui.frame);
  if (!causes?.length) return undefined;
  const c = onlyNew ? causes.find((x) => !told.has(keyOf(docId, x))) : causes[0];
  if (!c) return undefined;
  for (const x of causes) told.add(keyOf(docId, x));
  tell(c, ui.frame);
  return c;
}

/** The command: says why, or where the nearest drawing is when this frame really is empty. */
export function whereDidItGo(): void {
  const { doc, ui } = store().get();
  const causes = findLost(doc, ui.frame);
  if (causes === null) return void toast('Your drawing is showing on this frame. Lost the page? Press Ctrl+0 to fit it in the window.');
  if (causes.length) return void tell(causes[0], ui.frame);
  const near = nearestShown(doc, ui.frame);
  if (near === null) return void toast('Nothing is drawn yet, on any frame.');
  toast(`Nothing is drawn on this frame. The nearest drawing is on frame ${near + 1}.`, { action: { label: 'Go there', run: () => store().setUi({ frame: near, playing: false }) } });
}

/** Watches for landing on a frame that looks empty. Returns a function that stops watching. */
export function installLostHint(s: Store = store(), wait = LOST_WAIT_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: State = s.get();
  const off = s.subscribe(() => {
    const now = s.get();
    const p = last;
    last = now;
    if (now.ui.playing) return void clearTimeout(timer);
    // Landing on a frame or opening a document. Hiding a layer yourself is on purpose, so doc edits don't count.
    const landed = now.ui.frame !== p.ui.frame || now.doc.id !== p.doc.id || (p.ui.playing && !now.ui.playing);
    if (!landed) return;
    clearTimeout(timer);
    timer = setTimeout(() => void checkLost(true, s), wait);
  });
  return () => {
    off();
    clearTimeout(timer);
  };
}

registerCommands([
  {
    id: 'view.whereDidItGo',
    label: 'Where did my drawing go?',
    category: 'View',
    description: 'Finds a drawing you can\'t see on this frame (a hidden layer, see-through, masked or off the page) and offers to bring it back.',
    keywords: ['lost', 'missing', 'disappeared', 'vanished', 'gone', 'invisible', 'hidden', 'cannot see', 'find drawing', 'off canvas'],
    help: 'where-did-it-go',
    run: whereDidItGo,
  },
]);
