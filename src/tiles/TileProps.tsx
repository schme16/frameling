// The Tileset panel's part for the tile you picked: what it blocks, its custom values, and its terrain edges.
import { useState } from 'react';
import { ActionButton, Tip } from '../canvas/controls';
import type { PeeringBit, Terrain, TileDataType, Tile, Tileset } from '../core/format';
import { getCommand } from '../core/registry';
import { Icon } from '../ui/icons';
import { DATA_TYPES, dataDefault } from './data';
import { tileDrawingAt } from './model';
import * as ops from './ops';
import { PEERING, TERRAIN_MODES, modeOf, modeUses } from './terrain';
import { setTileUi, useTileUi } from './state';
import { TileThumb } from './TileThumb';
import type { Doc } from '../core/format';

const run = (id: string) => void getCommand(id)?.run();

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <details className="tz-sec" data-sec={id} open>
      <summary>
        <span>{title}</span>
        {hint ? <small>{hint}</small> : null}
      </summary>
      <div className="tz-sec-body">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------- collision

function Collision({ tile }: { tile: Tile }) {
  const c = tile.collision;
  const n = c?.shapes.length ?? 0;
  return (
    <Section id="collision" title="Collision" hint={n ? (n === 1 ? '1 shape' : `${n} shapes`) : 'blocks nothing'}>
      <div className="tz-row">
        <ActionButton onClick={() => run('tiles.solid')} title="One box over the whole tile">
          Whole tile
        </ActionButton>
        <ActionButton onClick={() => run('tiles.drawBox')} title="Open the tile and drag out a box">
          Box
        </ActionButton>
        <ActionButton onClick={() => run('tiles.drawShape')} title="Open the tile and click out the corners of a shape">
          Shape
        </ActionButton>
        <ActionButton onClick={() => run('tiles.clearShapes')} disabled={!n}>
          Clear
        </ActionButton>
      </div>
      <label className="tz-check">
        <input type="checkbox" checked={!!c?.oneWay} disabled={!n} onChange={(e) => ops.setOneWay(tile.key, e.target.checked)} />
        One-way platform (land on it, jump up through it)
      </label>
    </Section>
  );
}

// ---------------------------------------------------------------- custom values

function ValueRow({ ts, tile, name, type }: { ts: Tileset; tile: Tile; name: string; type: TileDataType }) {
  const [edit, setEdit] = useState(false);
  const v = tile.data?.[name];
  const shown = v === undefined ? dataDefault(type) : v;
  return (
    <div className="tz-value">
      <div className="tz-value-main">
        <button type="button" className="tz-link" title="Rename this value, change what it holds, or remove it" onClick={() => setEdit((x) => !x)}>
          {name}
        </button>
        {type === 'bool' ? (
          <input type="checkbox" aria-label={name} checked={!!shown} onChange={(e) => ops.setTileValue(tile.key, name, e.target.checked)} />
        ) : (
          <input
            key={`${tile.key}-${name}-${String(v)}`}
            className="tz-value-input"
            aria-label={name}
            type={type === 'string' ? 'text' : 'number'}
            step={type === 'int' ? 1 : 'any'}
            defaultValue={v === undefined ? '' : String(v)}
            placeholder={String(dataDefault(type))}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            onBlur={(e) => {
              if (e.currentTarget.value !== (v === undefined ? '' : String(v))) ops.setTileValue(tile.key, name, e.currentTarget.value);
            }}
          />
        )}
      </div>
      {edit && (
        <div className="tz-value-edit">
          <input
            aria-label="Value name"
            defaultValue={name}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            onBlur={(e) => e.currentTarget.value !== name && ops.renameValue(name, e.currentTarget.value)}
          />
          <select aria-label="What it holds" value={type} onChange={(e) => ops.retypeValue(name, e.target.value as TileDataType)}>
            {DATA_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="button" className="tz-icon" title="Remove this value from every tile" aria-label={`Remove ${name}`} onClick={() => ops.removeValue(name)}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function AddValue({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<TileDataType>('int');
  const add = () => {
    ops.addValue(name || 'value', type);
    setName('');
    onDone();
  };
  return (
    <form
      className="tz-value-edit"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input aria-label="New value name" placeholder="damage, solid, sound..." value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
      <select aria-label="What it holds" value={type} onChange={(e) => setType(e.target.value as TileDataType)}>
        {DATA_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <button type="submit" className="cv-action">
        Add
      </button>
    </form>
  );
}

function Values({ ts, tile }: { ts: Tileset; tile: Tile }) {
  const open = useTileUi((s) => s.valueForm);
  const layers = ts.dataLayers ?? [];
  return (
    <Section id="values" title="Custom values" hint={layers.length ? `${layers.length}` : 'none yet'}>
      {layers.map((l) => (
        <ValueRow key={l.name} ts={ts} tile={tile} name={l.name} type={l.type} />
      ))}
      {open || !layers.length ? (
        <AddValue onDone={() => setTileUi({ valueForm: false })} />
      ) : (
        <div className="tz-row">
          <ActionButton onClick={() => setTileUi({ valueForm: true })}>Add a value</ActionButton>
        </div>
      )}
      {!layers.length && <Tip stays>Values travel with the tile into Godot: damage, solid, sound, anything you name.</Tip>}
    </Section>
  );
}

// ---------------------------------------------------------------- terrain

const CELLS: (PeeringBit | 'centre')[] = ['top-left', 'top', 'top-right', 'left', 'centre', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const BIT_WORDS: Record<PeeringBit, string> = {
  'top-left': 'top left corner',
  top: 'top side',
  'top-right': 'top right corner',
  left: 'left side',
  right: 'right side',
  'bottom-left': 'bottom left corner',
  bottom: 'bottom side',
  'bottom-right': 'bottom right corner',
};

function Edges({ doc, ts, tile, paint, terrains }: { doc: Doc; ts: Tileset; tile: Tile; paint: number; terrains: Terrain[] }) {
  const mode = modeOf(ts);
  const colour = (id: number | undefined) => terrains.find((t) => t.id === id)?.color;
  return (
    <div className="tz-edges" role="group" aria-label="Which sides and corners touch the terrain">
      {CELLS.map((c) =>
        c === 'centre' ? (
          <div key={c} className="tz-edge-centre" style={{ borderColor: colour(tile.terrain?.id) }}>
            <TileThumb drawing={tileDrawingAt(doc, tile, 0)} size={32} label={tile.name} />
          </div>
        ) : (
          <button
            key={c}
            type="button"
            className={`tz-edge${tile.terrain?.bits?.[c] !== undefined ? ' is-on' : ''}${PEERING.find((p) => p.bit === c)!.corner ? ' is-corner' : ''}`}
            style={tile.terrain?.bits?.[c] !== undefined ? { background: colour(tile.terrain.bits[c]) } : undefined}
            disabled={!modeUses(mode, c)}
            aria-label={BIT_WORDS[c]}
            aria-pressed={tile.terrain?.bits?.[c] !== undefined}
            title={modeUses(mode, c) ? `Does the ${BIT_WORDS[c]} touch the terrain? Click to switch.` : 'This way of matching ignores it.'}
            onClick={() => ops.setEdge(tile.key, c, tile.terrain?.bits?.[c] === paint ? undefined : paint)}
          />
        ),
      )}
    </div>
  );
}

function Terrains({ doc, ts, tile }: { doc: Doc; ts: Tileset; tile: Tile | undefined }) {
  const chosen = useTileUi((s) => s.terrain);
  const terrains = ts.terrains ?? [];
  const paint = terrains.some((t) => t.id === chosen) ? chosen : (tile?.terrain?.id ?? terrains[0]?.id ?? 0);
  const mine = terrains.find((t) => t.id === tile?.terrain?.id);
  return (
    <Section id="terrain" title="Terrain" hint={terrains.length ? `${terrains.length}` : 'none yet'}>
      {!terrains.length ? (
        <Tip stays>A terrain is a kind of ground (grass, water, wall). Tiles of one terrain swap to the right edge or corner as you paint.</Tip>
      ) : (
        <>
          <div className="tz-terrains">
            {terrains.map((t) => (
              <div key={t.id} className={`tz-terrain${t.id === paint ? ' is-chosen' : ''}`}>
                <input type="color" aria-label={`${t.name} colour`} value={t.color} onChange={(e) => ops.recolourTerrain(t.id, e.target.value)} />
                <input
                  key={`${t.id}:${t.name}`}
                  className="tz-terrain-name"
                  aria-label="Terrain name"
                  defaultValue={t.name}
                  onFocus={() => setTileUi({ terrain: t.id })}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  onBlur={(e) => e.currentTarget.value !== t.name && ops.renameTerrain(t.id, e.currentTarget.value)}
                />
                <button type="button" className="tz-icon" title={`Make edge tiles for ${t.name}`} aria-label={`Make edge tiles for ${t.name}`} onClick={() => (setTileUi({ terrain: t.id }), run('tiles.makeEdgeTiles'))}>
                  <Icon name="tiles" size={14} />
                </button>
                <button type="button" className="tz-icon" title={`Delete ${t.name}`} aria-label={`Delete ${t.name}`} onClick={() => ops.deleteTerrain(t.id)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
          <label className="tz-field">
            Match on
            <select aria-label="How edges match" value={modeOf(ts)} onChange={(e) => ops.setTerrainMode(e.target.value as never)}>
              {TERRAIN_MODES.map((m) => (
                <option key={m.value} value={m.value} title={m.detail}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {tile ? (
            <label className="tz-field">
              This tile is
              <select aria-label="The terrain this tile is part of" value={tile.terrain?.id ?? ''} onChange={(e) => ops.setTerrainOf(tile.key, e.target.value === '' ? undefined : Number(e.target.value))}>
                <option value="">no terrain</option>
                {terrains.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Tip stays>Pick a tile above to say which terrain it is, and which edges touch it.</Tip>
          )}
          {tile && mine && (
            <>
              <Edges doc={doc} ts={ts} tile={tile} paint={paint} terrains={terrains} />
              <div className="tz-row">
                <ActionButton onClick={() => run('tiles.guessEdges')} title="Fill in the edges by looking at where the tile is painted (for tiles drawn on a see-through background)">
                  Guess from the picture
                </ActionButton>
              </div>
              <Tip stays>Click the squares around the tile that touch {terrains.find((t) => t.id === paint)?.name ?? 'the terrain'}.</Tip>
            </>
          )}
        </>
      )}
      <div className="tz-row">
        <ActionButton onClick={() => run('tiles.addTerrain')}>Add a terrain</ActionButton>
      </div>
    </Section>
  );
}

export function TileProps({ doc, tile }: { doc: Doc; tile: Tile | undefined }) {
  const ts = doc.tileset!;
  return (
    <div className="tz-props" data-help="tile-collision">
      {tile ? (
        <>
          <div className="tz-props-title">
            <b>{tile.name}</b>
          </div>
          <Collision tile={tile} />
          <Values ts={ts} tile={tile} />
        </>
      ) : (
        <Tip stays>Pick a tile to say what it blocks and give it custom values.</Tip>
      )}
      <Terrains doc={doc} ts={ts} tile={tile} />
    </div>
  );
}
