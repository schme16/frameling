# Mirror drawing on vector layers, and the settings that were forgotten

Both pieces: `fg-vector-mirror` and `fg-forgotten-settings`. "Before" is `development` at 215ee74, built in a second
worktree. "After" is this branch. Same 1280 x 800 window, same strokes, same Shift+M, in both themes.

## Mirror

- `before-mirror-on-vector-dark.png`, `before-mirror-on-vector-light.png`: Shift+M pressed, left and right, on a vector
  layer, then the left half of a face drawn with the brush. Only the left half exists. No dashed line, no note, and the
  mode is still on. This is the lit but silent mirror.
- `after-mirror-on-vector-dark.png`, `after-mirror-on-vector-light.png`: the same strokes. The dashed centre line is on
  the page, the right half is there, and the brush options (under More brush options) carry the same Mirror drawing
  control the pixel tools use.
- `after-mirror-clip-dark.mp4`, `after-mirror-clip-light.mp4`: the same clip the Mirror drawing help topic shows.
  Shift+M, then the left half of the head, an eye and a mouth, and each stroke grows on the right as it is drawn. H.264,
  yuv420p, 764 x 444, 8 seconds.

## What was checked after a restart

`settings-restart-before.txt` and `settings-restart-after.txt` come from `scripts/e2e/remember.cjs`: the real app
twice on one profile on disk. The first launch sets each setting (the options through the real panels, by clicking the
value and typing a number), the second reads each one back. The "before" run is `development`, the "after" run is this
branch. Playhead, zoom and the picked tool are listed at the bottom: they start fresh on purpose.
