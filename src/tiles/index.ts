// Tiles: the Tileset panel, tile tools, tile mode, tilemap layers and the tileset export. A feature that can be turned
// off (Preferences > Features). How a tilemap is drawn and flattened is registered for good by kind.ts, so a drawing
// that holds a level still draws, exports and saves with the feature off; what goes is the panel, the tools, the
// commands, the lesson, help and the level templates.
import { lazyPanel } from '../core/lazy';
import { defineFeature } from '../features/feature';
import './kind';
import { tileCommands } from './commands';
import { tilesHelp } from './help';
import { setTileUi } from './state';
import { leaveTileEdit } from './tileEdit';
import { tileTools } from './tools';
import { layerOf } from '../ui/panelInfo';

export const tilesFeature = defineFeature({
  id: 'tiles',
  name: 'Tiles',
  about: 'Tilemaps and tilesets for building game levels.',
  optional: true,
  commands: tileCommands,
  panels: [{ id: 'tileset', title: 'Tileset', icon: 'tiles', component: lazyPanel(() => import('./TilesetPanel').then((m) => m.TilesetPanel)), zone: 'right', order: 30, help: 'tileset' }],
  tools: tileTools,
  help: tilesHelp,
  templates: ['tileset', 'blank-level'],
  sections: {
    tileset: {
      blurb: 'The tiles you paint tile maps with, and making new ones.',
      group: 'properties',
      section: true,
      relevant: (s) => layerOf(s)?.kind === 'tilemap' || s.ui.tool.startsWith('tile'),
      idle: 'Pick a tile map layer',
      keywords: ['tiles', 'tile map', 'level'],
    },
  },
  // A tileset, or any tilemap drawing (so a level opens with its tiles ready).
  usedBy: (doc) => (doc.tileset?.tiles.length ?? 0) > 0 || Object.values(doc.drawings).some((d) => d.kind === 'tilemap'),
  // Leaves tile editing and tile mode, so the canvas is not left showing what the feature is no longer there to change.
  deactivate() {
    leaveTileEdit();
    setTileUi({ tileMode: false, sizeForm: false });
  },
});
