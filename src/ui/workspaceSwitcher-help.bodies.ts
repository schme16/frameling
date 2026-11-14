// The words of the help topic in workspaceSwitcher-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'workspace-switcher': `A [workspace](help:workspaces) is a whole room of tools and panels, set up for one job. The switcher sits at the top, beside the drawing's name, and lights up the one you are in: **Draw**, **Animate** or **Pixel**, and any of your own.

**Change room:** press a tab. The panels, the tools and the timeline rearrange at once, and it is one press to go back.

**By key:** **Ctrl+Alt+1** is Draw, **Ctrl+Alt+2** is Animate and **Ctrl+Alt+3** is Pixel (on a Mac, **Cmd+Option**). They are also in **View**, and in the command search. Want a key for one of your own? Find it in **Preferences > Keyboard**.

**Your own workspaces** get a tab each, after the three that come with Frameling. When there are too many tabs to fit, the little arrow at the end opens the whole list, with **Save layout as a workspace...** and **Manage workspaces...** underneath. The one you are in always keeps its tab.

**A narrow window** turns the tabs into a **chip**: one button with the name of your workspace. Press it for the list.

## Pick how it looks

**Preferences > General > Workspace switcher** has three choices:

- **Tabs** shows every workspace at once.
- **Chip** shows just the one you are in, and keeps the top bar quiet.
- **Hidden** takes it away. You can still switch from **View**, or with **Next workspace** in the command search.

The command search has them too: type "workspace switcher".

## Which menu is which?

The menus are not the workspaces, so they are named for what is in them:

- **Tools and layers** has the drawing tools, flips, arranging, layers, effects and masks.
- **Pixel tools** has the pixel art tools, outlines, the palette and the Preview.
- **Frames and motion** has playing, stepping between frames, onion skin, keys, the camera, the skeleton (rig), artboards, lip sync and one-click motions.

Good to know: switching workspace only moves your panels around. Your drawing, your selection and your undo steps stay exactly as they were.

See also [Workspaces](help:workspaces) for saving and sharing your own, and [The menu bar](help:menus).`,
};
