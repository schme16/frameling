# Copy and paste: frames and keys on the timeline, and with the rest of the computer

Every picture is in both themes (`-dark`, `-light`). Clips are H.264, yuv420p, even sizes.

## Frames and keys (fn-copy-paste-frames)

- `timeline-copy-keys-dark.mp4`, `timeline-copy-keys-light.mp4` (and `-poster.png`): four keys of the walk cycle are picked (click, then Shift+click), copied with Ctrl+C, and pasted on frame 9 with Ctrl+V. The drawings that were in the way move later (the first time, a message says so, with a **Change** button for covering them instead) and the cycle goes round twice. The pasted keys stay picked.

## The system clipboard (fg-clipboard-system)

Each still is the real app with a real picture put on the real system clipboard, then Ctrl+V pressed (made by `scripts/e2e/clipboard.cjs --stills`). The message under the canvas is what Frameling says about what it did.

- `clipboard-picture-on-vector-*.png`: a 320 x 200 screenshot pasted on a vector layer. It comes in at its own size, in the middle, as a picture made of pixels, selected with its handles, so it can be moved, turned and resized.
- `clipboard-picture-on-pixels-*.png`: a 40 x 25 screenshot pasted on a pixel layer. One picture pixel is one art pixel, lifted in the middle (moved aside a little here) so it can be dragged into place.
- `clipboard-locked-palette-*.png`: the same on a layer whose palette is locked. The colours are matched to the four in the palette, and the message says why.
- `clipboard-big-picture-shrunk-*.png`: a 1600 x 1000 screenshot on an 800 x 500 page. The first time it is shrunk to fit, keeping its shape, and the message has a **Change** button.
- `clipboard-big-picture-cropped-*.png`: after pressing **Change** and choosing to keep its size: the picture stays 1600 x 1000, centred, and the edges that hang over are cut off.
- `clipboard-shapes-to-pixels-*.png`: an ellipse and a box copied from a vector layer and pasted on a pixel layer (8 x 8 page pixels to an art pixel). They come out as hard-edged pixels, lifted and moved to the right so the smooth originals show beside them. The message says lines are no longer smooth curves.
- `clipboard-pixels-to-picture-*.png`: a block of pixels copied and pasted on a vector layer. It comes in as a picture (moved to the right here so the pixels it came from show), and the message says it stays pixels.

Going out (checked in the harness, not shown): Ctrl+C puts a picture on the clipboard, twice the page size, see-through where nothing is drawn (792 x 512 for the two shapes in the stills); **Copy as SVG** puts the shapes on the clipboard as SVG text.
