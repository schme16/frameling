# Interactives, hidden for now

A (before): Interactives on, as it was. **File > Open Interactives file...** is in the File menu, and the Export window has an **Interactives .flplay** card.

B (after): the switch in `src/features/flags.json` is `false`. The File menu has no Interactives entry (the rest closes up), and the Export window shows only GIF, MP4, PNG sequence and Sprite sheet, with the other formats under **More formats**.

- `file-menu-ab-dark.png`, `file-menu-ab-light.png`: the File menu, A beside B.
- `export-dialog-ab-dark.png`, `export-dialog-ab-light.png`: the Export window, A above B.
- `*-before-*.png` and `*-after-*.png`: each half on its own, cropped, in both themes.

Shot from the built app under xvfb (`scripts/shoot.cjs`); A is the same build with the switch set to `true`.
