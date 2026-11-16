# A picture behind your drawing, and a video to trace over

Every file is in both themes (`-dark`, `-light`). Clips are H.264, yuv420p. Made with `scripts/docs/ab-reference/after.cjs` (see docs/testing.md, "Reference and video looks").

## fn-reference-image

- `reference-traced-*.png`: a photo (drawn in the page) on a reference layer behind the drawing, faded to 60%, with ink traced over the figure. The dashed box, corner handles and turn knob are what you drag; the bar underneath has the exact numbers, Fit, Fill, Own size, Lock and Done.
- `reference-move-scale-fade-*.mp4` (poster `-poster.png`): the same photo moved, sized, turned and faded, all with real mouse drags on the handles. The ink stays where it was drawn while the picture moves under it. Nothing is drawn by the drags.

## fn-video-reference

- `video-dialog-*.png`: the window for a video before anything happens. A picture at the scrub position, the stretch (from and to), pictures a second, size, and what it comes in as. It says what it found (3 seconds, 480 x 270, 30 a second; that stretch makes 36 pictures) and the count and size at the bottom.
- `video-frames-land-*.mp4` (poster `-poster.png`): Bring them in reads 36 pictures (progress shown), a reference layer appears with the first one, the animation grows to 36 frames, and Play shows the ball moving behind the page.
