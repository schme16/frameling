# The Draw panel opens on Size and the colour

Board task `ux-draw-panel-fewer-sliders` (rank 4 of the ease of use review). The Draw workspace's Properties panel used
to open on nine brush controls, with the colour below the fold. Now the brush shows its sample line and **Size**, and
the rest sits under **More brush options**, which stays open or shut the way you left it. The colour picker is on screen
straight away.

- `a-before-dark.png`, `a-before-light.png`: before. Merge shapes together, sample, Size, Smoothing, Pressure changes
  thickness, How much, Pointy start, Pointy end, Stabilizer, Stabilizer style; Colours is just a header at the bottom.
- `b-after-dark.png`, `b-after-light.png`: after, first run. Sample, Size, **More brush options** (with a line saying
  what is inside), then the whole colour picker.
- `c-after-opened-dark.png`, `c-after-opened-light.png`: after, with the fold open. The same nine controls and the same
  words as before; Merge shapes together moved in here with the rest.

Taken in the built app under xvfb (scripts/docs/record.cjs, 1400 x 900), right panel cropped to 312 x 788.
