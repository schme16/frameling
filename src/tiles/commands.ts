import { findLayer } from '../core/doc';
import type { Command } from '../core/registry';
import { store, type State } from '../core/store';
import { fit, isAutoFit } from '../canvas/controller';
import { showPanel } from '../ui/dock';
import { currentChoice, setChoice } from '../core/choices';
import { AUTO_EDGES, type AutoEdgesChoice } from './choices';
import { hasTerrainTiles } from './terrain';
import { findTile, mirrorFlags, rotateFlags } from './model';
import * as ops from './ops';
import { getTileUi, setTileUi } from './state';

const hasTiles = () => (store().rootDoc().tileset?.tiles.length ?? 0) > 0;
const hasBrush = () => !!findTile(store().rootDoc().tileset, getTileUi().brush);
/** Turning keys only mean something on a tilemap layer, so they stay free for other tools elsewhere. */
const onMap = (s: State) => hasTiles() && findLayer(s.doc, s.ui.activeLayerId)?.kind === 'tilemap';

/** The tile the shape, value and terrain commands work on: the one open on the canvas, else the one you paint with. */
const targetKey = (): number => ops.editingTileKey() || getTileUi().brush;
const hasTarget = () => !!findTile(store().rootDoc().tileset, targetKey());
const hasShapes = () => !!ops.tileProps(targetKey()).collision?.shapes.length;
const hasTerrains = () => (store().rootDoc().tileset?.terrains?.length ?? 0) > 0;
const inTerrain = () => hasTarget() && ops.tileProps(targetKey()).terrain !== undefined;
const terrainChosen = (): number => {
  const list = store().rootDoc().tileset?.terrains ?? [];
  return list.some((t) => t.id === getTileUi().terrain) ? getTileUi().terrain : (list[0]?.id ?? 0);
};

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
    id: 'tiles.solid',
    label: 'Make the tile solid (whole tile blocks)',
    category: 'Tiles',
    description: 'Gives the tile a collision box over all of it, so a game treats it as a wall or floor. Exports into Godot\'s TileSet.',
    help: 'tile-collision',
    keywords: ['collision', 'solid', 'wall', 'physics', 'block', 'hitbox', 'godot'],
    enabled: hasTarget,
    run: () => {
      ops.solidTile(targetKey());
      showPanel('tileset');
    },
  },
  {
    id: 'tiles.drawBox',
    label: 'Draw a collision box on the tile',
    category: 'Tiles',
    keys: ['Alt+Shift+B'],
    description: 'Opens the tile and lets you drag out the box it blocks things with (half a tile for a ledge, a thin strip for a spike).',
    help: 'tile-collision',
    keywords: ['collision', 'hitbox', 'physics', 'box', 'shape', 'platform'],
    enabled: hasTarget,
    run: () => {
      ops.drawShape(targetKey(), 'box');
      showPanel('tileset');
    },
  },
  {
    id: 'tiles.drawShape',
    label: 'Draw a collision shape on the tile',
    category: 'Tiles',
    description: 'Opens the tile and lets you click out the corners of a many-sided shape (a slope, a spike). Click the first corner again, or press Enter, to close it.',
    help: 'tile-collision',
    keywords: ['collision', 'polygon', 'slope', 'physics', 'shape', 'spike'],
    enabled: hasTarget,
    run: () => {
      ops.drawShape(targetKey(), 'polygon');
      showPanel('tileset');
    },
  },
  {
    id: 'tiles.clearShapes',
    label: 'Clear the tile\'s collision shapes',
    category: 'Tiles',
    description: 'Takes away what the tile blocks, so it is only a picture again.',
    help: 'tile-collision',
    keywords: ['collision', 'remove', 'physics'],
    enabled: hasShapes,
    run: () => void ops.clearShapes(targetKey()),
  },
  {
    id: 'tiles.oneWay',
    label: 'One-way platform (tile)',
    category: 'Tiles',
    description: 'Things land on the tile from above and jump up through it from below. Needs a collision shape.',
    help: 'tile-collision',
    keywords: ['platform', 'one way', 'jump through', 'collision', 'physics'],
    enabled: hasShapes,
    checked: () => !!ops.tileProps(targetKey()).collision?.oneWay,
    run: () => void ops.setOneWay(targetKey(), !ops.tileProps(targetKey()).collision?.oneWay),
  },
  {
    id: 'tiles.showShapes',
    label: 'Show collision shapes over the level',
    category: 'View',
    // C for collision. Alt+Shift+K belongs to Remove bone, which has K, Alt+K and Alt+Shift+K as a family.
    keys: ['Alt+Shift+C'],
    description: 'Draws every tile\'s collision shape over a tile map, so you can see what a game will treat as solid.',
    help: 'tile-collision',
    keywords: ['collision', 'hitbox', 'physics', 'debug', 'solid'],
    enabled: hasTiles,
    checked: () => getTileUi().showShapes,
    run: () => setTileUi({ showShapes: !getTileUi().showShapes }),
  },
  {
    id: 'tiles.addValue',
    label: 'Add a custom value to tiles...',
    category: 'Tiles',
    description: 'A named value every tile can carry (damage, solid, sound), set per tile in the Tileset panel. Exports into Godot\'s custom data.',
    help: 'tile-values',
    keywords: ['custom data', 'property', 'damage', 'metadata', 'godot', 'value'],
    enabled: hasTiles,
    run: () => {
      showPanel('tileset');
      setTileUi({ valueForm: true });
    },
  },
  {
    id: 'tiles.addTerrain',
    label: 'Add a terrain (grass, water, walls...)',
    category: 'Tiles',
    description: 'A kind of ground whose tiles fit together by their edges. Paint with one of its tiles and the right edges and corners pick themselves.',
    help: 'tile-terrains',
    keywords: ['autotile', 'auto tile', 'terrain', 'edges', 'corners', 'wang', 'bitmask', 'godot'],
    enabled: hasTiles,
    run: () => {
      ops.addTerrain();
      showPanel('tileset');
    },
  },
  {
    id: 'tiles.makeEdgeTiles',
    label: 'Make a set of edge tiles for a terrain',
    category: 'Tiles',
    description: 'Draws every edge and corner tile for the picked terrain in its colour (47 for corners and sides, 16 for the others), ready to paint with. Draw over them to make them yours.',
    help: 'tile-terrains',
    keywords: ['autotile', '47', 'blob', 'edges', 'terrain', 'starter'],
    enabled: hasTerrains,
    run: () => {
      const n = ops.makeEdgeTiles(terrainChosen());
      if (n) showPanel('tileset');
    },
  },
  {
    id: 'tiles.guessEdges',
    label: 'Guess the tile\'s edges from its picture',
    category: 'Tiles',
    description: 'Looks at where the tile is painted and marks which sides and corners touch its terrain. For tiles drawn on a see-through background.',
    help: 'tile-terrains',
    keywords: ['terrain', 'edges', 'autotile', 'bitmask'],
    enabled: inTerrain,
    run: () => void ops.guessEdges(targetKey()),
  },
  {
    id: 'tiles.autoEdges',
    label: 'Pick edge tiles for me while painting',
    category: 'Tiles',
    keys: ['Alt+Shift+E'],
    description: 'With this on, painting with a tile of a terrain swaps it and its neighbours for the edge or corner that fits. Erasing heals the edges too.',
    help: 'tile-terrains',
    keywords: ['autotile', 'auto tile', 'terrain', 'edges', 'corners', 'smart'],
    enabled: () => hasTerrainTiles(store().rootDoc().tileset),
    checked: () => currentChoice<AutoEdgesChoice>(AUTO_EDGES) === 'on',
    run: () => setChoice(AUTO_EDGES, currentChoice<AutoEdgesChoice>(AUTO_EDGES) === 'on' ? 'off' : 'on'),
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

