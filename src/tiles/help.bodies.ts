// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  tileset: `A **tile** is a small square picture, like a patch of grass or a brick. A **tileset** is all of them together. You draw each tile once, then paint whole levels with them on a [tilemap layer](help:tilemaps).

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
- The buttons along the top: new, duplicate, draw, delete, [tile mode](help:tile-mode), and the **tile size** (16 × 16 to begin with). Changing the size crops or pads every tile from its top-left corner. The same form has **Grid starts at x, y**, see [Where the tile grid starts](help:tile-grid).

Deleting a tile empties the places it was used. Undo puts it all back.

Under the tiles, the picked tile has **Collision** (what it blocks), **Custom values** and **Terrain** (edges that pick themselves). See [Collision shapes](help:tile-collision), [Custom values](help:tile-values) and [Terrains](help:tile-terrains).

## Animated tiles

Water, torches and conveyor belts can move. Open the tile and use the timeline as usual: add a key (**N**) for each new frame, and stretch a key to hold it longer. The tile plays everywhere it is used, and exports keep the frames and their timing. A number on the tile in the panel says how many frames it has.`,
  tilemaps: `A **tilemap layer** is a grid you paint with tiles from the [Tileset panel](help:tileset). Change a tile and every copy of it in the map changes too.

Add one with **Tools and layers > Add a tilemap layer**, or from a layer's **⋯** menu in the timeline. It sits with your other layers, so you can draw a character on a pixel layer in front of it.

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

## Where the grid starts

If your tiles do not start at the stage's top-left corner, see [Where the tile grid starts](help:tile-grid).

## Size

A tilemap layer is as big as the stage, in whole tiles. Its **pixel size** matches your pixel layers, so tiles and sprites line up. Tilemaps animate like any layer: add a key to change the map on a later frame.

To use the level in a game, see [Exporting a tileset](help:export-tileset).`,
  'tile-mode': `**Tile mode** shows eight copies of the stage around it, so you can see how your drawing looks when it repeats. A dashed frame marks the real one. The copies show at full strength, exactly as the tiles will repeat in a game. To make the tile you're drawing stand out, turn on **Fade tile copies** in **Preferences > General**.

Turn it on with **View > Tile mode** or **Shift+T**. It comes on by itself when you open a tile from the [Tileset panel](help:tileset).

While it's on, pixel drawing **wraps**: a line that goes off the right edge comes back on the left, and the paint bucket fills across the edges too. That makes seams easy to fix, because you can draw right over them. You can draw on the copies as well; your pixels land in the matching place on the real stage.

Tile mode works on any pixel layer, so it's handy for backgrounds that scroll forever and patterns for fabric or wallpaper.`,
  'tile-grid': `Most levels have a tile edge right at the top-left corner of the stage, and that is how Frameling starts. A drawing brought in from Aseprite can start its tiles a few pixels in. Tell Frameling where, and the tiles line up.

## Type it

1. Open the [Tileset panel](help:tileset) and press the **tile size** button (it says 16 × 16 to begin with).
2. Fill in **Grid starts at x, y**. They are pixel counts from the stage's top-left corner. **0, 0** means the tiles start at the corner.
3. Press **Set**.

## Or drag it

With a tile tool on a tilemap layer, hold **Alt** (or keep the tile size form open) and a **round handle** appears on the first tile corner. Drag it. It stays out of the way the rest of the time, so a click at the stage corner paints as usual. Blue lines show where the tiles will fall, and a message says where the grid starts when you let go.

## Good to know

- The grid can start anywhere inside the first tile. Pick a bigger number than the tile is wide and it stops at the last pixel.
- Tiles already on the map move with the grid. Nothing is lost.
- It is one step on the undo list.
- The Godot and Tiled exports use the same start, so the level lines up in the game too.

Related: [Tiles and the Tileset panel](help:tileset), [Tilemap layers](help:tilemaps).`,
  'tile-collision': `A tile can be more than a picture: give it a **collision shape** and a game treats it as something solid. A wall blocks, a floor holds you up, a spike hurts. The shape goes into Godot's TileSet, so a level is playable the moment you open it.

## Make a tile solid

1. Pick a tile in the [Tileset panel](help:tileset).
2. Open **Collision** under the tiles and press **Whole tile** (a box over all of it), or **Box** or **Shape** to draw your own.
3. **Box:** the tile opens big on the canvas. Drag to draw a box, snapped to pixels. Half a tile makes a ledge, a thin strip makes a spike.
4. **Shape:** click to place corners, then click the first corner again (or press **Enter**) to close it. **Backspace** takes back a corner. Good for slopes.
5. Press **Done** (or **Ctrl+Enter**) when you've finished the picture too. One tile can have several shapes.

## Changing a shape

- **Drag a corner** to move it. A box keeps its opposite corner still.
- **Click a shape** to pick it, then drag inside it to move it, or press **Delete** to remove it.
- **Clear** takes all the shapes away. Undo works the whole time.

## One-way platforms

Tick **One-way platform** and things land on the tile from above but jump up through it from below. It needs a shape first.

## See what is solid

**View > Show collision shapes over the level** (**Alt+Shift+K**) draws every tile's shape over your tile map in pink. A dashed line means one-way. Turned or flipped tiles show their shape turned or flipped too.

## Good to know

- A tile with a shape wears a small pink square in the panel.
- Duplicating a tile copies its shape. Changing the tile size pulls shapes inside the new size, and a whole-tile box stays whole.
- A game engine needs the files from [Exporting a tileset](help:export-tileset). In Godot the shapes arrive on a physics layer of the TileSet.

Related: [Custom values](help:tile-values), [Terrains](help:tile-terrains).`,
  'tile-values': `A **custom value** is a name you make up that every tile can carry: *damage*, *solid*, *sound*, *slippery*. You set it per tile, and a game reads it. A spike has damage 2, grass has none.

## Add one

1. Pick a tile in the [Tileset panel](help:tileset) and open **Custom values**.
2. Press **Add a value** (or use **Tools and layers > Tiles > Add a custom value to tiles...**).
3. Type a name and say what it holds: yes or no, a whole number, a number with decimals, or text. Press **Add**.

Every tile now has that value. Pick a tile and fill it in. A tile you leave alone has the usual empty one: no, 0, or nothing.

## Change it later

Click a value's name to rename it, change what it holds, or remove it from every tile. Changing what it holds converts the values you set where it can, and drops the rest.

## Where it goes

Godot gets the values as **custom data layers** on the TileSet, one per name, so a script can ask a tile what its damage is. Tiled gets them as properties, and the JSON export lists them on each tile.

## Good to know

- Names stay unique. A repeat gets a number added.
- Duplicating a tile copies its values.
- The values live with the tileset in your Frameling file, so an old file with no values opens as it always did.

Related: [Collision shapes](help:tile-collision), [Terrains](help:tile-terrains).`,
  'tile-terrains': `A **terrain** is a kind of ground: grass, water, a brick wall. Tiles of one terrain fit together by their edges, and when you paint, Frameling picks the edge or corner tile that fits what is next to it. Draw a blob of grass and its rim sorts itself out.

## Set one up

1. Open **Terrain** under the tiles in the [Tileset panel](help:tileset) and press **Add a terrain**. Give it a name and a colour.
2. Pick a tile and choose the terrain in **This tile is**.
3. Click the squares around the tile that touch the terrain. A filled square means that side or corner joins up. Corners are the round ones.

**The quick way:** press the little tiles button on the terrain's row. Frameling draws a whole set of edge tiles in its colour, already marked up, ready to paint with. Draw over them to make them yours.

**Another quick way:** for tiles you drew on a see-through background, press **Guess from the picture** and it marks the edges from where the tile is painted.

## Paint with it

Pick any tile of the terrain and use the **Tile brush**, **rectangle** or **fill**. The tile you place, and the ones around it, swap to the edge or corner that fits. The **eraser** heals the edges too. A tile that already fits is left alone, so a flower tile you put down on purpose stays.

The first time, Frameling tells you it is picking edges and lets you change that. Turn it on or off any time with **Alt+Shift+E**, the **Auto edges** button in Tool options, or Preferences > Behaviour.

## What to match on

**Corners and sides** is the full set of 47 tiles. **Sides only** and **Corners only** need 16. Pick it under **Match on**.

## Good to know

- A terrain tile with no tile that fits exactly uses the closest one.
- Godot gets a **terrain set** with your terrains and every tile's edges, so its own terrain painting works too.
- Deleting a terrain takes its tiles out of it. The tiles stay.

Related: [Collision shapes](help:tile-collision), [Custom values](help:tile-values).`,
  'export-tileset': `**File > Export > Export tileset...** saves your tiles as one picture, with files that tell a game engine where each tile is.

## Godot 4

Leave **Godot TileSet** and **Godot scene** ticked, pick a folder inside your Godot project, and press **Export**. You get:

- **name.png**: the tiles.
- **name.tres**: a TileSet. Animated tiles keep their frames and timing. Collision shapes become a physics layer, custom values become custom data layers, and terrains become a terrain set, so the level is playable straight away (see [Collision shapes](help:tile-collision), [Custom values](help:tile-values) and [Terrains](help:tile-terrains)).
- **name.tscn**: a scene with one **TileMapLayer** for each of your tilemap layers, painted just like yours, flips, turns and all. Each layer is scaled to its pixel size, so the level is the same size in Godot as in Frameling. Drop it into a level.

The files point at **res://tiles/name.png** unless you type another place. Put the picture there (or change the path to where it will live) and Godot opens everything without any setting up. The scene turns off smoothing so pixel art stays crisp.

## The picture

- **Columns:** how many tiles across. Auto makes it roughly square. An animated tile's frames always sit side by side on one row.
- **Size:** whole-number scales keep every pixel square.
- **Padding:** empty pixels between tiles.
- **Extrude:** repeats each tile's edge pixels outwards. If you see thin lines between tiles in a game, export with an extrude of 1.

## Other engines

- **JSON** lists every tile's place in the picture, its shapes, values and terrain, and every map as tile numbers.
- **Tiled** files (.tsj and .tmj) open in the Tiled map editor and in engines that read them. Shapes arrive as collision objects and values as properties. Terrains arrive as a property named terrain; Tiled's own terrain sets are not made.

Maps are saved as they are on the frame you're looking at.`,
};
