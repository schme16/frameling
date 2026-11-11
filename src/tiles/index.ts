// Tiles: the Tileset panel, tile tools, tile mode, tilemap layers and the tileset export.
import { registerPanel } from '../core/registry';
import './commands';
import './help';
import './tools';
import { TilesetPanel } from './TilesetPanel';

registerPanel({ id: 'tileset', title: 'Tileset', icon: 'tiles', component: TilesetPanel, zone: 'right', order: 30, help: 'tileset' });
