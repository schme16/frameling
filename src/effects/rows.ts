/**
 * The timeline's rows, top first: a header row for each folder, then what is in it (unless the folder is folded shut),
 * and every other layer. The layer list and the frame grid both lay out from this, so they always line up.
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { Doc, Id, Layer, LayerFolder } from '../core/format';
import { layerTree, nodeLayers, type TreeNode } from '../core/folders';
import { useStore } from '../core/store';

/** `depth` is how many folders it sits in (0 on the stage), for the indent. */
export type TimelineRow =
  | { type: 'layer'; layer: Layer; inFolder: boolean; depth: number }
  | { type: 'folder'; folder: LayerFolder; layerIds: Id[]; collapsed: boolean; depth: number; parent?: Id };

/** Builds the rows. Pure. Folders inside folders follow their parent; a folded folder hides everything in it. */
export function timelineRows(doc: Doc, collapsed: ReadonlySet<Id>): TimelineRow[] {
  const out: TimelineRow[] = [];
  const walk = (nodes: TreeNode[]) => {
    // The tree is bottom first; the timeline is top first.
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.type === 'layer') {
        out.push({ type: 'layer', layer: n.layer, inFolder: n.depth > 0, depth: n.depth });
        continue;
      }
      const shut = collapsed.has(n.folder.id);
      out.push({ type: 'folder', folder: n.folder, layerIds: nodeLayers(n).reverse().map((x) => x.id), collapsed: shut, depth: n.depth, parent: n.folder.parent });
      if (!shut) walk(n.children);
    }
  };
  walk(layerTree(doc));
  return out;
}

/** The row a layer shows on: its own, or its folder's header when the folder is shut. -1 when it's not there. */
export function rowOfLayer(rows: TimelineRow[], layerId: Id | null | undefined): number {
  if (!layerId) return -1;
  const own = rows.findIndex((r) => r.type === 'layer' && r.layer.id === layerId);
  if (own >= 0) return own;
  return rows.findIndex((r) => r.type === 'folder' && r.layerIds.includes(layerId));
}

// ---------------------------------------------------------------- which folders are shut (this session only)

let shut: ReadonlySet<Id> = new Set();
const listeners = new Set<() => void>();

export function collapsedFolders(): ReadonlySet<Id> {
  return shut;
}

export function toggleFolderCollapsed(id: Id, to?: boolean): void {
  const next = new Set(shut);
  if (to ?? !next.has(id)) next.add(id);
  else next.delete(id);
  shut = next;
  listeners.forEach((f) => f());
}

function useCollapsed(): ReadonlySet<Id> {
  return useSyncExternalStore(
    (f) => (listeners.add(f), () => listeners.delete(f)),
    () => shut,
  );
}

/** React: the timeline rows, top first. */
export function useTimelineRows(): TimelineRow[] {
  const layers = useStore((s) => s.doc.layers);
  const folders = useStore((s) => s.doc.folders);
  const c = useCollapsed();
  return useMemo(() => timelineRows({ layers, folders } as Doc, c), [layers, folders, c]);
}
