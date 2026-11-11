import { memo, useState } from 'react';
import type { Id, Layer } from '../core/format';
import { store, useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { say } from './commands';
import { runCmd, tip } from './cmd';
import { ContextMenu, InlineName, type MenuItem } from './Menu';
import { addTilemapLayer } from '../tiles/ops';
import * as ops from './ops';
import { setTl, useTl } from './state';
import { FolderRow, LookTags, lookMenu } from '../effects/TimelineBits';
import { useTimelineRows } from '../effects/rows';
import { moveLayerInto } from '../effects/ops';

export const ROW_H = 36;

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
    { heading: `${layer.name} (${layer.kind === 'pixel' ? `pixel layer, ${layer.pixelSize}px squares` : layer.kind === 'tilemap' ? 'tilemap layer' : 'vector layer'})` },
    { node: <OpacitySlider layerId={layer.id} /> },
    { separator: true },
    { label: 'Rename', onClick: onRename },
    { label: 'Duplicate layer', onClick: () => void say(ops.duplicateLayer(layer.id)) },
    { label: 'Delete layer', danger: true, disabled: total < 2, onClick: () => void say(ops.deleteLayer(layer.id)) },
    { separator: true },
    { label: 'Bring forward (move up)', disabled: index >= total - 1, onClick: () => void ops.stepLayer('up', layer.id) },
    { label: 'Send backward (move down)', disabled: index <= 0, onClick: () => void ops.stepLayer('down', layer.id) },
    { separator: true },
    { label: layer.visible ? 'Hide layer' : 'Show layer', onClick: () => void ops.setLayerVisible(layer.id, !layer.visible) },
    { label: layer.locked ? 'Unlock layer' : 'Lock layer (protect it from changes)', onClick: () => void ops.setLayerLocked(layer.id, !layer.locked) },
    { label: layer.reference ? 'Export this layer again' : 'Reference layer (leave out of exports)', onClick: () => void ops.setLayerReference(layer.id, !layer.reference) },
    { separator: true },
    { label: 'Add a vector layer above', onClick: () => void ops.addVectorLayer(layer.id) },
    { label: 'Add a pixel layer above', onClick: () => void ops.addPixelLayer(layer.id) },
    { label: 'Add a tilemap layer above', onClick: () => void addTilemapLayer(layer.id) },
    ...lookMenu(layer),
  ];
}

interface RowProps {
  layer: Layer;
  inFolder?: boolean;
  active: boolean;
  editing: boolean;
  dropMark: 'above' | 'below' | null;
  onDragStart: (id: Id) => void;
  onDragOver: (id: Id, where: 'above' | 'below') => void;
  onDrop: (id: Id) => void;
  onDragEnd: () => void;
  onMenu: (layer: Layer, x: number, y: number) => void;
}

const LayerRow = memo(function LayerRow({ layer, inFolder, active, editing, dropMark, onDragStart, onDragOver, onDrop, onDragEnd, onMenu }: RowProps) {
  const select = () => store().setUi({ activeLayerId: layer.id });
  const kind = layer.kind === 'pixel' ? 'Pixel layer (pixel art)' : layer.kind === 'tilemap' ? 'Tilemap layer (painted with tiles)' : 'Vector layer (smooth drawing)';
  return (
    <div
      className={`tl-layer${active ? ' is-active' : ''}${!layer.visible ? ' is-hidden' : ''}${layer.locked ? ' is-locked' : ''}${layer.reference ? ' is-reference' : ''}${inFolder ? ' in-folder' : ''}${layer.mask ? ' is-mask' : ''}${layer.clipToBelow ? ' is-clipped' : ''}${dropMark ? ` drop-${dropMark}` : ''}`}
      style={{ height: ROW_H }}
      draggable={!editing}
      data-layer={layer.id}
      role="listitem"
      tabIndex={0}
      aria-label={`${layer.name}, ${kind}`}
      aria-current={active ? 'true' : undefined}
      onClick={select}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          e.stopPropagation();
          select();
        }
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
      <span className={`tl-kind is-${layer.kind}`} title={kind}>
        <Icon name={layer.kind} size={13} />
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
          {layer.reference && (
            <small className="tl-ref-tag" title="Reference layer: you see it while drawing, exports leave it out">
              ref
            </small>
          )}
          <LookTags layer={layer} />
        </span>
      )}
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
        <span aria-hidden="true">{'⋯'}</span>
      </button>
    </div>
  );
});

/** The layer list, top layer first. */
export function LayerList() {
  const layers = useStore((s) => s.doc.layers);
  const rows = useTimelineRows();
  const activeId = useStore((s) => s.ui.activeLayerId) ?? layers[layers.length - 1]?.id;
  const editing = useTl((t) => (t.editing?.kind === 'layer' ? t.editing.id : null));
  const [drag, setDrag] = useState<{ id: Id | null; over: Id | null; where: 'above' | 'below' }>({ id: null, over: null, where: 'above' });
  const [menu, setMenu] = useState<{ layer: Layer; x: number; y: number } | null>(null);

  const drop = (targetId: Id) => {
    const { id, where } = drag;
    setDrag({ id: null, over: null, where: 'above' });
    if (!id || id === targetId) return;
    const from = layers.findIndex((l) => l.id === id);
    const ti = layers.findIndex((l) => l.id === targetId);
    if (from < 0 || ti < 0) return;
    // "above" in the list means a higher array index
    const to = where === 'above' ? (from < ti ? ti : ti + 1) : from < ti ? ti - 1 : ti;
    // Dropped next to a layer in a folder, it joins that folder; next to one outside, it leaves its own.
    const folder = layers[ti].folder ?? null;
    if ((layers[from].folder ?? null) !== folder) moveLayerInto(id, to, folder);
    else ops.reorderLayer(id, to);
  };

  return (
    <div className="tl-layers" role="list" aria-label="Layers, top layer first">
      {rows.map((r) => {
        if (r.type === 'folder') return <FolderRow key={`f-${r.folder.id}-${r.layerIds[0]}`} row={r} height={ROW_H} />;
        const l = r.layer;
        return (
        <LayerRow
          key={l.id}
          layer={l}
          inFolder={r.inFolder}
          active={l.id === activeId}
          editing={editing === l.id}
          dropMark={drag.over === l.id && drag.id !== l.id ? drag.where : null}
          onDragStart={(id) => setDrag({ id, over: null, where: 'above' })}
          onDragOver={(id, where) => setDrag((d) => (d.over === id && d.where === where ? d : { ...d, over: id, where }))}
          onDrop={drop}
          onDragEnd={() => setDrag({ id: null, over: null, where: 'above' })}
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
