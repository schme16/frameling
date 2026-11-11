/**
 * The timeline's rows, top first: a header row for each folder, then its layers (unless the folder is folded shut),
 * and every other layer. The layer list and the frame grid both lay out from this, so they always line up.
 */
import { useMemo, useSyncExternalStore } from 'react';
import type { Doc, Id, Layer, LayerFolder } from '../core/format';
import { useStore } from '../core/store';

export type TimelineRow = { type: 'layer'; layer: Layer; inFolder: boolean } | { type: 'folder'; folder: LayerFolder; layerIds: Id[]; collapsed: boolean };

/** Builds the rows. Pure. */
export function timelineRows(doc: Doc, collapsed: ReadonlySet<Id>): TimelineRow[] {
  const out: TimelineRow[] = [];
  const ls = doc.layers;
  let i = ls.length - 1;
  while (i >= 0) {
    const l = ls[i];
    const folder = l.folder ? doc.folders?.[l.folder] : undefined;
    if (!folder) {
      out.push({ type: 'layer', layer: l, inFolder: false });
      i--;
      continue;
    }
    let j = i;
    while (j >= 0 && ls[j].folder === l.folder) j--;
    const run = ls.slice(j + 1, i + 1).reverse();
    const shut = collapsed.has(folder.id);
    out.push({ type: 'folder', folder, layerIds: run.map((x) => x.id), collapsed: shut });
    if (!shut) for (const x of run) out.push({ type: 'layer', layer: x, inFolder: true });
    i = j;
  }
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
