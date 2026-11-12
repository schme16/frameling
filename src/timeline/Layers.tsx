import { memo, useState } from 'react';
import type { Id, Layer } from '../core/format';
import { store, useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { say } from './commands';
import { runCmd, tip } from './cmd';
import { ContextMenu, InlineName, type MenuItem } from './Menu';
import { isFeatureOn } from '../features/host';
import { addTilemapLayer } from '../tiles/ops';
import * as ops from './ops';
import { pickKeys, setTl, toggleOpen, useTl } from './state';
import { FolderRow, LookTags, lookMenu } from '../effects/TimelineBits';
import { moveNode } from '../effects/ops';
import type { Drop, Node } from '../effects/edit';
import { rowKey } from '../effects/rowKeys';
import { LAYER_LABELS, type LayerLabel } from '../core/format';
import { CLEAN_ROW_H, type LayoutRow } from './layout';
import { useLayout } from './view';
import { isSolo, LABEL_WORDS, setLayerLabel, toggleSolo } from './layerExtras';
import { layerColorClass } from './Detail';
import type { Track } from './tracks';

/** Height of a clean timeline row (the detailed one's rows are in layout.ts). */
export const ROW_H = CLEAN_ROW_H;

/** The buttons above the layer list: add (vector, pixel), duplicate, delete. */
export function LayerTools() {
  const count = useStore((s) => s.doc.layers.length);
  return (
    <div className="tl-layer-tools" role="toolbar" aria-label="Layers">
      <span className="tl-layer-tools-title">Layers</span>
      <button type="button" className="tl-btn" title={tip('layers.addVector', 'Add a vector layer: smooth drawing you can resize and edit')} aria-label="Add vector layer" onClick={() => runCmd('layers.addVector')}>
        <Icon name="vector" size={15} />
        <span className="tl-btn-text">Vector</span>
      </button>
      <button type="button" className="tl-btn" title={tip('layers.addPixel', 'Add a pixel layer: pixel art, one square at a time')} aria-label="Add pixel layer" onClick={() => runCmd('layers.addPixel')}>
        <Icon name="pixel" size={15} />
        <span className="tl-btn-text">Pixel</span>
      </button>
      <button type="button" className="tl-btn" title={tip('layers.duplicate', 'Duplicate this layer with all its drawings')} aria-label="Duplicate layer" onClick={() => runCmd('layers.duplicate')}>
        <Icon name="duplicate" size={15} />
      </button>
      <button type="button" className="tl-btn" title={count > 1 ? tip('layers.delete', 'Delete this layer') : 'You need at least one layer'} aria-label="Delete layer" disabled={count < 2} onClick={() => runCmd('layers.delete')}>
        <Icon name="trash" size={15} />
      </button>
    </div>
  );
}

function OpacitySlider({ layerId }: { layerId: Id }) {
  const opacity = useStore((s) => s.doc.layers.find((l) => l.id === layerId)?.opacity ?? 1);
  return (
    <label className="tl-opacity">
      <span>See-through</span>
      <input type="range" min={0} max={100} value={Math.round(opacity * 100)} onChange={(e) => ops.setLayerOpacity(layerId, Number(e.target.value) / 100)} />
      <output>{Math.round(opacity * 100)}%</output>
    </label>
  );
}

export function layerMenu(layer: Layer, onRename: () => void): MenuItem[] {
  const total = store().get().doc.layers.length;
  const index = store().get().doc.layers.findIndex((l) => l.id === layer.id);
  return [
    { heading: `${layer.name} (${layer.kind === 'pixel' ? `pixel layer, ${layer.pixelSize}px squares` : layer.kind === 'tilemap' ? 'tilemap layer' : layer.kind === 'camera' ? 'camera' : 'vector layer'})` },
    { node: <OpacitySlider layerId={layer.id} /> },
    { separator: true },
    { label: 'Rename', onClick: onRename },
    { label: 'Duplicate layer', onClick: () => void say(ops.duplicateLayer(layer.id)) },
    { label: 'Delete layer', danger: true, disabled: total < 2, onClick: () => void say(ops.deleteLayer(layer.id)) },
    { separator: true },
    { label: 'Bring forward (move up)', disabled: index >= total - 1 && !layer.folder, onClick: () => void ops.stepLayer('up', layer.id) },
    { label: 'Send backward (move down)', disabled: index <= 0 && !layer.folder, onClick: () => void ops.stepLayer('down', layer.id) },
    { separator: true },
    { label: layer.visible ? 'Hide layer' : 'Show layer', onClick: () => void ops.setLayerVisible(layer.id, !layer.visible) },
    { label: layer.locked ? 'Unlock layer' : 'Lock layer (protect it from changes)', onClick: () => void ops.setLayerLocked(layer.id, !layer.locked) },
    { label: layer.reference ? 'Export this layer again' : 'Reference layer (leave out of exports)', onClick: () => void ops.setLayerReference(layer.id, !layer.reference) },
    { label: isSolo(store().get().doc, layer.id) ? 'Show the other layers again' : 'Show only this layer (solo)', onClick: () => toggleSolo(layer.id) },
    { separator: true },
    { heading: 'Colour label' },
    { label: 'None (the usual colour)', checked: !layer.label, onClick: () => setLayerLabel(layer.id, null) },
    ...LAYER_LABELS.map((c: LayerLabel): MenuItem => ({ label: LABEL_WORDS[c], checked: layer.label === c, swatch: c, onClick: () => setLayerLabel(layer.id, c) })),
    { separator: true },
    { label: 'Add a vector layer above', onClick: () => void ops.addVectorLayer(layer.id) },
    { label: 'Add a pixel layer above', onClick: () => void ops.addPixelLayer(layer.id) },
    // Tilemap layers belong to the Tiles feature.
    ...(isFeatureOn('tiles') ? [{ label: 'Add a tilemap layer above', onClick: () => void addTilemapLayer(layer.id) }] : []),
    ...lookMenu(layer),
  ];
}

interface RowProps {
  layer: Layer;
  /** Row height, and (detailed look) its property rows and whether they're showing. */
  h: number;
  detailed: boolean;
  tracks: Track[];
  open: boolean;
  inFolder?: boolean;
  /** How many folders it sits in. */
  depth: number;
  active: boolean;
  editing: boolean;
  dropMark: 'above' | 'below' | null;
  onDragStart: (id: Id) => void;
  onDragOver: (id: Id, where: 'above' | 'below') => void;
  onDrop: (id: Id) => void;
  onDragEnd: () => void;
  onMenu: (layer: Layer, x: number, y: number) => void;
}

const LayerRow = memo(function LayerRow({ layer, h, detailed, tracks, open, inFolder, depth, active, editing, dropMark, onDragStart, onDragOver, onDrop, onDragEnd, onMenu }: RowProps) {
  const select = () => store().setUi({ activeLayerId: layer.id });
  const kind = layer.kind === 'pixel' ? 'Pixel layer (pixel art)' : layer.kind === 'tilemap' ? 'Tilemap layer (painted with tiles)' : layer.kind === 'camera' ? 'Camera (frames the scene)' : 'Vector layer (smooth drawing)';
  return (
    <div
      className={`tl-layer${detailed ? ` is-detailed ${layerColorClass(layer)}` : ''}${active ? ' is-active' : ''}${!layer.visible ? ' is-hidden' : ''}${layer.locked ? ' is-locked' : ''}${layer.reference ? ' is-reference' : ''}${inFolder ? ' in-folder' : ''}${layer.mask ? ' is-mask' : ''}${layer.clipToBelow ? ' is-clipped' : ''}${dropMark ? ` drop-${dropMark}` : ''}`}
      style={{ height: h, ['--depth' as string]: depth }}
      draggable={!editing}
      data-layer={layer.id}
      data-row=""
      role="treeitem"
      tabIndex={0}
      aria-level={depth + 1}
      aria-selected={active}
      aria-expanded={tracks.length ? open : undefined}
      aria-label={`${layer.name}, ${kind}${layer.reference ? ', reference layer' : ''}`}
      aria-current={active ? 'true' : undefined}
      onClick={select}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          e.stopPropagation();
          select();
          return;
        }
        rowKey(e, { layer: layer.id }, `[data-layer="${layer.id}"]`);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        select();
        onMenu(layer, e.clientX, e.clientY);
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', layer.id);
        onDragStart(layer.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        onDragOver(layer.id, e.clientY < r.top + r.height / 2 ? 'above' : 'below');
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(layer.id);
      }}
      onDragEnd={onDragEnd}
    >
      <span className="tl-grip" aria-hidden="true"><Icon name="grip" size={12} /></span>
      {detailed ? (
        tracks.length ? (
          <button
            type="button"
            className="tl-twisty"
            aria-expanded={open}
            aria-label={open ? `Hide ${layer.name}'s properties` : `Show ${layer.name}'s properties`}
            title={open ? 'Fold away the property rows' : `Show what changes on this layer: ${tracks.map((t) => t.label).join(', ')}`}
            onClick={(e) => (e.stopPropagation(), toggleOpen(layer.id))}
          >
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} />
          </button>
        ) : (
          <span className="tl-twisty-gap" aria-hidden="true" />
        )
      ) : null}
      <span className={`tl-kind is-${layer.kind}`} title={layer.kind === 'vector' && layer.rig ? 'Bones layer (the skeleton; each key is a pose)' : kind}>
        <Icon name={layer.kind === 'vector' && layer.rig ? 'bone' : layer.kind} size={13} />
      </span>
      {editing ? (
        <InlineName
          label="Layer name"
          value={layer.name}
          onDone={(v) => {
            setTl({ editing: null });
            if (v !== null) ops.renameLayer(layer.id, v);
          }}
        />
      ) : (
        <span className="tl-layer-name" title="Double-click to rename" onDoubleClick={() => setTl({ editing: { kind: 'layer', id: layer.id } })}>
          {layer.name}
          {layer.bind && (
            <small className="tl-ref-tag" title={layer.bind.mesh ? 'Bends with the bones' : 'Follows a bone'}>
              <Icon name="bone" size={10} />
            </small>
          )}
          {layer.reference && (
            <small className="tl-ref-tag tl-glyph" data-glyph="ref" aria-hidden="true" title="Reference layer: you see it while drawing, exports leave it out" />
          )}
        </span>
      )}
      <LookTags layer={layer} />
      {detailed ? <SoloButton layer={layer} /> : null}
      <button type="button" className="tl-icon-btn" title={layer.visible ? 'Hide this layer' : 'Show this layer'} aria-label={layer.visible ? 'Hide layer' : 'Show layer'} aria-pressed={!layer.visible} onClick={(e) => (e.stopPropagation(), ops.setLayerVisible(layer.id, !layer.visible))}>
        <Icon name={layer.visible ? 'eye' : 'eye-off'} size={15} />
      </button>
      <button type="button" className="tl-icon-btn" title={layer.locked ? 'Unlock this layer' : 'Lock this layer so it can not be changed by accident'} aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'} aria-pressed={layer.locked} onClick={(e) => (e.stopPropagation(), ops.setLayerLocked(layer.id, !layer.locked))}>
        <Icon name={layer.locked ? 'lock' : 'unlock'} size={15} />
      </button>
      <button
        type="button"
        className={`tl-icon-btn tl-layer-onion${layer.onion === false ? ' is-off' : ''}`}
        title={layer.onion === false ? 'Show this layer in the onion skin' : 'Leave this layer out of the onion skin (handy for backgrounds)'}
        aria-label={layer.onion === false ? 'Show in onion skin' : 'Leave out of onion skin'}
        aria-pressed={layer.onion !== false}
        onClick={(e) => (e.stopPropagation(), ops.setLayerOnion(layer.id, layer.onion === false))}
      >
        <Icon name="onion" size={15} />
      </button>
      <button
        type="button"
        className="tl-icon-btn tl-more"
        title="More: see-through slider, move up or down, duplicate, delete"
        aria-label="More layer options"
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          select();
          onMenu(layer, r.left, r.bottom + 2);
        }}
      >
        <Icon name="more" size={16} />
      </button>
    </div>
  );
});

interface DragState {
  node: Node | null;
  over: string | null;
  where: Drop;
}
const NO_DRAG: DragState = { node: null, over: null, where: 'above' };

/** The layer list, top layer first. */
export function LayerList() {
  const layers = useStore((s) => s.doc.layers);
  const layout = useLayout();
  const detailed = layout.style === 'detailed';
  const activeId = useStore((s) => s.ui.activeLayerId) ?? layers[layers.length - 1]?.id;
  const editing = useTl((t) => (t.editing?.kind === 'layer' ? t.editing.id : null));
  // What is being dragged (a layer, or a folder with all in it), and the row it is over: a layer's id, or `f:` and a folder's.
  const [drag, setDrag] = useState<DragState>(NO_DRAG);
  const [menu, setMenu] = useState<{ layer: Layer; x: number; y: number } | null>(null);

  const drop = (over: string) => {
    const { node } = drag;
    const where = drag.where;
    setDrag(NO_DRAG);
    if (!node) return;
    // Next to a layer it joins that layer's folder; next to a folder it sits beside it, or goes in (the middle of its row).
    void moveNode(node, over.startsWith('f:') ? { folder: over.slice(2) } : { layer: over }, where);
  };
  const over = (key: string, where: Drop) => setDrag((d) => (d.over === key && d.where === where ? d : { ...d, over: key, where }));
  const mark = (key: string, own: boolean) => (drag.over === key && !own ? drag.where : null);

  return (
    <div className={`tl-layers${detailed ? ' is-detailed' : ''}`} role="tree" aria-label="Layers, top layer first">
      {layout.rows.map((r: LayoutRow) => {
        if (r.kind === 'folder') {
          const id = r.row.folder.id;
          return (
            <FolderRow
              key={r.key}
              row={r.row}
              height={r.h}
              drag={{
                dropMark: mark(`f:${id}`, !!drag.node && 'folder' in drag.node && drag.node.folder === id),
                onDragStart: (fid) => setDrag({ node: { folder: fid }, over: null, where: 'above' }),
                onDragOver: (fid, where) => over(`f:${fid}`, where),
                onDrop: (fid) => drop(`f:${fid}`),
                onDragEnd: () => setDrag(NO_DRAG),
              }}
            />
          );
        }
        if (r.kind === 'prop') return <PropLabel key={r.key} layer={r.layer} track={r.track} h={r.h} last={r.last} depth={r.depth} />;
        const l = r.layer;
        return (
        <LayerRow
          key={l.id}
          layer={l}
          h={r.h}
          detailed={detailed}
          tracks={r.tracks}
          open={r.open}
          inFolder={r.inFolder}
          depth={r.depth}
          active={l.id === activeId}
          editing={editing === l.id}
          dropMark={(mark(l.id, !!drag.node && 'layer' in drag.node && drag.node.layer === l.id) as 'above' | 'below' | null)}
          onDragStart={(id) => setDrag({ node: { layer: id }, over: null, where: 'above' })}
          onDragOver={(id, where) => over(id, where)}
          onDrop={drop}
          onDragEnd={() => setDrag(NO_DRAG)}
          onMenu={(layer, x, y) => setMenu({ layer, x, y })}
        />
        );
      })}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={layerMenu(store().get().doc.layers.find((l) => l.id === menu.layer.id) ?? menu.layer, () => setTl({ editing: { kind: 'layer', id: menu.layer.id } }))}
        />
      ) : null}
    </div>
  );
}

/** The solo switch: show only this layer while you work on it. */
function SoloButton({ layer }: { layer: Layer }) {
  const on = useStore((s) => isSolo(s.doc, layer.id));
  return (
    <button
      type="button"
      className={`tl-icon-btn tl-solo${on ? ' is-on' : ''}`}
      title={on ? 'Show the other layers again' : 'Show only this layer (solo)'}
      aria-label={on ? 'Show the other layers again' : 'Show only this layer'}
      aria-pressed={on}
      onClick={(e) => (e.stopPropagation(), toggleSolo(layer.id))}
    >
      <span aria-hidden="true" className="tl-glyph" data-glyph="S" />
    </button>
  );
}

/** A property row's name under an opened layer. */
const PropLabel = memo(function PropLabel({ layer, track, h, last, depth }: { layer: Layer; track: Track; h: number; last: boolean; depth: number }) {
  return (
    <div
      className={`tl-prop ${layerColorClass(layer)}${last ? ' is-last' : ''}`}
      style={{ height: h }}
      role="treeitem"
      aria-level={depth + 2}
      aria-label={`${layer.name}: ${track.label}, ${track.keys.length} key${track.keys.length === 1 ? '' : 's'}`}
      title={`${track.label}: ${track.keys.length} key${track.keys.length === 1 ? '' : 's'}. Click to pick them all.`}
      onClick={(e) => {
        store().setUi({ activeLayerId: layer.id });
        pickTrackKeys(track, e.shiftKey);
      }}
    >
      <Icon name={track.icon} size={12} />
      <span className="tl-prop-name">{track.label}</span>
      <span className="tl-prop-count">{track.keys.length}</span>
    </div>
  );
});

function pickTrackKeys(track: Track, add: boolean) {
  pickKeys(track.keys.map((k) => k.ref), add);
}
