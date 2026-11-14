import { setPlacing } from '../reference/state';
import { memo, useMemo, useState } from 'react';
import { Explainer } from '../ui/explain/ExplainIcon';
import type { Id, Layer } from '../core/format';
import { store, useStore } from '../core/store';
import { Icon } from '../ui/icons';
import { say } from './commands';
import { runCmd, tip } from './cmd';
import { ContextMenu, type MenuItem } from './Menu';
import { PieceActions, PieceButton, PieceRow, PieceTools, pieceMenuBasics, useRowDrag } from './PieceRow';
import { isFeatureOn } from '../features/host';
import { addTilemapLayer } from '../tiles/ops';
import * as ops from './ops';
import { pickKeys, setTl, toggleOpen, useTl } from './state';
import { FolderRow, LookTags, MaskLink, MaskSwitch, lookMenu, maskInfoFor, type MaskInfo } from '../effects/TimelineBits';
import { maskLinks } from '../effects/masks';
import { moveNode } from '../effects/ops';
import type { Drop, Node } from '../effects/edit';
import { rowKey } from '../effects/rowKeys';
import { LAYER_LABELS, type LayerLabel } from '../core/format';
import { CLEAN_ROW_H, type Layout, type LayoutRow } from './layout';
import { useLayout } from './view';
import { isSolo, LABEL_WORDS, setLayerLabel, toggleSolo } from './layerExtras';
import { layerColorClass } from './Detail';
import type { Track } from './tracks';

/** Height of a clean timeline row (the detailed one's rows are in layout.ts). */
export const ROW_H = CLEAN_ROW_H;

/** The buttons above the layer list: add (vector, pixel), duplicate, delete. */
export function LayerTools({ inPanel = false }: { inPanel?: boolean } = {}) {
  const count = useStore((s) => s.doc.layers.length);
  // Frames on boards: these layers are on every frame.
  const everyFrame = useStore((s) => !!s.doc.sharedLayers && (s.doc.artboards?.length ?? 0) > 1);
  // A mask is added to a drawing layer; a mask or the camera has nothing to add one to.
  const maskProblem = useStore((s) => {
    const l = s.doc.layers.find((x) => x.id === s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return !l ? 'Add a layer first.' : l.mask ? 'This layer is a mask already. Pick the layer you want to mask.' : l.kind === 'camera' ? 'The camera has nothing to mask.' : '';
  });
  const actions = (
    <PieceActions
      thing="layer"
      duplicate={{ tip: tip('layers.duplicate', 'Duplicate this layer with all its drawings'), run: () => runCmd('layers.duplicate') }}
      extra={
        <button type="button" className="tl-btn" title={maskProblem || tip('layers.addMask', 'Add a mask: a layer above this one that decides where it shows. Paint on it with any tool.')} aria-label="Add a mask to this layer" disabled={!!maskProblem} onClick={() => runCmd('layers.addMask')}>
          <Icon name="mask" size={15} />
        </button>
      }
      remove={{ tip: tip('layers.delete', 'Delete this layer'), run: () => runCmd('layers.delete'), off: count < 2 ? 'You need at least one layer' : undefined }}
    />
  );
  return (
    <PieceTools
      name="Layers"
      newWord="New layer"
      inPanel={inPanel}
      actions={actions}
      title={
        <>
          Layers
          {everyFrame ? <span className="tl-shared-chip" title="One set of layers for the whole drawing: add, hide or reorder one here and every frame has it. Each frame keeps its own pixels.">on every frame</span> : null}
        </>
      }
      adds={
        <>
          <PieceButton icon="vector" text="Vector" tip={tip('layers.addVector', 'New vector layer: smooth drawing you can resize and edit')} label="New vector layer" onClick={() => runCmd('layers.addVector')} />
          <PieceButton icon="pixel" text="Pixel" tip={tip('layers.addPixel', 'New pixel layer: pixel art, one square at a time')} label="New pixel layer" onClick={() => runCmd('layers.addPixel')} />
        </>
      }
    >
      {inPanel && everyFrame ? (
        <Explainer className="tl-shared-note">
          These layers are on <b>every frame</b>. Each frame keeps its own pixels on them.
        </Explainer>
      ) : null}
    </PieceTools>
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
    ...pieceMenuBasics({
      thing: 'layer',
      onRename,
      onDuplicate: () => void say(ops.duplicateLayer(layer.id)),
      onDelete: () => void say(ops.deleteLayer(layer.id)),
      canDelete: total >= 2,
      up: { label: 'Bring forward (move up)', disabled: index >= total - 1 && !layer.folder, run: () => void ops.stepLayer('up', layer.id) },
      down: { label: 'Send backward (move down)', disabled: index <= 0 && !layer.folder, run: () => void ops.stepLayer('down', layer.id) },
    }),
    { separator: true },
    { label: layer.visible ? 'Hide layer' : 'Show layer', onClick: () => void ops.setLayerVisible(layer.id, !layer.visible) },
    { label: layer.locked ? 'Unlock layer' : 'Lock layer (protect it from changes)', onClick: () => void ops.setLayerLocked(layer.id, !layer.locked) },
    ...(layer.picture ? [{ label: 'Move, size and turn the picture', onClick: () => setPlacing(layer.id) } as MenuItem] : []),
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
  /** What a mask does here: the mask cutting this layer, or the layers this mask cuts. */
  mask?: MaskInfo;
  dropMark: Drop | null;
  onDragStart: (id: Id) => void;
  onDragOver: (id: Id, where: 'above' | 'below') => void;
  onDrop: (id: Id) => void;
  onDragEnd: () => void;
  onMenu: (layer: Layer, x: number, y: number) => void;
}

const LayerRow = memo(function LayerRow({ layer, h, detailed, tracks, open, inFolder, depth, active, editing, mask, dropMark, onDragStart, onDragOver, onDrop, onDragEnd, onMenu }: RowProps) {
  const select = () => store().setUi({ activeLayerId: layer.id });
  const kind = layer.kind === 'pixel' ? 'Pixel layer (pixel art)' : layer.kind === 'tilemap' ? 'Tilemap layer (painted with tiles)' : layer.kind === 'camera' ? 'Camera (frames the scene)' : 'Vector layer (smooth drawing)';
  return (
    <PieceRow
      id={layer.id}
      attr="data-layer"
      h={h}
      active={active}
      dim={!layer.visible}
      className={`${detailed ? `is-detailed ${layerColorClass(layer)}` : ''}${layer.locked ? ' is-locked' : ''}${layer.reference ? ' is-reference' : ''}${layer.mask ? ' is-mask' : ''}${mask?.by ? ' is-masked' : ''}${layer.clipToBelow ? ' is-clipped' : ''}`}
      inFolder={inFolder}
      depth={depth}
      label={`${layer.name}, ${kind}${layer.reference ? ', reference layer' : ''}`}
      extra={{ 'aria-expanded': tracks.length ? open : undefined }}
      drag={{ dropMark, onDragStart, onDragOver, onDrop, onDragEnd }}
      onSelect={select}
      onMenu={(x, y) => onMenu(layer, x, y)}
      onKey={(e) => rowKey(e, { layer: layer.id }, `[data-layer="${layer.id}"]`)}
      before={
        detailed ? (
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
        ) : null
      }
      lead={
        <span className={`tl-kind is-${layer.kind}`} title={layer.kind === 'vector' && layer.rig ? 'Bones layer (the skeleton; each key is a pose)' : kind}>
          <Icon name={layer.kind === 'vector' && layer.rig ? 'bone' : layer.kind} size={13} />
        </span>
      }
      name={layer.name}
      nameLabel="Layer name"
      editing={editing}
      onStartRename={() => setTl({ editing: { kind: 'layer', id: layer.id } })}
      onRename={(v) => {
        setTl({ editing: null });
        if (v !== null) ops.renameLayer(layer.id, v);
      }}
      tags={
        <>
          {layer.bind && (
            <small className="tl-ref-tag" title={layer.bind.mesh ? 'Bends with the bones' : 'Follows a bone'}>
              <Icon name="bone" size={10} />
            </small>
          )}
          {layer.reference && <small className="tl-ref-tag tl-glyph" data-glyph="ref" aria-hidden="true" title={layer.picture ? 'Reference picture: you see it while drawing, exports leave it out' : 'Reference layer: you see it while drawing, exports leave it out'} />}
        </>
      }
      meta={
        <>
          <LookTags layer={layer} />
          <MaskLink layer={layer} info={mask} />
        </>
      }
      buttons={
        <>
          {detailed ? <SoloButton layer={layer} /> : null}
          {layer.mask ? (
            <MaskSwitch layer={layer} />
          ) : (
            <button type="button" className="tl-icon-btn" title={layer.visible ? 'Hide this layer' : 'Show this layer'} aria-label={layer.visible ? 'Hide layer' : 'Show layer'} aria-pressed={!layer.visible} onClick={(e) => (e.stopPropagation(), ops.setLayerVisible(layer.id, !layer.visible))}>
              <Icon name={layer.visible ? 'eye' : 'eye-off'} size={15} />
            </button>
          )}
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
        </>
      }
      moreTitle="More: see-through slider, move up or down, duplicate, delete"
      moreLabel="More layer options"
    />
  );
});

/**
 * The layer list, top layer first. The timeline lays its rows out to line up with the keys; the Layers panel passes
 * its own even-height layout instead (see LayersPanel).
 */
export function LayerList({ layout: given }: { layout?: Layout } = {}) {
  const layers = useStore((s) => s.doc.layers);
  const folders = useStore((s) => s.doc.folders);
  // Which layer is a mask and what it cuts, worked out from the same plan the picture is drawn from.
  const maskInfo = useMemo(() => {
    if (!layers.some((l) => l.mask)) return null;
    const links = maskLinks({ layers, folders } as Parameters<typeof maskLinks>[0]);
    return new Map(layers.map((l) => [l.id, maskInfoFor(l, links)]));
  }, [layers, folders]);
  const own = useLayout();
  const layout = given ?? own;
  const detailed = layout.style === 'detailed';
  const activeId = useStore((s) => s.ui.activeLayerId) ?? layers[layers.length - 1]?.id;
  const editing = useTl((t) => (t.editing?.kind === 'layer' ? t.editing.id : null));
  // What is being dragged (a layer, or a folder with all in it), and the row it is over: a layer's id, or `f:` and a folder's.
  const dnd = useRowDrag<Node>();
  const drag = dnd.drag;
  const [menu, setMenu] = useState<{ layer: Layer; x: number; y: number } | null>(null);

  const drop = (over: string) => {
    const { node, where } = dnd.take();
    if (!node) return;
    // Next to a layer it joins that layer's folder; next to a folder it sits beside it, or goes in (the middle of its row).
    void moveNode(node, over.startsWith('f:') ? { folder: over.slice(2) } : { layer: over }, where);
  };
  const { over, mark } = dnd;

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
                onDragStart: (fid) => dnd.start({ folder: fid }),
                onDragOver: (fid, where) => over(`f:${fid}`, where),
                onDrop: (fid) => drop(`f:${fid}`),
                onDragEnd: dnd.end,
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
          mask={maskInfo?.get(l.id)}
          dropMark={mark(l.id, !!drag.node && 'layer' in drag.node && drag.node.layer === l.id)}
          onDragStart={(id) => dnd.start({ layer: id })}
          onDragOver={(id, where) => over(id, where)}
          onDrop={drop}
          onDragEnd={dnd.end}
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
