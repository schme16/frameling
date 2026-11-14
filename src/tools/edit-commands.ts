// Commands that work on the selected shapes: select all, delete, duplicate, copy and paste, flip, arrange, nudge.
import type { Id, Shape, VectorDrawing } from '../core/format';
import { registerCommands, type Command } from '../core/registry';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { bringForward, bringToFront, sendBackward, sendToBack } from '../canvas/arrange';
import { flipMatrix, transformShape, translate, type Matrix } from '../canvas/geometry';
import { activeDrawing, activeLayer, addingStartsNewDrawing, editActiveDrawing, EDIT_HINTS } from './edit';
import { clipboardHasShapes, copyToClipboard, duplicateShapes, notePasted, pasteFromClipboard } from './clipboard';
import { activeIsMerge, addShapes, cutBase, editShapes, pendingCut, setCut } from './merge-mode';
import { placeMoved } from '../geometry/merge';
import { clearParts, currentParts, pickedBounds, removePoints, transformPicked, type PartMap } from '../select/scope';

function vectorDrawing(): VectorDrawing | undefined {
  const d = activeDrawing();
  return d && d.kind === 'vector' ? d : undefined;
}

/** The selected shapes of the active drawing, back to front. */
export function selectedShapes(): Shape[] {
  // Part of a merged shape picked with a box: the part is what's selected.
  const c = pendingCut();
  if (c) return c.lifted;
  const d = vectorDrawing();
  if (!d) return [];
  const ids = new Set(store().get().ui.selection);
  return d.shapes.filter((s) => ids.has(s.id));
}

const hasSelection = (): boolean => selectedShapes().length > 0;

function setSelection(ids: Id[]): void {
  store().setUi({ selection: ids });
}

function say(msg: string): void {
  toast(msg);
}

/** Runs a change on the active vector drawing and tells the person if it couldn't. */
function change(label: string, recipe: (d: VectorDrawing) => void, opts: { coalesce?: string } = {}): boolean {
  const r = editActiveDrawing(label, 'vector', (d) => recipe(d as unknown as VectorDrawing), opts);
  if (r !== 'ok') {
    say(EDIT_HINTS[r]);
    return false;
  }
  return true;
}

/** `m` gets the picked points too: when only part of a shape is picked, a nudge or a flip takes just those points. */
function transformSelected(label: string, m: (shapes: Shape[], parts: PartMap) => Matrix, opts: { coalesce?: string } = {}): void {
  const sel = selectedShapes();
  if (!sel.length) return;
  const parts: PartMap = pendingCut() ? new Map() : currentParts();
  const matrix = m(sel, parts);
  if (activeIsMerge()) {
    let ids: Id[] = [];
    const r = editShapes(
      label,
      (before) => {
        const p = placeMoved(cutBase(before), transformShapesOf(sel, matrix));
        ids = p.added;
        return p.shapes;
      },
      opts,
    );
    setCut(null);
    if (r === 'ok') setSelection(ids);
    else if (r !== 'nothing') say(EDIT_HINTS[r]);
    return;
  }
  const repl = new Map(sel.map((s) => [s.id, transformPicked(s, matrix, parts)]));
  change(label, (d) => void (d.shapes = d.shapes.map((x) => repl.get(x.id) ?? x)), opts);
}

const transformShapesOf = (shapes: Shape[], m: Matrix): Shape[] => shapes.map((s) => transformShape(s, m));

function deleteSelected(label: string): void {
  const ids = new Set(selectedShapes().map((s) => s.id));
  if (!ids.size) return;
  if (pendingCut()) {
    // Only the picked part goes; the rest of the shape stays, with a hole where the part was.
    const r = editShapes(label, (before) => cutBase(before).filter((s) => !ids.has(s.id)));
    setCut(null);
    if (r === 'ok') setSelection([]);
    else if (r !== 'nothing') say(EDIT_HINTS[r]);
    return;
  }
  const parts = currentParts();
  if (parts.size) {
    // Just the bit you picked goes: those points, and any shape picked whole. A shape left with too little to draw goes too.
    const sel = selectedShapes();
    // Worked out on the plain shapes (not the drafts the change is made on).
    const after = new Map<Id, Shape | null>(sel.map((s) => [s.id, parts.has(s.id) ? removePoints(s, parts.get(s.id)!) : null]));
    const ok = change(label, (d) => void (d.shapes = d.shapes.flatMap((x) => (after.has(x.id) ? (after.get(x.id) ? [after.get(x.id)!] : []) : [x])) as never));
    if (ok) {
      clearParts();
      setSelection(sel.filter((s) => after.get(s.id)).map((s) => s.id));
    }
    return;
  }
  if (change(label, (d) => void (d.shapes = d.shapes.filter((s) => !ids.has(s.id))))) setSelection([]);
}

function reorder(label: string, fn: typeof bringForward): void {
  const ids = new Set(selectedShapes().map((s) => s.id));
  if (!ids.size) return;
  change(label, (d) => void (d.shapes = fn(d.shapes as Shape[], ids)));
}

function nudgeCommand(id: string, label: string, dx: number, dy: number, key: string, big: boolean): Command {
  const amount = big ? 10 : 1;
  return {
    id,
    label,
    category: 'Edit',
    keys: [key],
    description: big ? `Move the selection ${amount} pixels.` : 'Move the selection by one pixel.',
    help: 'selecting',
    enabled: hasSelection,
    run: () => transformSelected('Nudge', () => translate(dx * amount, dy * amount), { coalesce: 'nudge' }),
  };
}

const canPaste = (): boolean => clipboardHasShapes() && activeLayer().layer?.kind === 'vector';

registerCommands([
  {
    id: 'select.all',
    label: 'Select all',
    category: 'Edit',
    keys: ['Mod+A'],
    description: 'Select everything on this frame of the active layer.',
    help: 'selecting',
    enabled: () => !!vectorDrawing()?.shapes.length,
    run: () => setSelection(vectorDrawing()?.shapes.map((s) => s.id) ?? []),
  },
  {
    id: 'select.none',
    label: 'Deselect',
    category: 'Edit',
    keys: ['Escape'],
    description: 'Let go of the selection.',
    help: 'selecting',
    enabled: (s) => s.ui.selection.length > 0,
    run: () => setSelection([]),
  },
  {
    id: 'edit.delete',
    label: 'Delete',
    category: 'Edit',
    keys: ['Delete', 'Backspace'],
    description: 'Remove the selected shapes.',
    help: 'duplicate-delete',
    enabled: hasSelection,
    run: () => deleteSelected('Delete'),
  },
  {
    id: 'edit.duplicate',
    label: 'Duplicate',
    category: 'Edit',
    keys: ['Mod+D'],
    description: 'Make a copy of the selection, just beside it.',
    help: 'duplicate-delete',
    enabled: hasSelection,
    run: () => {
      const copies = duplicateShapes(selectedShapes());
      if (!copies.length) return;
      // On a merge layer the copies merge where they land.
      const { result, ids } = addShapes('Duplicate', copies);
      if (result === 'ok') setSelection(ids);
      else if (result !== 'nothing') say(EDIT_HINTS[result]);
    },
  },
  {
    id: 'edit.copy',
    label: 'Copy',
    category: 'Edit',
    keys: ['Mod+C'],
    description: 'Copy the selected shapes.',
    help: 'copy-paste',
    enabled: hasSelection,
    run: () => copyToClipboard(selectedShapes(), vectorDrawing()?.id ?? null),
  },
  {
    id: 'edit.cut',
    label: 'Cut',
    category: 'Edit',
    keys: ['Mod+X'],
    description: 'Copy the selected shapes and take them off the canvas.',
    help: 'copy-paste',
    enabled: hasSelection,
    run: () => {
      copyToClipboard(selectedShapes(), vectorDrawing()?.id ?? null);
      deleteSelected('Cut');
    },
  },
  {
    id: 'edit.paste',
    label: 'Paste',
    category: 'Edit',
    keys: ['Mod+V'],
    description: 'Paste what you copied onto this frame.',
    help: 'copy-paste',
    enabled: canPaste,
    run: () => {
      const { layer } = activeLayer();
      if (layer && layer.kind !== 'vector') return say('Pasting shapes needs a vector layer. Pick one in the timeline first.');
      // Onto a frame that's only carrying the last drawing along, the paste starts a new drawing, so it lands in place.
      const copies = pasteFromClipboard(addingStartsNewDrawing() ? null : (vectorDrawing()?.id ?? null));
      if (!copies.length) return;
      const { result, ids } = addShapes('Paste', copies);
      if (result === 'ok') {
        notePasted(vectorDrawing()?.id);
        setSelection(ids);
      } else if (result !== 'nothing') say(EDIT_HINTS[result]);
    },
  },
  {
    id: 'select.flipH',
    label: 'Flip horizontal',
    category: 'Edit',
    description: 'Mirror the selection left to right.',
    help: 'flip',
    keywords: ['mirror'],
    enabled: hasSelection,
    run: () => transformSelected('Flip horizontal', (sel, parts) => flipMatrix(pickedBounds(sel, parts)!, 'h')),
  },
  {
    id: 'select.flipV',
    label: 'Flip vertical',
    category: 'Edit',
    description: 'Mirror the selection top to bottom.',
    help: 'flip',
    keywords: ['mirror'],
    enabled: hasSelection,
    run: () => transformSelected('Flip vertical', (sel, parts) => flipMatrix(pickedBounds(sel, parts)!, 'v')),
  },
  {
    id: 'arrange.forward',
    label: 'Bring forward',
    category: 'Arrange',
    keys: ['Mod+]'],
    description: 'Move the selection one step in front.',
    help: 'arrange',
    enabled: hasSelection,
    run: () => reorder('Bring forward', bringForward),
  },
  {
    id: 'arrange.backward',
    label: 'Send back',
    category: 'Arrange',
    keys: ['Mod+['],
    description: 'Move the selection one step behind.',
    help: 'arrange',
    enabled: hasSelection,
    run: () => reorder('Send back', sendBackward),
  },
  {
    id: 'arrange.front',
    label: 'Bring to front',
    category: 'Arrange',
    keys: ['Mod+Shift+]'],
    description: 'Move the selection in front of everything else.',
    help: 'arrange',
    enabled: hasSelection,
    run: () => reorder('Bring to front', bringToFront),
  },
  {
    id: 'arrange.back',
    label: 'Send to back',
    category: 'Arrange',
    keys: ['Mod+Shift+['],
    description: 'Move the selection behind everything else.',
    help: 'arrange',
    enabled: hasSelection,
    run: () => reorder('Send to back', sendToBack),
  },
  nudgeCommand('select.nudgeLeft', 'Nudge left', -1, 0, 'ArrowLeft', false),
  nudgeCommand('select.nudgeRight', 'Nudge right', 1, 0, 'ArrowRight', false),
  nudgeCommand('select.nudgeUp', 'Nudge up', 0, -1, 'ArrowUp', false),
  nudgeCommand('select.nudgeDown', 'Nudge down', 0, 1, 'ArrowDown', false),
  nudgeCommand('select.nudgeLeftMore', 'Nudge left by 10', -1, 0, 'Shift+ArrowLeft', true),
  nudgeCommand('select.nudgeRightMore', 'Nudge right by 10', 1, 0, 'Shift+ArrowRight', true),
  nudgeCommand('select.nudgeUpMore', 'Nudge up by 10', 0, -1, 'Shift+ArrowUp', true),
  nudgeCommand('select.nudgeDownMore', 'Nudge down by 10', 0, 1, 'Shift+ArrowDown', true),
]);
