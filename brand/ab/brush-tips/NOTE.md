# Brush tips: the same strokes with each tip

Card: `fn-brush-tips-textures`. Each picture is the same three strokes drawn in the real app with the real Brush tool (a long
wave, one zigzag line that crosses itself, a loop, and a short dab), once with each tip. In the dark theme the page is slate and
the lines are cream (chalk on a board); in the light theme it is ink on white. Everything is vector, so these are the shapes the
exports write too. Made by `scripts/docs/ab-brush-tips/tips.cjs` (see docs/testing.md).

## Pictures

`sheet-dark.png` and `sheet-light.png` have all seven side by side. The single shots are in `raw/<tip>-<dark|light>.png`.
`detail-grain-dark.png` and `detail-grain-light.png` put plain, chalk and charcoal three times closer, to judge the grain.

- `plain`. Plain, for reference: the smooth solid line the brush always made.
- `chalk`. Chalk: a dusty line with the paper showing through in clumps, and a slightly rough edge.
- `charcoal`. Charcoal: coarser grain, bigger gaps and a ragged edge, for sketching and shading.
- `watercolour`. Watercolour: a see-through wash that is darker along its edge, with a faint halo; the zigzag shows the wash
  joined where the line crosses itself.
- `stamp-leaf`. Leaf stamp: a leaf every 90% of the brush size, turning with the line, varied in size and wandering a little.
- `stamp-star`. Star stamp: stars spinning every which way, spaced wider.
- `stamp-yours`. A stamp made from a selection: five ellipses drawn as a paw, selected, and turned into a brush with
  **Make a brush from the selection**. The paws turn to face the way the line goes.
