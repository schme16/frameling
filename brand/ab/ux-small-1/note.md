# ux-small-1: five small ease-of-use cards, before and after

Each `*-before-after-<theme>.png` is before on the left and after on the right, cropped to what changed, in dark
(Midnight sketchbook) and light (Paper and honey). The single `*-before-*.png` and `*-after-*.png` crops are beside
them for a board look. "Before" is `development` at dceddb4 built in a scratch worktree; "after" is this branch.
Shot with scripts/shoot.cjs under xvfb at 1280 x 960, the cosy look, welcome off.

- `palette-before-after-*`: the command palette the first time it opens. Before: alphabetical, starting at "Add a
  camera" (the "before" crop here is the first open with no recents). After: a Try these group (New drawing, Open,
  Save, Export, Undo, Help), then the rest.
- `help-before-after-*`: the Help menu. Before: shortcut sets, quest controls and the pen check mixed in. After: help
  only, plus Tell the makers and the crash notes.
- `rig-before-after-*`: the Rig menu. Before: Rig, Add bones, Bone, Pose. After: Skeleton (rig), Add a skeleton to this
  drawing, Draw the bones (Bone tool), Pose the bones (Pose tool), Skeleton panel (Rig).
- `pixel-before-after-*`: adding the first pixel layer on a 1280 x 720 page. Before: nothing but the status bar
  changing. After: a toast, "Pixel layer: 160 x 90 pixels, each one 8 wide on the page." with a Change size button.
- `webm-before-after-*`: Export, WebM video. Before: AV1 picked with nothing said about it. After: VP9 picked, a line
  naming the codec in use and one saying what each is for.

Harness note: the Export dialog's cards currently run their descriptions on one line, which squeezes the options
column over them (a leftover of the no-wrap change, present in both builds). For the WebM pair only, the harness lets
the cards wrap (`.ex-cards *{white-space:normal}`) so the codec lines can be read; nothing of that is in the app.
