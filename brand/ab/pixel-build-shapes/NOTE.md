# Pixel shapes with Paint and Back: what is the inside?

Real app under xvfb (Pixel workspace, a rectangle and an ellipse drawn with the real tools, Paint pink, Back blue).

- **A (built, recommended)**: every pixel tool paints with Paint. A shape is an outline in Paint, or filled in Paint when "Filled" is ticked in its options. Back stays the second colour for right-click, X and Dither. (The Filled tick shows off in this shot because the shot forces the setting from a script.)
- **B**: the inside of a shape is Back and the outline is Paint, as the Draw workspace does it with Fill and Stroke. Two colours in one click, but a shape quietly uses a colour you were not thinking about, which is the surprise the wells were meant to remove. One switch away: `setShapeFilledSource(() => 'back')` in `src/tools/pixelWells.ts`.
