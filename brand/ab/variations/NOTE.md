# Variations: how a linked copy shows in the Artboards list

`ab.png`: A and B side by side (the "variations" demo, `__framelingArtboards.load('variations')` with ?debug).

- **A (built, default):** a variation's row is indented and carries a **Variation** chip with a link icon. It says
  what it is in a word, and the chip's tooltip names the original ("A variation (linked copy) of Ball").
- **B:** a tree line runs from the original to each variation, no chip, a small arrow before the name and "linked"
  after the size. Cleaner, but it says "linked" only in tiny italics and nothing explains what linked means.

Recommendation: A. The word on the row is what a new person needs, the panel section underneath says "This variation
(linked copy)" and explains it, and the chip stays readable in a narrow panel. B is a style change in
`artboards.css` only (the chip becomes a ::before line), so switching is cheap if you prefer it.

Not built, for the same area: showing the differences on the canvas (changed shapes outlined) as well as in the list.
The list jumps to the layer, frame and shapes instead.
