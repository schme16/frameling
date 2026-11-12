Thick pixel star and polygon outlines at 2, 3 and 4 px, on light (`ab-light.png`) and dark (`ab-dark.png`) pages; `star-2px-closeup.png` is the 2 px star large. Rows: star and hexagon at each thickness. Columns:

- A: round brush stamped along the 1 px outline (how it was). At 2 px it is the same as B.
- B: square brush stamped along the 1 px outline.
- C: steady width: every pixel whose middle is within half the thickness of the edge, corners rounded.
- D: corner-aware (built as the default): C with pointed corners up to a miter length of 2 stroke widths, rounder past that.

What the stamps get wrong: the width changes with the slope (a 2 px brush gives a 2 px flat edge and a fat staircase on a slant), tips turn into 2 x 2 blobs, and the dips of a star can pinch shut (the speck of page showing through A and B at 2 px). D is the same width everywhere, keeps the star's five tips even and the hexagon's corners square, and its fill always sits under it. Recommendation: D, now what the polygon, star and pen use when thick outlines are on. Lines, rectangles and ellipses still stamp the brush (round or square), so the brush shape still matters for those.

Regenerate: `xvfb-run -a -s "-screen 0 1600x1000x24" npx electron --no-sandbox scripts/ab/pixel-star-corners.cjs`.
