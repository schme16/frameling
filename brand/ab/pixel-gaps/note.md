# Pixel gaps: the bucket under line art, and pixel art as symbols

Every picture is a before (A) and after on the same drawing, in the dark and the light theme (`-dark` and `-light`).

- `bucket-under-lines-*.png`: the paint bucket on an empty pixel layer called Colour, under a Lines layer holding a face. A, **Use lines from all layers** off (how it was): the click floods the whole layer. B, on: the colour stays inside the lines, and a second click in each eye fills the eye in a second colour. Same options and words as the vector bucket (task fg-pixel-bucket-layers).
- `bucket-colour-match-*.png`: a noisy red disc with a lighter, smoothed edge on one pixel layer. A, **Colour match** on **Exact colour** (the default): only the very same colour fills, so the click leaves the disc speckled. B, **Close colours (15%)**: the disc fills clean and the lighter edge stays, because it is further away than that.
- `pixel-symbol-*.png`: a pixel slime on a pixel layer. A, before: **Make a reusable symbol** says "Pick a vector layer first". B, after: it is a symbol with the selection box, same place, still pixels, on the same layer (now a vector layer, since it held only this drawing). C, after: **Make in-betweens** has glided and turned it to frame 7 of 12; the pixels stay square and crisp (task fg-pixel-symbols).

The "before" pictures come from `development` as it was; the "after" pictures are this branch. Both are shot in xvfb with `scripts/shoot.cjs`.
