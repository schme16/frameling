// Commands that work on the selected shapes: select all, delete, duplicate, copy and paste, flip, arrange, nudge.
import type { Id, Shape, VectorDrawing } from '../core/format';
import { registerCommands, type Command } from '../core/registry';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { bringForward, bringToFront, sendBackward, sendToBack } from '../canvas/arrange';
import { flipMatrix, shapesBounds, transformShape, translate, type Matrix } from '../canvas/geometry';
import { activeDrawing, activeLayer, editActiveDrawing, EDIT_HINTS } from './edit';
import { clipboardHasShapes, copyToClipboard, duplicateShapes, notePasted, pasteFromClipboard } from './clipboard';

function vectorDrawing(): VectorDrawing | undefined {
  const d = activeDrawing();
  return d && d.kind === 'vector' ? d : undefined;
}

/** The selected shapes of the active drawing, back to front. */
export function selectedShapes(): Shape[] {
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

function transformSelected(label: string, m: (shapes: Shape[]) => Matrix, opts: { coalesce?: string } = {}): void {
  const sel = selectedShapes();
  if (!sel.length) return;
  const matrix = m(sel);
  const repl = new Map(sel.map((s) => [s.id, transformShape(s, matrix)]));
  change(label, (d) => void (d.shapes = d.shapes.map((x) => repl.get(x.id) ?? x)), opts);
}

function deleteSelected(label: string): void {
  const ids = new Set(selectedShapes().map((s) => s.id));
  if (!ids.size) return;
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
      if (copies.length && change('Duplicate', (d) => void d.shapes.push(...copies))) setSelection(copies.map((c) => c.id));
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
      const copies = pasteFromClipboard(vectorDrawing()?.id ?? null);
      if (copies.length && change('Paste', (d) => void d.shapes.push(...copies))) {
        notePasted(vectorDrawing()?.id);
        setSelection(copies.map((c) => c.id));
      }
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
    run: () => transformSelected('Flip horizontal', (sel) => flipMatrix(shapesBounds(sel)!, 'h')),
  },
  {
    id: 'select.flipV',
    label: 'Flip vertical',
    category: 'Edit',
    description: 'Mirror the selection top to bottom.',
    help: 'flip',
    keywords: ['mirror'],
    enabled: hasSelection,
    run: () => transformSelected('Flip vertical', (sel) => flipMatrix(shapesBounds(sel)!, 'v')),
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
