// Which plugin shape is picked, for the Properties section (PluginShapePanel.tsx). Pure.
import { celAt, findLayer } from '../core/doc';
import type { State } from '../core/store';
import { extKeyOf, infoOf } from './shapes';

export interface PickedPluginShape {
  pluginId: string;
  kind: string;
  inst: string;
  /** The settings it was drawn from (none for one a plugin placed without any). */
  props: Record<string, unknown>;
  drawingId: string;
  /** The plugin drew nothing, so a stand-in box shows. */
  placeholder: boolean;
}

/** The one plugin shape that the selection is (all of its parts, or some of them). Null for none, or for parts of several. */
export function pickedPluginShape(s: State): PickedPluginShape | null {
  if (!s.ui.selection.length) return null;
  const layer = findLayer(s.doc, s.ui.activeLayerId);
  const cel = layer ? celAt(layer, s.ui.frame) : undefined;
  const d = cel ? s.doc.drawings[cel.drawingId] : undefined;
  if (d?.kind !== 'vector') return null;
  const sel = new Set(s.ui.selection);
  let found: { pluginId: string; kind: string; inst: string } | null = null;
  for (const sh of d.shapes) {
    if (!sh.ext || !sel.has(sh.id)) continue;
    for (const key of Object.keys(sh.ext)) {
      if (!key.startsWith('plugin.')) continue;
      const pluginId = key.slice('plugin.'.length);
      const info = infoOf(sh, pluginId);
      if (!info || extKeyOf(pluginId) !== key) continue;
      if (found && (found.pluginId !== pluginId || found.inst !== info.inst)) return null;
      found = { pluginId, kind: info.kind, inst: info.inst };
    }
  }
  if (!found) return null;
  // The settings live on the first part, which may not be in the selection.
  let props: Record<string, unknown> = {};
  let placeholder = false;
  for (const sh of d.shapes) {
    const info = infoOf(sh, found.pluginId);
    if (info?.inst !== found.inst) continue;
    if (info.part === 0 && info.props && typeof info.props === 'object') props = info.props;
    if (info.placeholder) placeholder = true;
  }
  return { ...found, props, drawingId: d.id, placeholder };
}
