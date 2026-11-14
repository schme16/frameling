# Drag the tool rail wider

The tool rail's inner edge can be pulled, so the group names have room. Both clips are the real app (Draw workspace,
Bouncing ball, group names on), shot in xvfb, H.264 yuv420p, 420x640, about 21 seconds. Dark and light are the same run.

- `rail-width-dark.mp4`, `rail-width-light.mp4` (with `-poster.png` stills)

## What the clip shows, in order

1. **As it comes.** Two buttons across, and the longer names are cut with dots (COLOUR A..., SELECT A...).
2. **Drag the edge wider.** More buttons fit across as it grows (three, then four), and the names fill in until
   COLOUR AND PIXEL EXTRAS shows whole. The edge lights gold, and resting on it says what it does.
3. **Drag it narrower.** Down to one button across, icons alone. The names shorten with dots and never wrap.
4. **Back to the usual width** by dragging.
5. **Double-click the edge.** The rail takes the width that shows the longest name whole (172px here, three buttons across
   in each group). Double-click again and it goes back to the usual two across.

## Limits

- Narrowest: one button across (50px at the middle size, cosy look). Icons alone.
- Widest: 280px. The longest usual name (COLOUR AND PIXEL EXTRAS) wants 172px, or 196px while the tools are being
  changed (the fold arrow sits beside it); 280 leaves room for names of your own half as long again.
- Nothing in between is forced to a button boundary while you drag; the buttons across just follow the width.

## Rules it keeps

- The width is kept per workspace (`railWidths` in the dock save), goes into a saved workspace and its file
  (`railWidth`, optional, file still version 1), and **Put the tools back** puts it back.
- Group names never wrap: they use the room, then end in dots.
- Also in the command search: **Tool rail: wider**, **narrower**, **fit the group names**, **back to its usual width**.
