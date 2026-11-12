// The light table: pin a frame (or one layer's drawing on it) and it shows faintly on every frame, to trace over.
// The onion skin follows you around; the light table stays put. The empty frame ghost is automatic and only shows
// on empty frames; this is chosen and always shows (until it's turned off).
import type { Doc, Id } from '../core/format';
import { findLayer } from '../core/doc';
import { registerCommands } from '../core/registry';
import { store, type UiState } from '../core/store';
import { poseAt } from '../core/symbols';
import { toast } from '../ui/toast';
import type { GhostItem } from './ghost';

export type LightTable = NonNullable<UiState['lightTable']>;

export const LIGHT_TABLE_OPACITY = 0.3;

// The look under consideration (brand/ab/light-table): its own colours (the default) or a soft blue, like
// non-photo blue pencil. Debug only for now.
let tint: string | null = null;
export const lightTableTint = (): string | null => tint;
export function setLightTableTint(c: string | null): void {
  tint = c;
  store().setUi((ui) => (ui.lightTable ? { lightTable: { ...ui.lightTable } } : {}));
}

/** What the light table shows on `frame`: the pinned drawings, minus any that are the drawing already showing there. */
export function lightTableItems(doc: Doc, lt: LightTable | null | undefined, frame: number): GhostItem[] {
  if (!lt || lt.frame < 0 || lt.frame >= doc.length) return [];
  const out: GhostItem[] = [];
  for (const layer of doc.layers) {
    if (lt.layerId ? layer.id !== lt.layerId : !layer.visible) continue;
    if (layer.kind !== 'vector' && layer.kind !== 'pixel') continue;
    if (layer.kind === 'vector' && layer.rig) continue;
    const d = poseAt(doc, layer, lt.frame);
    if (!d || d.kind === 'tilemap' || d.kind === 'camera') continue;
    // On the pinned frame itself (or while the same drawing is held) it would just double up.
    if (d === poseAt(doc, layer, frame)) continue;
    out.push({ drawing: d, pixelSize: layer.kind === 'pixel' ? layer.pixelSize : 1, layerId: layer.id });
  }
  return out;
}

/** Pins a frame, or one layer's drawing on it. Pinning the same thing again takes it off. */
export function pinLightTable(frame: number, layerId?: Id): void {
  store().setUi((ui) => {
    const cur = ui.lightTable;
    if (cur && cur.frame === frame && cur.layerId === layerId) return { lightTable: null };
    return { lightTable: { frame, ...(layerId ? { layerId } : {}), opacity: cur?.opacity ?? LIGHT_TABLE_OPACITY } };
  });
}

export function clearLightTable(): void {
  store().setUi({ lightTable: null });
}

/** A few words for what's on the light table, for the chip and menus. */
export function lightTableLabel(doc: Doc, lt: LightTable): string {
  const layer = lt.layerId ? findLayer(doc, lt.layerId) : undefined;
  return layer ? `${layer.name}, frame ${lt.frame + 1}` : `Frame ${lt.frame + 1}`;
}

registerCommands([
  {
    id: 'view.lightTable',
    label: 'Put this frame on the light table',
    category: 'View',
    description: 'Show this whole frame faintly on every frame, to trace over. It stays put while you move around, unlike the onion skin. Run it again to take it off.',
    help: 'light-table',
    keywords: ['light table', 'lightbox', 'trace', 'tracing', 'reference', 'pin frame', 'see through'],
    checked: (s) => !!s.ui.lightTable,
    run: () => {
      const { ui } = store().get();
      if (ui.lightTable) return clearLightTable();
      pinLightTable(ui.frame);
      toast(`Frame ${ui.frame + 1} is on the light table. Go to another frame and trace over it.`);
    },
  },
  {
    id: 'view.lightTableDrawing',
    label: "Put this layer's drawing on the light table",
    category: 'View',
    description: 'Show just the active layer\'s drawing on this frame faintly on every frame, to trace over.',
    help: 'light-table',
    keywords: ['light table', 'lightbox', 'trace', 'one layer', 'reference'],
    enabled: (s) => !!s.ui.activeLayerId,
    run: () => {
      const { ui } = store().get();
      if (!ui.activeLayerId) return;
      pinLightTable(ui.frame, ui.activeLayerId);
    },
  },
  {
    id: 'view.clearLightTable',
    label: 'Clear the light table',
    category: 'View',
    description: 'Take the pinned frame or drawing off the light table.',
    help: 'light-table',
    keywords: ['light table', 'lightbox', 'unpin'],
    enabled: (s) => !!s.ui.lightTable,
    run: () => clearLightTable(),
  },
]);
