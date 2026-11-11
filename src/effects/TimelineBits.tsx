// The timeline's side of effects: folder header rows, the little blend/clip/mask/effects tags on a layer row, and
// the look entries in a layer's menu.
import { useState } from 'react';
import type { Layer } from '../core/format';
import { store } from '../core/store';
import { Icon } from '../ui/icons';
import { showPanel } from '../ui/dock';
import { ContextMenu, InlineName, type MenuItem } from '../timeline/Menu';
import { blendInfo, lookSummary } from './model';
import * as ops from './ops';
import { toggleClip, toggleMask } from './commands';
import { toggleFolderCollapsed, type TimelineRow } from './rows';
import './effects.css';

/** A folder's header row in the layer list: fold, name, show or hide, more. */
export function FolderRow({ row, height }: { row: Extract<TimelineRow, { type: 'folder' }>; height: number }) {
  const f = row.folder;
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const look = [f.opacity < 1 ? `${Math.round(f.opacity * 100)}% see-through` : '', f.blend && f.blend !== 'normal' ? blendInfo(f.blend).label : '', f.effects?.length ? `${f.effects.length} effect${f.effects.length > 1 ? 's' : ''}` : '']
    .filter(Boolean)
    .join(', ');
  const n = row.layerIds.length;
  return (
    <div
      className={`tl-folder${f.visible ? '' : ' is-hidden'}`}
      style={{ height }}
      role="listitem"
      aria-label={`Folder ${f.name}, ${n} layer${n === 1 ? '' : 's'}${row.collapsed ? ', folded' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <button type="button" className="tl-folder-twisty" aria-expanded={!row.collapsed} title={row.collapsed ? 'Unfold: show this folder\'s layers' : 'Fold: hide this folder\'s layers in the timeline (they still show on the canvas)'} onClick={() => toggleFolderCollapsed(f.id)}>
        <Icon name={row.collapsed ? 'chevron-right' : 'chevron-down'} size={14} />
      </button>
      <Icon name="folder" size={14} />
      {editing ? (
        <InlineName
          label="Folder name"
          value={f.name}
          onDone={(v) => {
            setEditing(false);
            if (v !== null) ops.renameFolder(f.id, v);
          }}
        />
      ) : (
        <span className="tl-folder-name" title={`Double-click to rename${look ? `. ${look}` : ''}`} onDoubleClick={() => setEditing(true)}>
          {f.name}
          {row.collapsed && <small className="tl-look-tag">{n}</small>}
          {look && (
            <span className="tl-look-tag" title={look}>
              <Icon name="effects" size={12} />
            </span>
          )}
        </span>
      )}
      <button type="button" className="tl-icon-btn" title={f.visible ? 'Hide everything in this folder' : 'Show this folder'} aria-label={f.visible ? 'Hide folder' : 'Show folder'} aria-pressed={!f.visible} onClick={() => ops.setFolderVisible(f.id, !f.visible)}>
        <Icon name={f.visible ? 'eye' : 'eye-off'} size={15} />
      </button>
      <button
        type="button"
        className="tl-icon-btn tl-more"
        title="More: rename, effects, take the layers out"
        aria-label="More folder options"
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 2 });
        }}
      >
        <span aria-hidden="true">{'⋯'}</span>
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { heading: `${f.name} (folder, ${n} layer${n === 1 ? '' : 's'})` },
            { label: 'Rename', onClick: () => setEditing(true) },
            {
              label: 'See-through, blend and effects...',
              onClick: () => {
                store().setUi({ activeLayerId: row.layerIds[0] });
                showPanel('effects');
              },
            },
            { label: row.collapsed ? 'Unfold' : 'Fold (hide its layers here)', onClick: () => toggleFolderCollapsed(f.id) },
            { separator: true },
            { label: 'Take the layers out (remove folder)', onClick: () => void ops.ungroupFolder(f.id) },
          ]}
        />
      )}
    </div>
  );
}

/** One small mark after a layer's name (mask, clipped, or blend and effects), with the whole story in its tooltip. */
export function LookTags({ layer }: { layer: Layer }) {
  const summary = lookSummary(layer);
  if (!summary) return null;
  const icon = layer.mask ? 'mask' : layer.clipToBelow ? 'clip-below' : 'effects';
  return (
    <span className={`tl-look-tag${layer.mask ? ' is-mask' : ''}`} title={summary} aria-label={summary} role="img">
      <Icon name={icon} size={12} />
    </span>
  );
}

/** The look entries for a layer's menu. */
export function lookMenu(layer: Layer): MenuItem[] {
  return [
    { separator: true },
    { label: 'Effects and blend...', onClick: () => showPanel('effects') },
    { label: 'Clip to the layer below', checked: !!layer.clipToBelow, onClick: () => toggleClip(layer) },
    { label: 'Use as a mask', checked: !!layer.mask, onClick: () => toggleMask(layer) },
    layer.folder ? { label: 'Take out of its folder', onClick: () => void ops.moveLayerInto(layer.id, store().get().doc.layers.findIndex((l) => l.id === layer.id), null) } : { label: 'Put in a new folder', onClick: () => void ops.makeFolder([layer.id]) },
  ];
}
