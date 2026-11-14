# The blank page, and a voice after the first drawing

Board task `ux-blank-page-nudge`. Pressing **Skip for now** on the hello used to leave a white page and a wall of
sliders with no voice. Now:

- a faint line sits on the empty page: **Draw something. The brush is ready.** It is painted on the canvas overlay,
  so it is never in an export, can't be picked or drawn over, and is gone from any picture of real work. It goes the
  moment the pen touches down (not when it lifts) and doesn't come back for that file, even after an undo.
- a moment after the first drawing, Quill pops up once: **Ooh, your first drawing! Press Play to watch it, or draw on
  frame 2 to make it move.** with **Play it** and **Not now**. **Not now** is remembered. He says it three times at most
  in all, and never again after either button.
- **Show Quill** off silences both. Each also has its own switch in Preferences > Behaviour (**A hint on an empty
  page**, **Quill's tip after your first drawing**), and **Help > Gentle nudges on or off** flips both.

Both lines are drafts waiting for Shane's edit (they are in `src/ui/mascot/lines.json` as `nudge.page`,
`nudge.page.other` and `nudge.drawn`, with pictures on the dialogue review page).

## Files

- `blank-page-dark.mp4`, `blank-page-light.mp4` (H.264, yuv420p, 1280 x 774, about 12 seconds): the welcome sheet,
  Skip for now, the empty page with its line, a first stroke (the line is already gone as the pen goes down), and
  Quill's nudge.
- `blank-page-dark-poster.png`, `blank-page-light-poster.png`: the last frame of each clip.
- `1-welcome`, `2-empty-page-with-line`, `3-first-stroke`, `4-line-gone`, `5-quill-nudge`, each in `-dark` and `-light`:
  stills from the clips.

The screenshot harness (`?debug`) keeps both nudges quiet, so every existing help picture of a blank page is
unchanged. These captures turn them on with `window.__framelingAsk = true`.
