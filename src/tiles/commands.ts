import { findLayer } from '../core/doc';
import type { Command } from '../core/registry';
import { store, type State } from '../core/store';
import { fit, isAutoFit } from '../canvas/controller';
import { showPanel } from '../ui/dock';
import { findTile, mirrorFlags, rotateFlags } from './model';
import * as ops from './ops';
import { getTileUi, setTileUi } from './state';

const hasTiles = () => (store().rootDoc().tileset?.tiles.length ?? 0) > 0;
const hasBrush = () => !!findTile(store().rootDoc().tileset, getTileUi().brush);
/** Turning keys only mean something on a tilemap layer, so they stay free for other tools elsewhere. */
const onMap = (s: State) => hasTiles() && findLayer(s.doc, s.ui.activeLayerId)?.kind === 'tilemap';

function stepBrush(dir: 1 | -1): void {
  const list = store().rootDoc().tileset?.tiles ?? [];
  if (!list.length) return;
  const i = list.findIndex((t) => t.key === getTileUi().brush);
  const next = list[(i + dir + list.length) % list.length];
  ops.pickTile(next.key);
}

function square(): boolean {
  const ts = store().rootDoc().tileset;
  return !!ts && ts.tileWidth === ts.tileHeight;
}

export const tileCommands: Command[] = [
  {
    id: 'tiles.tileMode',
    label: 'Tile mode (repeat around the edges)',
    category: 'View',
    keys: ['Shift+T'],
    description: 'Shows your drawing repeated on every side, and drawing off one edge comes back on the other. For seamless tiles and patterns.',
    help: 'tile-mode',
    keywords: ['seamless', 'wrap', 'repeat', 'pattern', 'tiling', 'texture'],
    checked: () => getTileUi().tileMode,
    run: () => {
      setTileUi({ tileMode: !getTileUi().tileMode });
      if (isAutoFit()) fit(true);
    },
  },
  {
    id: 'tiles.addLayer',
    label: 'Add a tilemap layer',
    category: 'Layers',
    description: 'A layer you paint with tiles from the Tileset panel, for game levels.',
    help: 'tilemaps',
    keywords: ['tilemap', 'level', 'map', 'grid', 'tiles', 'layer'],
    run: () => {
      ops.addTilemapLayer();
      showPanel('tileset');
    },
  },
  {
    id: 'tiles.gridStart',
    label: 'Where the tile grid starts...',
    category: 'Tiles',
    description: 'For tiles that do not start at the stage corner: type where the first tile edge sits, or drag the handle on the canvas (it shows while the form is open, or with Alt held).',
    help: 'tile-grid',
    keywords: ['tile grid', 'grid start', 'grid origin', 'offset', 'tilemap', 'tile size'],
    run: () => {
      showPanel('tileset');
      setTileUi({ sizeForm: true });
    },
  },
  {
    id: 'tiles.new',
    label: 'New tile',
    category: 'Tiles',
    description: 'Adds an empty tile to the tileset.',
    help: 'tileset',
    keywords: ['tile', 'tileset', 'add'],
    run: () => {
      ops.newTile();
      showPanel('tileset');
    },
  },
  {
    id: 'tiles.newAndDraw',
    label: 'New tile and draw it',
    category: 'Drawing',
    description: 'Adds an empty tile and opens it on the canvas, ready to draw.',
    help: 'tileset',
    keywords: ['tile', 'tileset', 'add', 'draw'],
    run: () => {
      ops.newTile({ open: true });
      showPanel('tileset');
    },
  },
  {
    id: 'tiles.edit',
    label: 'Draw the tile',
    category: 'Tiles',
    description: 'Opens the tile you are painting with on the canvas, with tile mode on, so you can draw it.',
    help: 'tileset',
    keywords: ['edit tile', 'open tile'],
    enabled: hasBrush,
    run: () => void ops.editTile(getTileUi().brush),
  },
  {
    id: 'tiles.done',
    label: 'Done drawing the tile',
    category: 'Tiles',
    keys: ['Mod+Enter'],
    description: 'Puts the tile back in your document. Every map that uses it shows the change.',
    help: 'tileset',
    keywords: ['finish', 'close tile', 'back'],
    enabled: () => !!ops.editingTileKey(),
    run: () => ops.finishTileEdit(),
  },
  {
    id: 'tiles.duplicate',
    label: 'Duplicate tile',
    category: 'Tiles',
    description: 'A copy of the tile, to make a variation (grass with flowers, a cracked wall).',
    help: 'tileset',
    enabled: hasBrush,
    run: () => void ops.duplicateTile(),
  },
  {
    id: 'tiles.delete',
    label: 'Delete tile',
    category: 'Tiles',
    description: 'Removes the tile. Places in your maps that used it become empty (Undo brings them back).',
    help: 'tileset',
    enabled: hasBrush,
    run: () => void ops.deleteTile(),
  },
  {
    id: 'tiles.flipX',
    label: 'Flip tile left-right',
    category: 'Tiles',
    keys: ['Shift+H'],
    description: 'Paints the tile mirrored left to right.',
    help: 'tilemaps',
    keywords: ['mirror', 'flip horizontal'],
    enabled: onMap,
    run: () => setTileUi({ flags: mirrorFlags(getTileUi().flags, 'x') }),
  },
  {
    id: 'tiles.flipY',
    label: 'Flip tile up-down',
    category: 'Tiles',
    keys: ['Shift+V'],
    description: 'Paints the tile mirrored top to bottom.',
    help: 'tilemaps',
    keywords: ['mirror', 'flip vertical'],
    enabled: onMap,
    run: () => setTileUi({ flags: mirrorFlags(getTileUi().flags, 'y') }),
  },
  {
    id: 'tiles.rotate',
    label: 'Turn tile',
    category: 'Tiles',
    keys: ['Shift+R'],
    description: 'Paints the tile turned a quarter clockwise. Square tiles only.',
    help: 'tilemaps',
    keywords: ['rotate', 'turn', 'spin'],
    enabled: (s) => onMap(s) && square(),
    run: () => setTileUi({ flags: rotateFlags(getTileUi().flags) }),
  },
  {
    id: 'tiles.nextTile',
    label: 'Next tile',
    category: 'Tiles',
    description: 'Paint with the next tile in the tileset.',
    help: 'tilemaps',
    enabled: hasTiles,
    run: () => stepBrush(1),
  },
  {
    id: 'tiles.prevTile',
    label: 'Previous tile',
    category: 'Tiles',
    description: 'Paint with the tile before this one in the tileset.',
    help: 'tilemaps',
    enabled: hasTiles,
    run: () => stepBrush(-1),
  },
  {
    id: 'tiles.export',
    label: 'Export tileset...',
    category: 'Export',
    description: 'Your tiles on one picture, plus a Godot TileSet and level scene, JSON or Tiled files.',
    help: 'export-tileset',
    keywords: ['godot', 'tileset', 'tilemap', 'tiled', 'tres', 'tscn', 'atlas', 'level'],
    global: true,
    enabled: hasTiles,
    // The dialog loads on first use.
    run: () => void import('./ExportTilesetDialog').then((m) => m.openExportTilesetDialog()),
  },
];

