# Brush picker: real tips, a longer built-in list, and a preview you can see

Three changes to the brush picker, shot in the real app. Dark above light in every sheet. Before is the base commit,
after is this branch. `before/` and `raw/` hold each single shot.

- `1-preview-contrast.png`: the big brush preview in the Brush options, at 8px and 3px. Before, it was drawn in the
  drawing colour (near black) on a near black panel and could not be seen. After, it keeps your drawing colour while that
  shows up against the panel, and otherwise uses the panel's own text colour. Read from the panel's colour, never the
  theme's name.
- `1b-preview-contrast-other-themes.png`: the same in Puppy Socks (dark) and Ice Camo (light), to show the colour
  follows the panel and not the mode.
- `2-row-thumbnails.png`: each row's small picture. Before, a plain dot the width of the brush. After, a short dab of the
  real tip (chalk grain, charcoal rough edge, watercolour wash, stamp shapes) drawn by the same renderer as the page.
- `3-brush-list.png`, `3b-brush-list-more.png`: the built-in list. Before, 8 brushes in one plain list. After, 45 in seven
  groups (Pencils, Pens, Markers, Paint, Chalk and charcoal, Watercolour, Stamps and texture).
- `4-other-themes-rows.png`: the row thumbnails and strokes in Puppy Socks and Ice Camo.

Made with `scripts/docs/ab-brush-tips-list/shots.cjs` and laid out by `scripts/ab/brush-tips-list-sheets.sh`.
