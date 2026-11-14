// The timeline's side of effects: folder header rows, the little blend/clip/mask/effects tags on a layer row, and
// the look entries in a layer's menu.
import { useState } from 'react';
import type { Id, Layer } from '../core/format';
import { store } from '../core/store';
import { Icon } from '../ui/icons';
import { showPanel } from '../ui/dock';
import { ContextMenu, InlineName, type MenuItem } from '../timeline/Menu';
import { blendInfo, lookSummary } from './model';
import * as ops from './ops';
import { addMask, toggleClip, toggleMask } from './commands';
import { namesList, type MaskLinks } from './masks';
import type { Drop } from './edit';
import { rowKey } from './rowKeys';
import { toggleFolderCollapsed, type TimelineRow } from './rows';
import './effects.css';

/** What the layer list needs to run a drag on a folder's header: it can be dragged, and things can be dropped on it. */
export interface FolderDragProps {
  dropMark: Drop | null;
  onDragStart: (folderId: string) => void;
  onDragOver: (folderId: string, where: Drop) => void;
  onDrop: (folderId: string) => void;
  onDragEnd: () => void;
}

/** A folder's header row in the layer list: fold, name, show or hide, more. Drag it to move the folder and all in it. */
export function FolderRow({ row, height, drag }: { row: Extract<TimelineRow, { type: 'folder' }>; height: number; drag: FolderDragProps }) {
  const f = row.folder;
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const look = [f.opacity < 1 ? `${Math.round(f.opacity * 100)}% see-through` : '', f.blend && f.blend !== 'normal' ? blendInfo(f.blend).label : '', f.effects?.length ? `${f.effects.length} effect${f.effects.length > 1 ? 's' : ''}` : '']
    .filter(Boolean)
    .join(', ');
  const n = row.layerIds.length;
  return (
    <div
      className={`tl-folder${f.visible ? '' : ' is-hidden'}${row.depth ? ' in-folder' : ''}${drag.dropMark ? ` drop-${drag.dropMark}` : ''}`}
      style={{ height, ['--depth' as string]: row.depth }}
      role="treeitem"
      data-row=""
      data-folder={f.id}
      tabIndex={0}
      aria-level={row.depth + 1}
      aria-expanded={!row.collapsed}
      aria-label={`Folder ${f.name}, ${n} layer${n === 1 ? '' : 's'}${row.depth ? `, inside another folder` : ''}${f.visible ? '' : ', hidden'}`}
      draggable={!editing}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            e.stopPropagation();
            toggleFolderCollapsed(f.id);
          }
          return;
        }
        rowKey(e, { folder: f.id }, `[data-folder="${f.id}"]`, { id: f.id, collapsed: row.collapsed });
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', f.id);
        drag.onDragStart(f.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const y = (e.clientY - r.top) / r.height;
        // Top edge: above the folder. Middle: inside it. Bottom edge: inside when open, below it when folded.
        drag.onDragOver(f.id, y < 0.3 ? 'above' : y > 0.7 && row.collapsed ? 'below' : 'into');
      }}
      onDrop={(e) => {
        e.preventDefault();
        drag.onDrop(f.id);
      }}
      onDragEnd={drag.onDragEnd}
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
          {row.collapsed && <small className="tl-look-tag tl-glyph" data-glyph={String(n)} aria-hidden="true" />}
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
        title="More: rename, effects, move into or out of folders, take the layers out"
        aria-label="More folder options"
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 2 });
        }}
      >
        <Icon name="more" size={16} />
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
            { label: 'Put in the folder next to it', onClick: () => void ops.nestNode({ folder: f.id }) },
            { label: 'Take out of its folder', disabled: !row.parent, onClick: () => void ops.outdentNode({ folder: f.id }) },
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
  // A mask row has its own button (see MaskLink): it says the same and also jumps to the layer.
  if (layer.mask) return null;
  const summary = lookSummary(layer);
  if (!summary) return null;
  const icon = layer.clipToBelow ? 'clip-below' : 'effects';
  return (
    <span className="tl-look-tag" title={summary} aria-label={summary} role="img">
      <Icon name={icon} size={12} />
    </span>
  );
}

/** What the list knows about a layer's mask: the mask that cuts it, or the layers a mask cuts. */
export interface MaskInfo {
  by?: { id: Id; name: string };
  cuts?: { id: Id; names: string };
}

/**
 * The mask mark on a row. On a mask it says what it masks and jumps to that layer; on a layer a mask cuts it says which
 * mask and jumps to it. So the pair is one click apart, and the mask's purple runs down the layers it cuts.
 */
export function MaskLink({ layer, info }: { layer: Layer; info?: MaskInfo }) {
  if (layer.mask) {
    const what = info?.cuts?.names ? `Masks ${info.cuts.names}` : 'Masks nothing yet: put a layer under it';
    const how = layer.mask === 'hide' ? 'hides' : 'shows';
    const text = `${what}. Where you paint, it ${how} them. Click to pick the layer it masks.`;
    return (
      <button
        type="button"
        className="tl-mask-link is-mask"
        title={text}
        aria-label={text}
        disabled={!info?.cuts}
        onClick={(e) => (e.stopPropagation(), info?.cuts && store().setUi({ activeLayerId: info.cuts.id }))}
      >
        <Icon name="mask" size={13} />
        <span className="tl-mask-link-text">{info?.cuts?.names ?? ''}</span>
      </button>
    );
  }
  if (!info?.by) return null;
  const text = `Masked by ${info.by.name}. Click to paint its mask.`;
  return (
    <button type="button" className="tl-mask-link" title={text} aria-label={text} onClick={(e) => (e.stopPropagation(), store().setUi({ activeLayerId: info.by!.id }))}>
      <Icon name="mask" size={12} />
    </button>
  );
}

/** The switch on a mask's row, in place of the eye: off keeps the mask and what is painted on it, and cuts nothing. */
export function MaskSwitch({ layer }: { layer: Layer }) {
  const on = layer.visible;
  const text = on ? 'Mask is on. Click to turn it off for a moment: it is kept, and cuts nothing.' : 'Mask is off. Click to turn it on again.';
  return (
    <button
      type="button"
      className={`tl-icon-btn tl-mask-switch${on ? '' : ' is-off'}`}
      title={text}
      aria-label={on ? 'Turn mask off' : 'Turn mask on'}
      aria-pressed={on}
      onClick={(e) => (e.stopPropagation(), ops.setMaskOn(layer.id, !on))}
    >
      <Icon name="mask" size={15} />
    </button>
  );
}

/** Builds the info for one row from the document's links. */
export function maskInfoFor(layer: Layer, links: MaskLinks): MaskInfo | undefined {
  const by = links.by.get(layer.id);
  const cut = links.targets.get(layer.id);
  if (!by && !cut?.length) return undefined;
  return {
    by: by ? { id: by.id, name: by.name } : undefined,
    // The layer it jumps to is the one just under the mask.
    cuts: cut?.length ? { id: cut[cut.length - 1].id, names: namesList(cut) } : undefined,
  };
}

/** The look entries for a layer's menu. */
export function lookMenu(layer: Layer): MenuItem[] {
  return [
    { separator: true },
    { label: 'Effects and blend...', onClick: () => showPanel('effects') },
    { label: 'Clip to the layer below', checked: !!layer.clipToBelow, onClick: () => toggleClip(layer) },
    ...(layer.mask
      ? [
          { label: layer.visible ? 'Turn this mask off (keeps it)' : 'Turn this mask on', onClick: () => void ops.setMaskOn(layer.id, !layer.visible) },
          { label: layer.mask === 'show' ? 'Flip it: hide where painted' : 'Flip it: show where painted', onClick: () => void ops.flipMask(layer.id) },
          { label: 'Take the mask off for good', onClick: () => toggleMask(layer) },
        ]
      : [
          { label: 'Add a mask to this layer', onClick: () => addMask(layer) },
          { label: 'Use this layer as a mask', onClick: () => toggleMask(layer) },
        ]),
    { label: 'Put in the folder next to it', onClick: () => void ops.nestNode({ layer: layer.id }) },
    ...(layer.folder ? [{ label: 'Take out of its folder', onClick: () => void ops.outdentNode({ layer: layer.id }) }] : []),
    { label: layer.folder ? 'Put in a new folder inside it' : 'Put in a new folder', onClick: () => void ops.makeFolder([layer.id]) },
  ];
}
