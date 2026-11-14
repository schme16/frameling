# Panel polish: Artboards like Layers, and a tidier Export window

Before = `development` at 98403ee. After = this branch. All crops are of the real app in xvfb, dark and light, the
explanations tucked away (what someone who was already here sees). Made by `scripts/ab/panel-polish.cjs`.

## Artboards beside Layers
- `panels-before-*` / `panels-after-*`: the Layers panel (left) and the Artboards panel (right), cropped, with a drawing
  that has a board and two variations.
- Before, the Artboards panel was a list of cards with its own buttons (arrows, copy, bin) and four buttons in a wrapping
  block. After, it is the Layers panel's list: **New artboard** with **Blank** and **Variation**, then duplicate and
  delete in the same two places, the same 36 px rows with a grip, picture, name and **...** menu, the same chosen row,
  the same drag marks, and variations indented under their original the way layers sit in a folder. A board's size is
  at the right of its row and a variation carries a small link tag. The whole-set buttons (Fit all, Line up, Play all,
  Export) sit in a second row of the same toolbar.
- Left out on purpose: the eye, padlock and onion buttons. A board has no hide or lock in the file format, so there is
  nothing for them to do.

## The Export window
- `export-first-*`, `export-sheet-*`, `export-video-*`: three formats picked (the one it opens on, Sprite sheet, MP4).
- `export-more-*`: More formats open.
- `export-150-*`, `export-200-*`: the whole window at 150% and 200% interface size (1280 x 800).
- What changed: both columns start on one line under headings of one style (**Format**, **Your ways out**, ...), in plain
  sentence case instead of small capitals, with the same gap under each. The ? sits beside the title as it does on the
  panels. **More formats** is in the footer with the summary and the buttons, on one line, instead of under the left
  column. The "Save these choices as..." link lines up with the headings.
- Kept: the cards that say what each format is for.

## With layer masks (after the rebase onto development)
- `masked-after-*`: the Layers panel with a mask row (purple, a switch where the eye is, the layer it cuts with its purple
  edge, the Mask button in the header) beside the Artboards panel.
- The `panels-before-*` pictures are from before layer masks landed, so the Layers header there has no Mask button; that
  is the masks work, not this branch.
