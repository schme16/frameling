# The tool rail stays put when you change layer

The task offered two ways. Built: B, twin slots with the rest greyed out. Shown for comparison: A, every tool its own slot.

- A (option 1, not built): one fixed slot for every tool. Greyed out where it doesn't work on this layer. The Lasso and the Pixel lasso (and Select, Polygon, Magnetic) each get their own button, so four extra greyed buttons sit beside the live ones.
- B (option 2, built): each pixel way of picking takes the slot of its vector twin, so the rail keeps its shape and the button under your hand does the right thing for the layer. Tools with no twin (Shade, Dither, Spray, Magic wand, Slice; Text, Gradient, curve tools) keep their own slot and are greyed out where they don't work. Rest on a greyed tool and it says why; press it and a toast says what to do.

## Files

- `before-rail-shuffles-dark.mp4`, `before-rail-shuffles-light.mp4`: the rail before. Lasso picked on a vector layer, then Pixel added: shade, dither and spray appear, the shapes and select tools move, and the Lasso falls back to Select. Click Layer 1 and it moves back.
- `after-rail-stays-put-dark.mp4`, `after-rail-stays-put-light.mp4`: the same steps after. Every button stays where it was, the Lasso becomes the Pixel lasso in its place and back again, Text greys out on the pixel layer and Dither on the vector layer, each with its reason on hover.
- `built-twin-slots-dark.png`, `built-twin-slots-light.png`: the built rail, on a vector layer then a pixel layer, side by side.
- `option-1-every-tool-own-slot-dark.png`, `option-1-every-tool-own-slot-light.png`: the option not built, same two layers. Note the doubled selection tools and the longer rail.

All clips are H.264, yuv420p, 620 x 700. Made with `scripts/docs/record.cjs` at 1280 x 800 under xvfb. The before clips come from `development` as it was.
