/**
 * Where each row of the timeline sits, top to bottom. The clean timeline has one even height for everything. The
 * detailed one has slimmer layer rows, and property rows under a layer when it is opened up. The layer list and the
 * frame grid both lay out from this, so they always line up.
 */
import type { Id, Layer } from '../core/format';
import type { TimelineRow } from '../effects/rows';
import type { Track } from './tracks';

export type TimelineStyle = 'detailed' | 'clean';

export const CLEAN_ROW_H = 36;
export const DETAIL_ROW_H = 28;
export const PROP_ROW_H = 22;

export type LayoutRow =
  | { kind: 'folder'; key: string; y: number; h: number; row: Extract<TimelineRow, { type: 'folder' }> }
  | { kind: 'layer'; key: string; y: number; h: number; layer: Layer; inFolder: boolean; tracks: Track[]; open: boolean }
  | { kind: 'prop'; key: string; y: number; h: number; layer: Layer; track: Track; last: boolean };

export interface Layout {
  rows: LayoutRow[];
  height: number;
  style: TimelineStyle;
}

export function buildLayout(rows: TimelineRow[], style: TimelineStyle, open: ReadonlySet<Id>, tracksOf: (layer: Layer) => Track[]): Layout {
  const out: LayoutRow[] = [];
  const rowH = style === 'clean' ? CLEAN_ROW_H : DETAIL_ROW_H;
  let y = 0;
  for (const r of rows) {
    if (r.type === 'folder') {
      out.push({ kind: 'folder', key: `f-${r.folder.id}-${r.layerIds[0]}`, y, h: rowH, row: r });
      y += rowH;
      continue;
    }
    const tracks = style === 'clean' ? [] : tracksOf(r.layer);
    const isOpen = tracks.length > 0 && open.has(r.layer.id);
    out.push({ kind: 'layer', key: r.layer.id, y, h: rowH, layer: r.layer, inFolder: r.inFolder, tracks, open: isOpen });
    y += rowH;
    if (isOpen)
      tracks.forEach((t, i) => {
        out.push({ kind: 'prop', key: `${r.layer.id}/${t.id}`, y, h: PROP_ROW_H, layer: r.layer, track: t, last: i === tracks.length - 1 });
        y += PROP_ROW_H;
      });
  }
  return { rows: out, height: y, style };
}

/** The row under a y position (0 is the top of the rows), clamped to the first and last. */
export function rowAtY(layout: Layout, y: number): LayoutRow | undefined {
  const rs = layout.rows;
  if (!rs.length) return undefined;
  let lo = 0;
  let hi = rs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rs[mid].y <= y) lo = mid;
    else hi = mid - 1;
  }
  return rs[lo];
}

/** The row a layer shows on: its own, or its folder's header when the folder is shut. */
export function rowOfLayerIn(layout: Layout, layerId: Id | null | undefined): LayoutRow | undefined {
  if (!layerId) return undefined;
  return layout.rows.find((r) => r.kind === 'layer' && r.layer.id === layerId) ?? layout.rows.find((r) => r.kind === 'folder' && r.row.layerIds.includes(layerId));
}
