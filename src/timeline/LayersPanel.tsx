/**
 * Layers as a panel of its own, in the right rail above Artboards. It shows the same list the timeline keeps down
 * its left side, with room to breathe on a drawing with a lot of layers. Both read the same document and the same
 * folders, so picking, renaming, reordering, hiding and locking in one shows in the other straight away.
 *
 * The timeline's list has to line each row up with its keys, so its rows take the timeline's heights (and its
 * property rows). This one is always the clean, even-height list: just the layers and their folders.
 */
import { useMemo } from 'react';
import type { Id } from '../core/format';
import { useTimelineRows } from '../effects/rows';
import { buildLayout } from './layout';
import { LayerList, LayerTools } from './Layers';

/** No layer is opened up here: property rows belong to the timeline, where the keys are. */
const NONE: ReadonlySet<Id> = new Set<Id>();
const NO_TRACKS = () => [];

export function LayersPanel() {
  const rows = useTimelineRows();
  const layout = useMemo(() => buildLayout(rows, 'clean', NONE, NO_TRACKS), [rows]);
  return (
    <div className="lp-panel">
      <LayerTools inPanel />
      <div className="lp-list">
        <LayerList layout={layout} />
      </div>
    </div>
  );
}
