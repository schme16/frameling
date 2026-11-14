# Feature review, batch 2: before and after

Each picture is cropped from a real run of the built app under xvfb, in both themes (`-dark` and `-light`), the same
drawing and window for before and after. "Before" is `development` at 2acfac3 (the start of this batch). The export
dialog's "before" has the one-line `data-wraps` fix on its format cards applied as well, because on `development` those
cards currently break their words and overlap the options (a leftover from the no-wrap change), and that would hide
what this card is about.

## fg-export-settings-per-file

- `export-ways-before-*`: the Export window as it was. One set of choices for the whole app, nothing to name or keep.
- `export-ways-after-*`: **Your ways out**: two named ways kept in this drawing ("the web video", "the social video"). The
  one whose choices match what is picked is lit. **Save these choices as...** keeps another.
- `export-ways-other-drawing-*`: a different drawing opened afterwards. It has none of the first one's ways and does not
  start from its choices (it starts from the usual ones), so Export again can no longer repeat another file's export.

## fg-numbers-for-shapes

- `numbers-shape-before-*`: a plain rectangle selected, the Properties panel has no numbers.
- `numbers-shape-after-*`: the same selection with **Position and size**: X, Y, Width, Height, Turn by, Slant by, and Keep
  proportions. X and Y are the left and top of the box; Turn and Slant go by the amount typed.
- `numbers-pixels-before-*`: a pixel selection, no numbers.
- `numbers-pixels-after-*`: the same boxes in whole pixels of the art (X 2, Y 2, 8 wide, 5 tall), plus Turn by. No Slant
  for pixels (it would smear them), and the panel says so.

## fg-pixel-text-gradient

- `rail-note-before-*`: on a pixel layer Text, Gradient, Edit points, Path to follow and Shape hints are simply not on the
  strip, and nothing says so.
- `rail-note-chip-*`: now a small button with a number sits at the bottom of the strip. Resting on it reads **Text, Gradient,
  Edit points and the rest work on vector layers.**
- `rail-note-after-*`: pressing it lists them, each one a way to go to a vector layer with the tool in your hand, and a way
  to see them greyed out where they sit instead.

## fg-brush-edit-points

Left to right, in `brush-1-before-*` to `brush-4-after-*`:

1. before: Edit points on a brush line says only to draw it with the Pen instead.
2. after, step one: the same click selects the line and offers **Turn into an editable line**.
3. the card: a Smoothness slider with the result showing on the canvas as you slide, and "70 points become 20".
4. after: the line is a shape with 20 smooth points in Edit points, same colour and width, one Undo to get the brush line back.
