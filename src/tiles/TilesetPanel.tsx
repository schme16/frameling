// The Tileset panel: every tile in the document. Click one to paint with it, double-click to draw it on the canvas.
import { useState } from 'react';
import { ActionButton, Tip } from '../canvas/controls';
import { store, useStore } from '../core/store';
import { getCommand } from '../core/registry';
import { Icon } from '../ui/icons';
import { findTile, tileDrawingAt } from './model';
import * as ops from './ops';
import { setTileUi, useTileUi } from './state';
import { TileThumb } from './TileThumb';
import './tiles.css';

const run = (id: string) => void getCommand(id)?.run();

function SizeForm({ w, h, onDone }: { w: number; h: number; onDone: () => void }) {
  const [tw, setW] = useState(String(w));
  const [th, setH] = useState(String(h));
  const apply = () => {
    ops.setTileSize(Number(tw), Number(th));
    onDone();
  };
  return (
    <form
      className="tz-size-form"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label>
        Width
        <input type="number" min={1} max={256} value={tw} onChange={(e) => setW(e.target.value)} data-autofocus />
      </label>
      <span aria-hidden="true">×</span>
      <label>
        Height
        <input type="number" min={1} max={256} value={th} onChange={(e) => setH(e.target.value)} />
      </label>
      <button type="submit" className="cv-action">
        Set
      </button>
      <button type="button" className="cv-action" onClick={onDone}>
        Cancel
      </button>
      <small>Tiles that already exist are cropped or padded from their top-left corner.</small>
    </form>
  );
}

export function TilesetPanel() {
  // While a tile is open, the panel shows the whole document with that tile as it is right now.
  const doc = useStore(() => store().rootDoc());
  const frame = useStore((s) => s.ui.frame);
  const nested = useStore(() => store().nestedTag());
  const editing = nested ? ops.editingTileKey() : 0;
  const { brush, tileMode } = useTileUi((s) => s);
  const [sizing, setSizing] = useState(false);
  const [renaming, setRenaming] = useState(0);
  const [drag, setDrag] = useState<{ key: number; over: number } | null>(null);
  const ts = doc.tileset;
  const tiles = ts?.tiles ?? [];
  const chosen = findTile(ts, brush) ? brush : 0;

  return (
    <div className="tz-panel" data-help="tileset">
      {editing ? (
        <div className="tz-editing" role="status">
          <Icon name="pixel" size={16} />
          <span>
            Drawing <b>{findTile(ts, editing)?.name}</b>
          </span>
          <button type="button" className="cv-action tz-done" onClick={() => ops.finishTileEdit()} data-command="tiles.done">
            <Icon name="check" size={14} /> Done
          </button>
        </div>
      ) : null}

      <div className="tz-bar">
        <button type="button" className="tz-icon" title="New tile" aria-label="New tile" data-command="tiles.new" onClick={() => run('tiles.new')}>
          <Icon name="plus" size={16} />
        </button>
        <button type="button" className="tz-icon" title="Duplicate tile" aria-label="Duplicate tile" disabled={!chosen} onClick={() => run('tiles.duplicate')}>
          <Icon name="duplicate" size={16} />
        </button>
        <button type="button" className="tz-icon" title="Draw this tile on the canvas" aria-label="Draw tile" disabled={!chosen} onClick={() => run('tiles.edit')}>
          <Icon name="pencil" size={16} />
        </button>
        <button type="button" className="tz-icon" title="Delete tile" aria-label="Delete tile" disabled={!chosen} onClick={() => run('tiles.delete')}>
          <Icon name="trash" size={16} />
        </button>
        <span className="tz-grow" />
        <button
          type="button"
          className={`tz-icon${tileMode ? ' is-on' : ''}`}
          title="Tile mode: show the drawing repeated around itself, and wrap drawing across the edges (Shift+T)"
          aria-label="Tile mode"
          aria-pressed={tileMode}
          data-command="tiles.tileMode"
          onClick={() => run('tiles.tileMode')}
        >
          <Icon name="tile-mode" size={16} />
        </button>
        <button type="button" className="tz-size" title="Change the tile size" onClick={() => setSizing((v) => !v)}>
          {ts ? `${ts.tileWidth} × ${ts.tileHeight}` : '16 × 16'}
        </button>
      </div>
      {sizing && <SizeForm w={ts?.tileWidth ?? 16} h={ts?.tileHeight ?? 16} onDone={() => setSizing(false)} />}

      {tiles.length ? (
        <div className="tz-grid" role="listbox" aria-label="Tiles">
          {tiles.map((t, i) => {
            const d = tileDrawingAt(doc, t, frame);
            const mark = drag && drag.over === i && drag.key !== t.key;
            return (
              <div
                key={t.key}
                role="option"
                aria-selected={t.key === chosen}
                tabIndex={0}
                className={`tz-tile${t.key === chosen ? ' is-chosen' : ''}${t.key === editing ? ' is-editing' : ''}${mark ? ' is-drop' : ''}`}
                title={`${t.name}${t.frames.length > 1 ? ` (${t.frames.length} frames)` : ''}. Click to paint with it, double-click to draw it.`}
                draggable={renaming !== t.key}
                onClick={() => ops.pickTile(t.key)}
                onDoubleClick={() => ops.editTile(t.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    ops.editTile(t.key);
                  } else if (e.key === ' ') {
                    e.preventDefault();
                    ops.pickTile(t.key);
                  } else if (e.key === 'F2') {
                    e.preventDefault();
                    setRenaming(t.key);
                  }
                }}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(t.key));
                  setDrag({ key: t.key, over: i });
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (drag && drag.over !== i) setDrag({ ...drag, over: i });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag) ops.moveTile(drag.key, i);
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
              >
                <TileThumb drawing={d} size={48} label={t.name} />
                {renaming === t.key ? (
                  <input
                    className="tz-name-input"
                    aria-label="Tile name"
                    defaultValue={t.name}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        ops.renameTile(t.key, e.currentTarget.value);
                        setRenaming(0);
                      } else if (e.key === 'Escape') setRenaming(0);
                    }}
                    onBlur={(e) => {
                      ops.renameTile(t.key, e.currentTarget.value);
                      setRenaming(0);
                    }}
                  />
                ) : (
                  <span className="tz-name" onDoubleClick={(e) => (e.stopPropagation(), setRenaming(t.key))} title="Double-click to rename">
                    {t.name}
                  </span>
                )}
                {t.frames.length > 1 && (
                  <span className="tz-badge" aria-label={`${t.frames.length} frames`}>
                    {t.frames.length}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tz-empty">
          <Tip>Tiles are small pictures you paint levels with: grass, walls, water. Make one, draw it, then paint it onto a tilemap layer.</Tip>
          <ActionButton onClick={() => run('tiles.newAndDraw')}>Make my first tile</ActionButton>
        </div>
      )}
      {tiles.length > 0 && !doc.layers.some((l) => l.kind === 'tilemap') && (
        <div className="tz-hint">
          <Tip>To paint a level with these tiles, add a tilemap layer.</Tip>
          <ActionButton onClick={() => run('tiles.addLayer')}>Add a tilemap layer</ActionButton>
        </div>
      )}
      {tiles.length > 0 && (
        <Tip>
          Click a tile to paint with it. Double-click to draw it. Drag to reorder.{' '}
          <button type="button" className="tz-link" onClick={() => (setTileUi({ brush: chosen }), setRenaming(chosen))} disabled={!chosen}>
            Rename
          </button>
        </Tip>
      )}
    </div>
  );
}
