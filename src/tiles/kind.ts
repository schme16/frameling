// Tilemaps as a kind of drawing: how they are drawn and flattened to pixels. Registered for good when the tiles folder
// loads, so a file with a level still draws, exports and saves whether or not the Tiles feature is switched on (that
// only hides the panel, tools and commands).
import { registerDrawingKind } from '../core/layerKinds';
import type { TilemapDrawing } from '../core/format';
import { drawTilemap } from './map';
import { flattenTilemap } from './model';

registerDrawingKind<TilemapDrawing>({
  kind: 'tilemap',
  draw: (g, doc, d, pixelSize, frame, pixelCanvas) => drawTilemap(g, doc, d, pixelSize, frame, pixelCanvas),
  flatten: flattenTilemap,
});
