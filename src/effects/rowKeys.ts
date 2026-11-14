// Keys for the rows of the layer list (a tree: folders hold layers and folders). Plain arrows walk the rows;
// Alt with the arrows moves the layer or folder: up and down through the list, left out of its folder, right into the
// folder next to it.
import type { KeyboardEvent } from 'react';
import type { Node } from './edit';
import * as ops from './ops';
import { toggleFolderCollapsed } from './rows';

const rowsOf = (from: HTMLElement): HTMLElement[] => Array.from(from.closest('[role=tree]')?.querySelectorAll<HTMLElement>('[role=treeitem][data-row]') ?? []);
const levelOf = (el: HTMLElement) => Number(el.getAttribute('aria-level') ?? 1);

/** Puts the keyboard focus back on a row after the list changed under it. */
export function refocusRow(selector: string): void {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
}

/**
 * Handles a key pressed on a row itself. `node` is what the row is (a layer or a folder), `selector` finds it again
 * after a move, and `folder` is set on folder rows (for folding). Returns true when it did something.
 */
export function rowKey(e: KeyboardEvent<HTMLElement>, node: Node, selector: string, folder?: { id: string; collapsed: boolean }): boolean {
  if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey) return false;
  const done = () => {
    e.preventDefault();
    e.stopPropagation();
    return true;
  };
  if (e.altKey) {
    const key = e.key;
    if (key === 'ArrowUp' || key === 'ArrowDown') ops.stepNode(node, key === 'ArrowUp' ? 'up' : 'down');
    else if (key === 'ArrowLeft') ops.outdentNode(node);
    else if (key === 'ArrowRight') ops.nestNode(node);
    else return false;
    refocusRow(selector);
    return done();
  }
  if (e.shiftKey) return false;
  const rows = rowsOf(e.currentTarget);
  const at = rows.indexOf(e.currentTarget);
  switch (e.key) {
    case 'ArrowDown':
      rows[at + 1]?.focus();
      return done();
    case 'ArrowUp':
      rows[at - 1]?.focus();
      return done();
    case 'Home':
      rows[0]?.focus();
      return done();
    case 'End':
      rows[rows.length - 1]?.focus();
      return done();
    case 'ArrowRight':
      if (folder?.collapsed) toggleFolderCollapsed(folder.id, false);
      else if (folder) rows[at + 1]?.focus();
      else return false;
      return done();
    case 'ArrowLeft': {
      if (folder && !folder.collapsed) {
        toggleFolderCollapsed(folder.id, true);
        return done();
      }
      // On a row in a folder, go to the folder's own row.
      const level = levelOf(e.currentTarget);
      for (let i = at - 1; i >= 0; i--) {
        if (levelOf(rows[i]) < level) {
          rows[i].focus();
          return done();
        }
      }
      return false;
    }
  }
  return false;
}
