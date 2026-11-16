# Photoshop text that stays text

The same file, `scripts/docs/help/assets/import-text.psd` (a title, a centred subtitle in a font nobody has here, a paragraph in a box and a turned tag), brought in by the build this branch started from (before) and by this branch (after). Every picture is in dark and light, cropped and captioned. Made with `scripts/docs/ab-psd-text/psd-text.cjs` (see docs/testing.md).

- `in-*`: right after opening. Before, five picture layers. After, the four text layers are text on vector layers, in the same places, and the toast says how many are text you can edit.
- `selected-*`: the title selected. Before, a picture with the Select tool's options. After, the Text options: words, font (DejaVu Sans), weight, size, colour and alignment.
- `left-out-*`: the list behind **See what was left out**. Before, one line saying the text can't be edited. After, the missing font (Gotham) is named and the nearest one is used; the wrapped paragraph is under Good to know.
