# Transform tool

`transform-dark.mp4` and `transform-light.mp4` are the whole thing in one clip (about 22 seconds): two shapes first, then a
patch of pixels (Pip's head). `shapes-*.mp4` and `pixels-*.mp4` are the two halves on their own. All H.264, yuv420p.

Both halves do the same five drags with the real mouse through the real tool, then press Enter and undo once:

1. **Move**: drag inside the box (off the little cross in the middle, which is the pivot).
2. **Stretch**: drag the bottom right corner out.
3. **Squash**: drag the middle of the top side down.
4. **Slant**: hold Ctrl and drag the middle of the top side along itself. The bottom side stays put.
5. **Turn**: drag the round knob above the box round the pivot.

Nothing in the drawing changes until Enter, and the last frames show a single **Undo** putting the lot back, so the whole
session is one step. Pixels are picked again when they are stretched, slanted or turned (never blended, so no new
colours), and the toast at the bottom of the pixel half says so when it lands. A move by whole pixels, a flip and a quarter
turn are exact and don't show that toast.

Regenerate: `npm run build`, then
`SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab --out <dir>`
(the combined clip is the two joined with ffmpeg, the pixel half padded to the same size).
