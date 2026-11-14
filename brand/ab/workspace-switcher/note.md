# Workspace switcher, and menus that are not workspaces

Board task `ux-workspace-switcher`. Each picture exists dark and light.

## Where the switcher sits and what it looks like (switcher-A-B-C-*.png)

- **A, tabs in the top bar (built, the default).** Draw, Animate and Pixel as small tabs beside the drawing's name, the one you are in lit up, your own workspaces after them. One press changes room, and it sits where your eyes already go to check the name.
- **B, one chip with the name (built, a Preference).** Quieter, but you only see one name, so changing room is two presses. A window under 1400 wide uses this on its own.
- **C, tabs in the status bar (a mock-up, not built).** Out of the way, but it is the bottom corner nobody looks at when they wonder where they are.

Preferences > General > Workspace switcher picks Tabs, Chip or Hidden, and the command search has all three.

## Your own workspaces (switcher-list-*.png)

Each gets a tab after the three that come with Frameling. Five tabs fit; the rest wait in the arrow's list, and the workspace you are in always keeps a tab (here "Tiny" took the last one). The arrow's list shows all of them with a tick on the current one, plus **Save layout as a workspace...** and **Manage workspaces...**. The chip opens the same list.

## Small windows (switcher-small-window-*.png)

At 1280 wide the longer menu names and three tabs leave the drawing's name no room, so the tabs give way to the chip and the name stays (cut short, not gone).

## The menus (menus-renamed-*.png)

| Was | Is now | What is in it |
| --- | --- | --- |
| Draw | Tools and layers | the drawing tools, flips, arranging, layers |
| Pixel | Pixel tools | pixel tools, outlines, palette, Preview |
| Animate | Frames and motion | play, frames, onion skin, keys, camera, lip sync, one-click motions |

Keys: **Ctrl+Alt+1** Draw, **Ctrl+Alt+2** Animate, **Ctrl+Alt+3** Pixel (Cmd+Option on a Mac), shown in the View menu and the lists.
