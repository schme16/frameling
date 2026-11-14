// Which timeline look is on (detailed or clean), and the row layout both sides of the timeline share.
import { useMemo } from 'react';
import type { Doc } from '../core/format';
import { store, useStore } from '../core/store';
import { collapsedFolders, timelineRows, useTimelineRows } from '../effects/rows';
import { getPrefs, setPrefs, usePrefs } from '../ui/prefs';
import { buildLayout, type Layout, type TimelineStyle } from './layout';
import { tl, useTl } from './state';
import { layerTracks } from './tracks';

export function timelineStyle(): TimelineStyle {
  return getPrefs().cleanTimeline ? 'clean' : 'detailed';
}

export function useTimelineStyle(): TimelineStyle {
  return usePrefs((p) => (p.cleanTimeline ? 'clean' : 'detailed'));
}

export function setCleanTimeline(on: boolean): void {
  setPrefs({ cleanTimeline: on });
}

/** The layout right now, outside React (for pointer maths in event handlers). */
export function currentLayout(doc: Doc = store().get().doc): Layout {
  return buildLayout(timelineRows(doc, collapsedFolders()), timelineStyle(), tl().open, (l) => layerTracks(doc, l));
}

/** React: the layout, rebuilt when the layers, folders, drawings, look or opened layers change. */
export function useLayout(): Layout {
  const rows = useTimelineRows();
  const style = useTimelineStyle();
  const open = useTl((t) => t.open);
  const drawings = useStore((s) => s.doc.drawings);
  return useMemo(() => buildLayout(rows, style, open, (l) => layerTracks({ drawings } as Doc, l)), [rows, style, open, drawings]);
}
