/**
 * The parts the Layers panel and the Artboards panel share. Layers and artboards are the same kind of thing (a list of
 * pieces of the drawing, each with a name, picked, renamed, dragged, duplicated and deleted), so both panels are built
 * from these: the header with its add buttons and the duplicate and delete pair, the row with its grip, picture, name
 * and buttons, the drag marks, the right-click menu basics. A change to how a row looks or behaves lands in both.
 *
 * What differs stays in the callers: a layer has its eye, padlock and onion buttons and folders; a board has a size, a
 * place on the pasteboard and a variation that follows another board.
 */
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { Id } from '../core/format';
import type { Drop } from '../effects/edit';
import { Icon } from '../ui/icons';
import { walkRows } from '../effects/rowKeys';
import { InlineName, type MenuItem } from './Menu';
import './timeline.css';
import '../effects/effects.css';

// ---------------------------------------------------------------- the header

/** A button at the top of a list: an icon and a word. The first group adds a piece of that kind; others act on the whole list. */
export function PieceButton({ icon, text, tip, label, onClick, disabled }: { icon?: string; text: string; tip: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="tl-btn" title={tip} aria-label={label} disabled={disabled} onClick={onClick}>
      {icon ? <Icon name={icon} size={15} /> : null}
      <span className="tl-btn-text">{text}</span>
    </button>
  );
}

/** The duplicate and delete pair, in that order, acting on the piece that is open. */
export function PieceActions({
  thing,
  duplicate,
  remove,
  extra,
}: {
  /** "layer", "artboard": in the buttons' names. */
  thing: string;
  duplicate: { tip: string; run: () => void };
  /** `off` is the reason the button is off, when it is. */
  remove: { tip: string; run: () => void; off?: string };
  /** A button only this list has (a layer's Mask), between duplicate and delete. */
  extra?: ReactNode;
}) {
  return (
    <span className="tl-layer-actions" role="group" aria-label={`This ${thing}`}>
      <button type="button" className="tl-btn" title={duplicate.tip} aria-label={`Duplicate ${thing}`} onClick={duplicate.run}>
        <Icon name="duplicate" size={15} />
      </button>
      {extra}
      <button type="button" className="tl-btn" title={remove.off ?? remove.tip} aria-label={`Delete ${thing}`} disabled={!!remove.off} onClick={remove.run}>
        <Icon name="trash" size={15} />
      </button>
    </span>
  );
}

/**
 * The bar above a list. In a panel it is the add buttons ("New layer: Vector, Pixel") then duplicate and delete, with
 * `children` (notes, whole-list buttons) after. In the timeline's corner it takes a `title` row with the actions on it.
 */
export function PieceTools({
  name,
  newWord,
  adds,
  actions,
  title,
  inPanel = false,
  children,
}: {
  /** The list's name, for the toolbar. */
  name: string;
  /** "New layer", "New artboard". */
  newWord: string;
  adds: ReactNode;
  actions: ReactNode;
  title?: ReactNode;
  inPanel?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`tl-layer-tools${inPanel ? ' in-panel' : ''}`} role="toolbar" aria-label={name}>
      {inPanel ? null : (
        <span className="tl-layer-tools-title">
          <span>{title ?? name}</span>
          {actions}
        </span>
      )}
      {/* The buttons add a piece of that kind (they are not a mode switch), so the row says so. */}
      <span className="tl-layer-new" role="group" aria-label={newWord}>
        <span className="tl-layer-new-label" aria-hidden="true">
          {newWord}
        </span>
        {adds}
      </span>
      {inPanel ? actions : null}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- dragging

/** What a row tells its list while it is dragged: where the mark goes, and what to do on each drag event. */
export interface RowDrag {
  dropMark: Drop | null;
  onDragStart: (id: Id) => void;
  onDragOver: (id: Id, where: 'above' | 'below') => void;
  onDrop: (id: Id) => void;
  onDragEnd: () => void;
}

export interface DragState<N> {
  node: N | null;
  over: string | null;
  where: Drop;
}

/** What is being dragged, the row it is over, and which half of it: the marks every list draws the same way. */
export function useRowDrag<N>() {
  const none: DragState<N> = { node: null, over: null, where: 'above' };
  const [drag, setDrag] = useState<DragState<N>>(none);
  return {
    drag,
    start: (node: N) => setDrag({ node, over: null, where: 'above' }),
    over: (key: string, where: Drop) => setDrag((d) => (d.over === key && d.where === where ? d : { ...d, over: key, where })),
    end: () => setDrag(none),
    /** The mark for a row: none on the row being dragged itself. */
    mark: (key: string, own: boolean): Drop | null => (drag.over === key && !own ? drag.where : null),
    /** Ends the drag and says what was dragged and where it lands. */
    take: (): { node: N | null; where: Drop } => {
      const got = { node: drag.node, where: drag.where };
      setDrag(none);
      return got;
    },
  };
}

/** Where a dragged row lands in a list: the position it takes once it has left its old place. */
export function dropIndex(from: number, over: number, where: Drop): number {
  const at = where === 'below' ? over + 1 : over;
  return from < at ? at - 1 : at;
}

// ---------------------------------------------------------------- the row

export interface PieceRowProps {
  id: Id;
  /** Marks the row for lookups: `data-layer`, `data-artboard`. */
  attr: string;
  /** Row height. */
  h: number;
  active: boolean;
  /** Dimmed (a hidden layer). */
  dim?: boolean;
  /** Extra classes (the kind of row). */
  className?: string;
  /** How many levels in it sits (a layer in a folder, a variation under its original). */
  depth?: number;
  inFolder?: boolean;
  /** Name for screen readers, and the tooltip on the row. */
  label: string;
  /** Before the picture: a twisty. */
  before?: ReactNode;
  /** The picture: the layer's kind, the board's thumbnail. */
  lead: ReactNode;
  name: string;
  nameTitle?: string;
  /** Next to the name, inside it (little tags). */
  tags?: ReactNode;
  editing: boolean;
  nameLabel: string;
  onStartRename: () => void;
  onRename: (next: string | null) => void;
  /** After the name: what the row says about itself (a board's size), then buttons. */
  meta?: ReactNode;
  buttons?: ReactNode;
  moreTitle: string;
  moreLabel: string;
  drag: RowDrag;
  onSelect: () => void;
  onMenu: (x: number, y: number) => void;
  onDoubleClick?: () => void;
  /** Keys the row handles before the common ones (Alt + arrows move the piece). Return true when handled. */
  onKey?: (e: KeyboardEvent<HTMLElement>) => boolean;
  /** Extra attributes for the row (aria-level and the like). */
  extra?: Record<string, string | number | boolean | undefined>;
  style?: CSSProperties;
}

/** One row: grip, picture, name (double-click to rename), what it says, its buttons and the "..." menu. */
export function PieceRow(p: PieceRowProps) {
  const { id, drag } = p;
  return (
    <div
      className={`tl-layer${p.active ? ' is-active' : ''}${p.dim ? ' is-hidden' : ''}${p.inFolder ? ' in-folder' : ''}${p.drag.dropMark ? ` drop-${p.drag.dropMark}` : ''}${p.className ? ' ' + p.className : ''}`}
      style={{ height: p.h, ['--depth' as string]: p.depth ?? 0, ...p.style }}
      draggable={!p.editing}
      {...{ [p.attr]: id }}
      data-row=""
      role="treeitem"
      tabIndex={0}
      aria-level={(p.depth ?? 0) + 1}
      aria-selected={p.active}
      aria-label={p.label}
      aria-current={p.active ? 'true' : undefined}
      onClick={p.onSelect}
      onDoubleClick={p.onDoubleClick}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          e.stopPropagation();
          p.onSelect();
          return;
        }
        if (p.onKey?.(e)) return;
        walkRows(e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        p.onSelect();
        p.onMenu(e.clientX, e.clientY);
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        drag.onDragStart(id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        drag.onDragOver(id, e.clientY < r.top + r.height / 2 ? 'above' : 'below');
      }}
      onDrop={(e) => {
        e.preventDefault();
        drag.onDrop(id);
      }}
      onDragEnd={drag.onDragEnd}
      {...p.extra}
    >
      <span className="tl-grip" aria-hidden="true">
        <Icon name="grip" size={12} />
      </span>
      {p.before}
      {p.lead}
      {p.editing ? (
        <InlineName label={p.nameLabel} value={p.name} onDone={p.onRename} />
      ) : (
        <span className="tl-layer-name" title={p.nameTitle ?? 'Double-click to rename'} onDoubleClick={(e) => (e.stopPropagation(), p.onStartRename())}>
          {p.name}
          {p.tags}
        </span>
      )}
      {/* A space between the name and the small print, so the words read apart to a screen reader and to a checker. */}
      {p.meta ? <> {p.meta}</> : null}
      {p.buttons}
      <button
        type="button"
        className="tl-icon-btn tl-more"
        title={p.moreTitle}
        aria-label={p.moreLabel}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          p.onSelect();
          p.onMenu(r.left, r.bottom + 2);
        }}
      >
        <Icon name="more" size={16} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- the menu

/** The part of the right-click menu both lists share: rename, duplicate, delete, then move up and down. */
export function pieceMenuBasics(o: {
  thing: string;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  up: { label: string; disabled: boolean; run: () => void };
  down: { label: string; disabled: boolean; run: () => void };
}): MenuItem[] {
  return [
    { label: 'Rename', onClick: o.onRename },
    { label: `Duplicate ${o.thing}`, onClick: o.onDuplicate },
    { label: `Delete ${o.thing}`, danger: true, disabled: !o.canDelete, onClick: o.onDelete },
    { separator: true },
    { label: o.up.label, disabled: o.up.disabled, onClick: o.up.run },
    { label: o.down.label, disabled: o.down.disabled, onClick: o.down.run },
  ];
}
