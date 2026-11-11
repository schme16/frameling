// Tiles: the Tileset panel, tile tools, tile mode, tilemap layers and the tileset export.
import { lazyPanel } from '../core/lazy';
import { registerPanel } from '../core/registry';
import './commands';
import './help';
import './tools';

registerPanel({ id: 'tileset', title: 'Tileset', icon: 'tiles', component: lazyPanel(() => import('./TilesetPanel').then((m) => m.TilesetPanel)), zone: 'right', order: 30, help: 'tileset' });
