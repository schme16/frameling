# Words beside the timeline icons, and a clear "New layer" row

Board task `ux-label-the-icon-rows`. Everything is dark and light, cropped from the real app (the Animate workspace with the
bouncing ball), shot in xvfb at five window widths. `before` is development as it was, `after` is this branch.

## What changed

- **Timeline toolbar:** **New drawing**, **Copy**, **Add a frame** and **Onion skin** show their words while there is room. As the
  bar narrows the words drop one at a time, **Onion skin** first and **New drawing** last, and only once all four are gone does
  a button fold into the **...** menu. Each step is decided by measuring the real width (with the same spare-room margin the
  folding already had), so the bar doesn't flicker or jump as you drag the panel edge. The minus stays an icon, so
  **Add a frame** has no twin to confuse it with.
- **Hold box:** reads **Hold for none** (not **Hold -**) on a frame with no drawing, because that is true: there is nothing
  there to hold, so picking 1 to 4 does nothing. The box keeps one width when you scrub between a drawing and an empty frame.
- **Layers header:** a small **New layer** label in front of **Vector** and **Pixel**, so the two read as "add one of these" and
  not as a mode switch. Duplicate and delete moved up beside the **Layers** title in the timeline's list. The Layers panel
  shows the same row; its duplicate and delete buttons wrap under it because the panel is narrower.
- The visible words match the palette: **New drawing here**, **Copy this drawing to the next frame**, **Add a frame**,
  **See the frames around this one (onion skin)**, **New vector layer**, **New pixel layer**. The two layer buttons' names for
  speech are now **New vector layer** and **New pixel layer** (they were **Add ...**).

## Files

- `toolbar-wide-*`, `toolbar-mid-*`, `toolbar-narrow-*`, `toolbar-narrowest-*`: the toolbar and the top of the layers list at
  2000, 1800, 1200 and 1000 px wide windows. `-before-`, `-after-` and `-compare-` (before over after) for `dark` and `light`.
- `toolbar-labels-dropping-after-dark.png` and `-light.png`: the toolbar alone at 2000, 1800, 1650 and 1200 px, showing the
  words dropping away in order (the 1650 one is where the four hold buttons also fold into one box, which the toolbar
  already did).
- `layers-panel-*`: the Layers panel header, before and after (side by side in `-compare-`).

## Worth knowing

- At a common 1600 px window in the Animate workspace the timeline is about 1100 px wide, so most people will see
  **New drawing** and **Copy** and the icons for the rest. Wide screens, or a timeline given more width, show all four.
- Before this branch the wide toolbar already had **+ Frame** and **- Frame**; below about 1180 px everything but **New** was
  icons alone, which is the picture in the review (`brand/ab/ux-review/05-timeline-icon-row.png`).
