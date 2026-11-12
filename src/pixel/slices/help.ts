import { registerHelpTopics } from '../../core/registry';

registerHelpTopics([
  {
    id: 'pixel-slices',
    order: 14,
    media: 'pixel-slices.png',
    title: 'Slices',
    section: 'Pixel art',
    summary: 'Name rectangles on a sprite, give them a 9-patch middle or a pivot, and hand them to your game engine.',
    keywords: ['slice', 'slices', '9-patch', 'nine patch', '9-slice', 'nine slice', 'pivot', 'anchor', 'hitbox', 'region', 'border', 'ninepatchrect', 'atlastexture', 'border-image', 'aseprite slices'],
    body: `A **slice** is a named rectangle on a pixel layer: a button, a hitbox, a frame of a tile set. Games use them to cut one big picture into parts, to stretch a panel without squashing its corners, and to know where a sprite stands.

## Making one

Pick the **Slice** tool (**Shift+S**) and drag on the layer. The slice snaps to whole pixels. Drag it to move it, drag an edge or a corner to resize it, and press **Delete** to remove the picked one. The **Slices** panel lists them all: pick one to rename it or type exact numbers for its position and size. **Show slices on the canvas** hides the outlines (they never appear in exports).

Slices belong to the pixel layer they were made on, so a copy of the layer carries its slices along, and hiding the layer leaves them out of exports.

## A slice that moves between frames

A hitbox or a hand that goes somewhere else on each frame is one slice with **keys**. In the Slices panel pick it and press **Move between frames**, then go to another frame and move or resize the slice: that frame gets a key, and the slice keeps that place until the next key. **Remove this key** takes one away, and **Keep in one place** makes it stay put again. Slices from Aseprite that move come in this way. The sprite sheet export writes every key in the JSON (Aseprite's shape), counted from the first frame you export. Godot, Unity, Phaser, Pixi and CSS get the place the slice has on that first frame.

## 9-patch

Tick **9-patch** and a dashed middle appears with four borders (left, top, right, bottom). When the engine stretches the picture, the borders stay the size they are and only the middle stretches, so a button's corners and outline stay crisp at any size. Drag the dashed lines on the canvas, or type the borders in the panel.

## Pivot

Tick **Pivot** and a small cross appears at the bottom middle of the slice. Drag it to where the sprite stands or turns (the feet of a character, the hinge of a door). It may sit outside the rectangle.

## What the engines get

The sprite sheet export (File > Export, Sprite sheet) writes slices when the sprite has any, next to the frames:

- **Godot**: a scene (name-slices.tscn) with a NinePatchRect for each 9-patch (its borders set) and a sprite cut from the sheet, with the pivot as its origin, for each other slice.
- **Unity**: the slices join the sprites the importer script makes, with their borders and pivots.
- **Phaser and PixiJS**: each slice is a frame in the atlas, with its pivot (Phaser) or anchor (Pixi).
- **CSS**: each 9-patch gets a small picture and a border-image rule.
- **JSON**: a list of slices (Aseprite's shape) in the file's meta.

Slices are measured on the first frame, so that frame stays whole on the sheet (not trimmed) and the regions line up.

## From Aseprite

Slices in an Aseprite file come in as slices on the top pixel layer, with their 9-patch middle and pivot. A slice that moves from frame to frame comes in with a key for each place. Slices in a sprite sheet's JSON come in too (see [Cutting a sprite sheet](help:pixel-sheets)).

---

See also [Bringing in Aseprite files](help:aseprite-import) and [Pixel art](help:pixel-art).`,
  },
]);
