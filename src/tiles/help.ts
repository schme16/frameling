import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'tileset',
    title: 'Tiles and the Tileset panel',
    section: 'Drawing',
    media: 'tileset.png',
    summary: 'Small pictures (grass, walls, water) that you paint game levels with. Make them and draw them in the Tileset panel.',
    keywords: ['tile', 'tileset', 'tiles', 'level', 'game', 'animated tile', 'tile size'],
    body: `A **tile** is a small square picture, like a patch of grass or a brick. A **tileset** is all of them together. You draw each tile once, then paint whole levels with them on a [tilemap layer](help:tilemaps).

## Make a tile

1. Open the **Tileset** panel (View > Tileset).
2. Press **+** (New tile), or **Make my first tile** when there are none yet.
3. **Double-click** the tile. It opens on the canvas, big, with [tile mode](help:tile-mode) on so you can see it repeat.
4. Draw it with the brush, eraser and paint bucket, like any pixel art.
5. Press **Done** at the top of the canvas (or **Ctrl+Enter**). Every place the tile is used updates.

Undo works while you draw the tile, and the whole visit counts as one step afterwards.

## The panel

- **Click** a tile to paint with it.
- **Double-click** it (or press **Enter**) to draw it.
- **Drag** tiles to put them in a different order. Maps don't change.
- **Double-click the name** (or press **F2**) to rename it.
- The buttons along the top: new, duplicate, draw, delete, [tile mode](help:tile-mode), and the **tile size** (16 × 16 to begin with). Changing the size crops or pads every tile from its top-left corner.

Deleting a tile empties the places it was used. Undo puts it all back.

## Animated tiles

Water, torches and conveyor belts can move. Open the tile and use the timeline as usual: add a key (**N**) for each new frame, and stretch a key to hold it longer. The tile plays everywhere it is used, and exports keep the frames and their timing. A number on the tile in the panel says how many frames it has.`,
  },
  {
    id: 'tilemaps',
    title: 'Tilemap layers and the tile tools',
    section: 'Drawing',
    media: 'tilemaps.png',
    summary: 'A layer you paint with tiles instead of colours, for game levels. Brush, rectangle, fill, eraser and pick.',
    keywords: ['tilemap', 'tile map', 'level', 'map', 'stamp', 'tile brush', 'flip', 'rotate', 'grid'],
    body: `A **tilemap layer** is a grid you paint with tiles from the [Tileset panel](help:tileset). Change a tile and every copy of it in the map changes too.

Add one with **Draw > Add a tilemap layer**, or from a layer's **⋯** menu in the timeline. It sits with your other layers, so you can draw a character on a pixel layer in front of it.

## The tile tools

On a tilemap layer the tool strip shows the tile tools. They use the same keys as the drawing tools:

| Tool | Key | What it does |
| --- | --- | --- |
| **Tile brush** | B | Click or drag to place the tile. **Shift+click** draws a straight line. **Alt+click** picks up a tile from the map. |
| **Tile rectangle** | R | Drag to fill a rectangle. **Alt+drag** clears one. |
| **Tile fill** | G | Fills a joined-up area of the same tile (or of empty slots). |
| **Tile eraser** | E | Drag to clear tiles. |
| **Pick tile** | I | Click a tile on the map to paint with it, turned the same way. |

A see-through copy of the tile follows the pointer, so you can see where it will land.

## Flipping and turning

Paint a tile mirrored or turned without drawing a new one:

- **Shift+H** flips it left to right.
- **Shift+V** flips it up and down.
- **Shift+R** turns it a quarter clockwise (square tiles only).

The buttons are in the Tool options panel too. Game engines get the same flips, so nothing needs redrawing there.

## Size

A tilemap layer is as big as the stage, in whole tiles. Its **pixel size** matches your pixel layers, so tiles and sprites line up. Tilemaps animate like any layer: add a key to change the map on a later frame.

To use the level in a game, see [Exporting a tileset](help:export-tileset).`,
  },
  {
    id: 'tile-mode',
    title: 'Tile mode (seamless drawing)',
    section: 'Drawing',
    media: 'tile-mode.png',
    summary: 'Shows your drawing repeated on every side, and drawing off one edge carries on at the other. For seamless tiles and patterns.',
    keywords: ['seamless', 'wrap', 'repeat', 'pattern', 'tiling', 'texture', 'tile mode'],
    body: `**Tile mode** shows eight copies of the stage around it, so you can see how your drawing looks when it repeats. A dashed frame marks the real one.

Turn it on with **View > Tile mode** or **Shift+T**. It comes on by itself when you open a tile from the [Tileset panel](help:tileset).

While it's on, pixel drawing **wraps**: a line that goes off the right edge comes back on the left, and the paint bucket fills across the edges too. That makes seams easy to fix, because you can draw right over them. You can draw on the copies as well; your pixels land in the matching place on the real stage.

Tile mode works on any pixel layer, so it's handy for backgrounds that scroll forever and patterns for fabric or wallpaper.`,
  },
  {
    id: 'export-tileset',
    title: 'Exporting a tileset (Godot, Tiled, JSON)',
    section: 'Exporting',
    media: 'export-tileset.png',
    summary: 'Your tiles on one picture, plus a ready-made Godot TileSet and a scene with your painted level.',
    keywords: ['godot', 'tileset', 'tilemap', 'tres', 'tscn', 'tiled', 'tmj', 'tsj', 'json', 'atlas', 'extrude', 'padding', 'level'],
    body: `**File > Export tileset...** saves your tiles as one picture, with files that tell a game engine where each tile is.

## Godot 4

Leave **Godot TileSet** and **Godot scene** ticked, pick a folder inside your Godot project, and press **Export**. You get:

- **name.png**: the tiles.
- **name.tres**: a TileSet. Animated tiles keep their frames and timing.
- **name.tscn**: a scene with one **TileMapLayer** for each of your tilemap layers, painted just like yours, flips and all. Drop it into a level.

The files point at **res://tiles/name.png** unless you type another place. Put the picture there (or change the path to where it will live) and Godot opens everything without any setting up. The scene turns off smoothing so pixel art stays crisp.

## The picture

- **Columns:** how many tiles across. Auto makes it roughly square. An animated tile's frames always sit side by side on one row.
- **Size:** whole-number scales keep every pixel square.
- **Padding:** empty pixels between tiles.
- **Extrude:** repeats each tile's edge pixels outwards. If you see thin lines between tiles in a game, export with an extrude of 1.

## Other engines

- **JSON** lists every tile's place in the picture, and every map as tile numbers.
- **Tiled** files (.tsj and .tmj) open in the Tiled map editor and in engines that read them.

Maps are saved as they are on the frame you're looking at.`,
  },
]);
