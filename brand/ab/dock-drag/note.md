# Drag the tool rail to dock it

The rail is moved by its grip, and every place it can live is a drop target. The right-click menu loses its five
"where to dock it" lines; it keeps one line about moving (or, for a floating rail, one that docks it back on its side).
Both clips are the real app (Draw workspace, Bouncing ball), shot in xvfb, H.264 yuv420p, 800x500, about 25 seconds.
Dark and light are the same run.

- `dock-drag-dark.mp4`, `dock-drag-light.mp4` (with `-poster.png` stills). The same clips are the help topic **Move the
  tool strip** (`public/help/tool-move-*`).

## What the clip shows, in order

1. **Pull the rail wider by its edge.** Three buttons across. This is the width edge, a different thing from the grip.
2. **Out over the canvas.** The canvas gets an outline and the label says "float here"; letting go floats it, still
   three across.
3. **Back on the left, as it was.** The left band is labelled "Back on the left, as it was". The rail returns to the same
   side, the same width, the same arrangement.
4. **The right, the top, the bottom.** Each side has its own band along the outer edge of the work area; the one under the
   pointer goes solid. The rail follows the pointer as a small window while it is carried.
5. **A drop that ends nowhere.** Carried over the top bar, the label says "let go to put it back"; letting go there puts
   the rail back on the bottom, where it was picked up, not left floating.
6. **Home again.** Dropped on the left band, as it was.

## Rules it keeps

- Drop targets: a band along each outer edge of the work area (left, right, top, bottom: the left and right win the
  corners), and the canvas (floats). Anything else is nowhere.
- Nowhere, or Esc, puts the rail back exactly where it was picked up: its side, or the spot it was floating at.
- The rail remembers the side it was last docked on (`tools.home`, optional in the saved layout), so a floating rail has a
  home: the right-click line, and the command **Dock the tools back where they were**.
- The grip and the width edge do not fight: the grip stops 8px short of the inner edge, the edge sits above it, and a press
  inside the edge's strip (or while a width pull is under way) never starts a carry.
- Panels: windows remember the side, group and place each panel came from (`back`, optional per window), so **Dock back**
  puts them there. The panel and window menus lose their "Move to the left side" lines; dragging a tab or a window to a
  side, a tab bar, or over a side's panels docks it.
- Locks: `railLocked()` and `panelsLocked()` in `src/ui/dockDrag.ts` are the seam for `lock-toolbars-panels`. They say
  "not locked" until that card lands; every carry and nudge already asks them.
