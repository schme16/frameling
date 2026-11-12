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
    body: `A **slice** is a named rectangle on a pixel layer: a button, a hitbox, a frame of a tile set. Games use them to cut a picture into parts, to stretch a panel without squashing its corners, and to know where a sprite stands.

## Making one

Pick the **Slice** tool (**Shift+S**) and drag on the layer. The slice snaps to whole pixels. Drag it to move it, drag an edge or a corner to resize it, and press **Delete** to remove the picked one. You can pick a slice on any shown layer, not only the one you are on. **Show slices on the canvas** hides the outlines (they never appear in exports).

The **Slices** panel (a tab next to Tool options in the Pixel workspace) lists the slices of every layer and every board, grouped, so you can rename one or type exact numbers for its position and size without leaving the board you are on. **Open board** takes you to another board. Hiding a layer leaves its slices out of exports.

## A slice that moves between frames

For a hitbox that goes somewhere else on each frame, pick the slice and press **Move between frames**. Then go to another frame and move or resize the slice: that frame gets a key, and the slice keeps that place until the next key. **Remove this key** takes one away and **Keep in one place** makes it stay put again. Slices from Aseprite that move come in this way.

## 9-patch

Tick **9-patch** and a dashed middle appears with four borders. When the engine stretches the picture, the borders stay the size they are and only the middle stretches, so a button's corners stay crisp at any size. Drag the dashed lines, or type the borders in the panel.

## Pivot

Tick **Pivot** and a small cross appears at the bottom middle of the slice. Drag it to where the sprite stands or turns (the feet of a character, the hinge of a door). It may sit outside the rectangle.

## What the engines get

The sprite sheet export (File > Export, Sprite sheet) writes slices next to the frames: a Godot scene with a NinePatchRect or a cut sprite for each, Unity sprites with borders and pivots, Phaser and PixiJS atlas frames with a pivot or anchor, a CSS rule for each, and a list in the JSON (Aseprite's shape) that keeps every key of a moving slice.

Regions are measured on whole frames, so the first frame you export, and each frame where a moving slice has a key, stay whole on the sheet. Each engine follows a moving slice, key by key, along each of your clips, in that clip's order, direction and repeat. Godot gets an animation of the clip's name on the scene's SlicePlayer; Unity, Phaser and PixiJS get one named like "slice_hand_run" (slice, then clip). CSS shows the first place only.

## From Aseprite

Slices in an Aseprite file come in on the top pixel layer, with their 9-patch middle and pivot, and a key for each place when they move. Slices in a sprite sheet's JSON come in too (see [Cutting a sprite sheet](help:pixel-sheets)).

---

See also [Bringing in Aseprite files](help:aseprite-import) and [Pixel art](help:pixel-art).`,
  },
]);
