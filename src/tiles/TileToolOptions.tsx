// Tool options for the tile tools: which tile you're painting with, and how it's turned.
import { ActionButton, Field, Tip } from '../canvas/controls';
import { useStore } from '../core/store';
import { getCommand } from '../core/registry';
import { useChoice } from '../core/choices';
import { AUTO_EDGES, type AutoEdgesChoice } from './choices';
import { findTile, tileDrawingAt } from './model';
import { hasTerrainTiles } from './terrain';
import { useTileUi } from './state';
import { TileThumb } from './TileThumb';
import './tiles.css';

const run = (id: string) => void getCommand(id)?.run();

export function TileToolOptions() {
  const tileset = useStore((s) => s.doc.tileset);
  const drawings = useStore((s) => s.doc.drawings);
  const tool = useStore((s) => s.ui.tool);
  const { brush, flags } = useTileUi((s) => s);
  const auto = useChoice<AutoEdgesChoice>(AUTO_EDGES) === 'on';
  const tile = findTile(tileset, brush) ?? tileset?.tiles[0];
  const square = !!tileset && tileset.tileWidth === tileset.tileHeight;
  if (!tileset?.tiles.length) {
    return (
      <div className="cv-options">
        <Tip stays>There are no tiles yet. Make one in the Tileset panel, draw it, then paint with it here.</Tip>
        <ActionButton onClick={() => run('tiles.new')}>New tile</ActionButton>
      </div>
    );
  }
  const d = tile ? tileDrawingAt({ drawings, tileset } as never, tile, 0) : undefined;
  return (
    <div className="cv-options">
      <Field label="Painting with" value={tile?.name}>
        <div className="tz-brush">
          <TileThumb drawing={d} size={64} flags={tile?.key === brush ? flags : 0} label={tile?.name} />
          <div className="tz-brush-buttons">
            <ActionButton onClick={() => run('tiles.flipX')} title="Mirror left to right (Shift+H)">Flip left-right</ActionButton>
            <ActionButton onClick={() => run('tiles.flipY')} title="Mirror top to bottom (Shift+V)">Flip up-down</ActionButton>
            <ActionButton onClick={() => run('tiles.rotate')} disabled={!square} title={square ? 'A quarter turn clockwise (Shift+R)' : 'Only square tiles can turn.'}>
              Turn
            </ActionButton>
          </div>
        </div>
      </Field>
      {hasTerrainTiles(tileset) && (
        <Field label="Edges" value={auto ? 'picked for you' : 'as you paint them'}>
          <ActionButton onClick={() => run('tiles.autoEdges')} pressed={auto} title="Pick the edge and corner tiles that fit, as you paint (Alt+Shift+E)">
            {auto ? 'Auto edges: on' : 'Auto edges: off'}
          </ActionButton>
        </Field>
      )}
      <Tip>
        {tool === 'tile-rect'
          ? 'Drag to fill a rectangle with the tile. Alt+drag clears one.'
          : tool === 'tile-fill'
            ? 'Click to fill a joined-up area of the same tile (or of empty slots).'
            : tool === 'tile-eraser'
              ? 'Drag to clear tiles from the map.'
              : tool === 'tile-picker'
                ? 'Click a tile on the map to paint with it, turned the same way.'
                : 'Click or drag to place the tile. Shift+click draws a straight line. Alt+click picks up a tile from the map.'}
      </Tip>
    </div>
  );
}
