# A picture with no animation hides what only animation needs

Board task `hide-animation-only-ui`. Each picture exists dark and light.

Hidden until **Add animation**: the Lip sync, Draw on and Clip flow panels, and the Path to follow, Record a move and Shape hints tools. The rig tools, the Rig panel and the Rigging menu stay, because a picture can be posed.

- `picture-before-after-{dark,light}.png`: a new picture with Lip sync, Draw on and Clip flow all opened, before (left: all three are in the right rail) and after (right: they wait out of sight, and Properties shows instead).
- `picture-after-add-animation-{dark,light}.png`: the same drawing right after **Add animation**: the timeline, and the panels, are back where they were.
- `rail-before-picture-animated-{dark,light}.png`: the tool rail before, on a picture, and with animation added. On a picture Rig and motion holds the rig tools only; the motion tools come back with animation. (Before also still has the old Pen and edit group; that is the other task.)
- `palette-offers-add-animation.mp4` (H.264, yuv420p, 800x484): on a picture, searching "lip sync" and choosing it. Nothing is lost: it is found, and the message offers **Add animation**; pressing it adds animation and opens the Lip sync panel straight away.
