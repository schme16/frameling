Quill's "Save changes?" dialog against the old operating-system box, in the real built app (real window close, real Quit).

- `side-by-side-dark.png` and `side-by-side-light.png`: **A** is the system box (the Linux one under xvfb with no desktop theme
  behind it; yours will wear your desktop's style), **B** is Quill's dialog. Same words, same three answers, Save has the focus.
- `dialog-dark.png`, `dialog-light.png`, `system-dark.png`, `system-light.png`: the two halves on their own, cropped.
- `dialog-dark.mp4`, `dialog-light.mp4` (H.264, yuv420p, 1280x800, about 12 s): three strokes, close the window (the dialog,
  Quill thinking), Tab round it, Escape (Cancel: it stays open), Quit (the same dialog), Escape (the quit is cancelled), Quit
  again, **Don't save**, and Frameling quits.

A is not gone: it is the fallback. If the page is busy, hung or cannot show the dialog, the system box asks after 2.5 seconds,
so a close is never let through without a question. `system-*.png` is that box, shown by freezing the page on purpose.

Quill's two lines ("Hold on! Some of this isn't saved yet." and "Hold on! This one has never been saved.") are drafts, for you to edit.

Made by `scripts/ab/quill-save-dialog.cjs` (`dialog` and `fallback` modes, xvfb; see docs/testing.md).
