# Canvas view: four cards

All clips are H.264, yuv420p. Pictures come in dark and light unless said.

## Turn and flip the view

`turned-vector-*.mp4`: a face on a vector page with a guide. The view turns 30 degrees, a stroke is drawn, it turns to 60,
another stroke, then **Reset view turn**. The guide turns with the page, the strokes land where the pen was, and after the
reset the strokes are where they were drawn on the page. `turned-pixel-*.mp4`: pixel art with the pixel grid on, turned 45
degrees, two pencil strokes (each pixel is a diamond on screen, a square on the page), then flipped, then straight. The grid
turns with the page and the pixels still land one to a square. The note at the top and **Reset** are on screen the whole time
the view is turned or flipped; the same words sit in the status bar.

The turn is the view only. Nothing in the file changes, undo doesn't see it, and exports are the straight picture.

## Align and space out

`align-distribute-strip-*.png` (one picture, three steps): five shapes picked and scattered; **Align middle**; **Space out
across**. The single steps are `align-before-*`, `align-middle-*`, `align-spread-*`. The panel on the right is **Align and
space out** in the Properties panel (the same commands are in the palette and **Edit > Align and space out**).

## See-through artboards

`see-through-and-exports-*.png`: left, the screen with three artboards (Wide and Clear have no colour so they show a
checkerboard, Square is green); right, the PNGs the Export window made for each, laid on orange so the see-through shows. Before
this branch, with the Export window offering Transparent background ticked (because the first board has no colour), the green
board came out with its green taken off; unticked, the two see-through boards came out white. Now each board keeps what it has.
`scripts/e2e/see-through.cjs` checks it on 12 formats and the three ways of exporting several boards.

## 200% on a 1280 screen

`small-window-200-pixel-before-after.png` and `small-window-200-draw-before-after.png`, light theme. The app has 640 x 400 of its
own pixels. Before: the menu bar ran off the right edge (Rig, Effects, Plugins and Help were out of sight), and the canvas was
2 units wide in the Pixel workspace (as little as 2 x 2 across the three workspaces). After: menus that don't fit go under **More**, the
panels give way and fold to their rails, and the canvas keeps 392 x 262.

Numbers from `NOWRAP_ROOM_ONLY=1 npx electron scripts/e2e/no-wrap.cjs` (smallest canvas across the Draw, Animate and Pixel
workspaces):

| pass | window | before | after |
| --- | --- | --- | --- |
| 1280, interface 100% | 1280 x 800 | 528 x 376 | 528 x 376 |
| 1280, interface 150% | 853 x 533 | 103 x 110 | 341 x 191 |
| 1280, interface 200% | 640 x 400 | 2 x 2 | 392 x 262 |
| 1920, interface 100% | 1599 x 999 | 847 x 575 | 847 x 575 |

Before, at 150% and 200% the top bar also ran past the window edge in every workspace (Menus, Help and the rest to the right).

Regenerate: `npm run build`, then
`SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab --out brand/ab/canvas-view --only turned-pixel,turned-vector,align-before,align-middle,align-spread,see-through-screen`.
The strips and the side by side pictures are put together with ImageMagick from those and the e2e outputs.
