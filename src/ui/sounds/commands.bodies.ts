// The words of the help topics in commands.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  sounds: `Frameling can make a few soft sounds, so you hear that something happened without looking. They're **on** to start with, and quiet.

## Turn them off or on

Open **Preferences** (**Ctrl+,**), choose **General** and switch **Sounds** off or on. While they're on, a **Volume** slider shows, with a **Try** button that plays each sound once. Or use **View, Sounds on or off**.

## What you'll hear

- **A quest step done**: a little two-note ting.
- **A quest finished**: a happy rising chime with a sparkle.
- **An export finished**: a calm "done".
- **Can't do that**: two low soft notes, when a message says no or something went wrong.
- **Nothing left to undo**: a gentle wooden tock when you press **Ctrl+Z** with nothing to take back.
- **Frame step**: a tiny paper flick when you step with **,** and **.** (never while it's playing).
- **Quill's goodbye**: a little sad falling tune when you hide Quill.

## Calm and quiet

- Sounds never pile up: holding a key or a burst of messages plays one now and then, not a buzz.
- With **Reduce motion** on (or when your computer asks apps to be calm), the just-for-fun frame flick stays quiet. The sounds that tell you something still play.
- Every sound is made by Frameling itself, very short and quiet. Your animation's own [sound](help:sound) is separate and has its own volume.`,
  'shortcut-sets': `Coming from another tool? Pick a shortcut set and your fingers already know the way.

## Pick one

Open **Preferences** (**Ctrl+,**), choose **Keyboard**, and pick a **Shortcut set** at the top. Or find "Shortcut set" in the [command palette](help:command-palette).

- **Frameling**: the keys Frameling starts with. Good if you're new to animation tools. On a pixel sprite it already has **+** for a bigger brush, **[** and **]** along the palette and **1** to **6** to zoom.
- **Familiar from Flash / Animate**: **F5** adds a frame, **F6** a new drawing that copies this one, **F7** an empty one, **Shift+F5** removes a frame. **Ctrl+E** draws inside a symbol. Tools: **Y** pencil, **N** line, **K** paint bucket, **L** lasso, **M** bone. **Ctrl+J** is canvas size, and **Ctrl+Up** and **Ctrl+Down** move things forward and back.
- **Aseprite keys**: **B** pencil, **U** rectangle, **Shift+U** ellipse, **M** select, **Q** lasso, **X** swaps the colours. **+** and **-** change the brush size, **[** and **]** step along the palette, **1** to **6** zoom from 100% to 3200%, **Tab** hides the panels. **Alt+N** adds a frame (a copy), **Alt+B** an empty one, **Alt+C** removes one, **F3** shows the onion skin. **Alt+Left** and **Alt+Right** step through frames, and the plain arrow keys nudge a selection, as in Frameling. See [Aseprite habits](help:pixel-aseprite-habits) for the whole list.

## Your own changes stay

Anything you changed yourself sits on top of the set, so switching sets never loses it. **Reset all** takes you back to the set's keys. A key the set gives to one command is taken off whatever had it before, so nothing clashes.

See [Keyboard shortcuts](help:keyboard-shortcuts) to change any single key.`,
};
