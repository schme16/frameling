# Lock the tools

Right-click the tool rail and choose **Lock the tools**. A locked rail can't be carried to another side, pulled wider,
rearranged or changed, and **Change the tools** won't open. Every tool still draws. The panels have the same switch
(**Lock the panels**) in a tab's right-click menu.

Both clips are the real app (Draw workspace, Bouncing ball), shot in xvfb, H.264 yuv420p, 800x500, about 19 seconds.
Dark and light are the same run.

- `lock-rail-dark.mp4`, `lock-rail-light.mp4` (with `-poster.png` stills). The same clips are the help topic
  **Lock the tools and panels** (`public/help/lock-layout-*`).
- `locked-menu-dark.png`, `locked-menu-light.png`: the rail's menu while locked, cropped. Unlock is the first entry, and
  each greyed entry says why. Dark is the frame from the same clip.
- `quill-lock-it.png`: Quill's first-slip lesson with its **Lock it** button (a draft line for you to edit; it is
  `lock.teach` in `src/ui/mascot/lines.json`).

## What the clip shows, in order

1. **Right-click the rail, Lock the tools.** The menu has Lock the tools as its first entry.
2. **Try to carry it by the grip.** Nothing moves. A message says: the tools are locked, so the tool rail can't be
   moved to another side, and where to unlock. It has an **Unlock** button.
3. **The menu now.** Unlock the tools is on top; the group entries, "To move them", Change the tools and Put the tools
   back are greyed with "Locked. Unlock the tools to do this." under each. Show one button per group and the help
   entry stay live.
4. **Unlock the tools, then carry it.** The rail docks on the right and back on the left as before.
