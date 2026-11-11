// Help for everything the shell does. Short words, what it does first, then how.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'welcome',
    title: 'Welcome to Frameling',
    section: 'Getting started',
    summary: 'Frameling is a friendly place to draw and make things move.',
    keywords: ['start', 'intro', 'begin', 'hello', 'first'],
    body: `Frameling lets you draw pictures and make them move, one frame at a time. It works for smooth vector art and for chunky pixel art.

## Starting

When Frameling opens, pick a card on the welcome sheet:

- **Doodle** is a wide, roomy page for sketching and cartoons.
- **Square** is good for icons and posts.
- **Game sprite** and **Tiny sprite** are pixel art, with big square pixels.
- **Custom** lets you choose the size yourself.

Press **Open** if you already have a drawing to carry on with.

## Your first animation

Draw something on one frame. Move to the next frame and draw it again, a little bit different. Press play. That is animation! The **first animation in 60 seconds** card on the welcome sheet walks you through it.

## Stuck?

Press **F1** over anything to read about it, or press **Ctrl+K** and type what you want to do. See [Finding things](help:command-palette).`,
  },
  {
    id: 'new-document',
    title: 'Starting a new drawing',
    section: 'Getting started',
    summary: 'Pick a size and start. You can change your mind later.',
    keywords: ['new', 'create', 'size', 'canvas', 'blank', 'preset', 'pixel size', 'fps'],
    body: `Open the chooser with **File, New drawing** or **Ctrl+N** (**Cmd+N** on a Mac).

## The cards

| Card | Size | What it is |
| --- | --- | --- |
| Doodle | 1280 x 720 | Vector drawing, 12 frames a second |
| Square | 1080 x 1080 | Vector drawing, 12 frames a second |
| Game sprite | 64 x 64 pixels | Pixel art, each pixel drawn 8 times bigger |
| Tiny sprite | 32 x 32 pixels | Pixel art, each pixel drawn 16 times bigger |

## Custom

Choose a name, a width and a height, and how many frames a second it plays. Tick **Pixel art** to draw with big square pixels, then say how big each one is.

> Frames a second (fps) is how fast the drawing plays. 12 feels hand-drawn, 24 feels like film.

## Unsaved work

If your current drawing has changes you haven't saved, Frameling asks before it starts the new one.`,
  },
  {
    id: 'using-help',
    title: 'Using help',
    section: 'Getting started',
    summary: 'Help is one key away, and it knows what you are pointing at.',
    keywords: ['f1', 'docs', 'manual', 'learn more', 'tooltip', 'search'],
    body: `## Press F1

Point at something, or click into it, and press **F1**. Frameling opens the help page for that thing. If there is no page for it, you get the contents.

## Tooltips

Rest your mouse on a button for a moment. A small tip shows its name, what it does and its shortcut. **Learn more** opens its help page.

## Help panel and help window

The **Help** panel sits with the other panels, handy while you work. Press the little window button in it for a bigger view, with the contents down the side.

## Searching

Type in the search box. You don't need to spell things perfectly. Press **Ctrl+K** to search the commands and the help at the same time.`,
  },
  {
    id: 'command-palette',
    title: 'Finding things',
    section: 'Basics',
    summary: 'Press Ctrl+K and type. Frameling finds the command or the help page.',
    keywords: ['palette', 'search', 'find', 'command', 'ctrl+k', 'run', 'anything'],
    body: `Can't remember where something lives? Press **Ctrl+K** (**Cmd+K** on a Mac), or **Ctrl+Shift+P**.

## How

1. Type a few words. "onion", "export" or "dark" is plenty.
2. Use the **up and down arrows** to move through the results.
3. Press **Enter** to do it, or **Esc** to close.

Each command shows its shortcut on the right, so you can learn it for next time. Greyed out ones can't be used right now.

Help pages show up in the list too. Choose one to read it.

> With nothing typed, the list starts with the commands you used last.`,
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard shortcuts',
    section: 'Basics',
    summary: 'Every command can have a shortcut, and you can change all of them.',
    keywords: ['keys', 'hotkey', 'rebind', 'keymap', 'conflict', 'mod', 'ctrl', 'cmd'],
    body: `Shortcuts are the quick way to do things. **Mod** means **Ctrl** on Windows and Linux, and **Cmd** on a Mac.

## See them all

Open **Help, Keyboard shortcuts**, or **Preferences, Keyboard**. Commands are grouped. Use the search box to find one.

## Change one

1. Press **Change** next to the command, or **Add** for a second shortcut.
2. Press the keys you want. **Esc** cancels.
3. If something else already uses those keys, Frameling tells you. You can **take it** for this command, or cancel.

Press the small **x** on a shortcut to remove it. **Reset** puts a command back how it came.

## Good to know

- Typing in a text box never triggers shortcuts, so you can type a name with the letter b in it.
- **Space** is for moving the canvas around. Holding it pauses every other shortcut.
- Each tool has a single-letter key. Change those here too.`,
  },
  {
    id: 'preferences',
    title: 'Preferences',
    section: 'Settings',
    summary: 'Look, sounds, shortcuts and workspaces, all in one place.',
    keywords: ['settings', 'options', 'config'],
    body: `Open it with **Ctrl+,** (**Cmd+,** on a Mac), or **View, Preferences**.

There are three pages:

- **General**: [theme and look](help:look-and-feel), sounds, motion and the welcome sheet.
- **Keyboard**: see and change [shortcuts](help:keyboard-shortcuts).
- **Workspaces**: save and switch [panel layouts](help:workspaces).

Changes happen straight away and are remembered for next time.`,
  },
  {
    id: 'look-and-feel',
    title: 'Theme and look',
    section: 'Settings',
    summary: 'Dark or light, soft or sharp. Make it feel right for you.',
    keywords: ['dark', 'light', 'theme', 'cosy', 'crisp', 'motion', 'animation', 'reduce', 'sounds', 'rounded'],
    body: `## Theme

**System** follows your computer. **Dark** is easy on the eyes at night. **Light** is bright and papery. Switch quickly with **View, Switch dark or light**.

## Look

- **Cosy** is soft and rounded, with friendly bouncy movement.
- **Crisp** is tighter and sharper, closer to a classic tool.

Try both. Neither changes how anything works.

## Reduce motion

Turn this on to stop bouncing and fading. Frameling also does this by itself when your computer asks apps to be calm.

## Sounds

A switch for sound effects. They aren't there yet, so for now it just remembers your choice.`,
  },
  {
    id: 'workspaces',
    title: 'Workspaces',
    section: 'Workspace',
    summary: 'A workspace is a saved way of arranging your panels.',
    keywords: ['layout', 'panels', 'draw', 'animate', 'pixel', 'reset', 'save', 'arrange'],
    body: `Different jobs want different rooms. Frameling comes with three:

- **Draw** has the tools and colours close, and a small timeline.
- **Animate** gives the timeline lots of room.
- **Pixel** puts the colour palette on the left.

## Switching

Use **View, Draw workspace** (and friends), or the command search.

## Your own

Arrange the panels how you like. Then open **Preferences, Workspaces**, type a name and press **Save**. It shows up in the View menu next to the others.

## Reset

**View, Reset layout** puts the panels back where the current workspace began. Handy if things get tangled.

See also [Panels](help:panels).`,
  },
  {
    id: 'panels',
    title: 'Panels',
    section: 'Workspace',
    summary: 'Panels dock on the left, right and bottom. Drag them where you like.',
    keywords: ['dock', 'tabs', 'drag', 'resize', 'collapse', 'splitter', 'hide', 'show', 'move'],
    body: `Panels hold things like the timeline, layers and colours. They live in three zones: **left**, **right** and **bottom**.

## Move

Drag a panel's **tab** to another place in the same zone to reorder it, or onto another zone to move it there. A glow shows where it will land.

## Resize

Drag the thin line between a zone and the canvas. Arrow keys work too when the line has focus.

## Collapse

Press the little arrow at the end of a tab bar to tuck a zone away. Press a tab to bring it back.

## Show and hide

Press the **x** on a tab to close that panel. Bring it back from the **View** menu. Panels with a tick are showing.

Your layout is remembered. Save arrangements as [workspaces](help:workspaces).`,
  },
  {
    id: 'tool-strip',
    title: 'The tool strip',
    section: 'Basics',
    summary: 'The tools down the left side. Pick one to draw with.',
    keywords: ['tools', 'toolbar', 'brush', 'shortcut', 'layer kind'],
    body: `The strip down the left holds your tools. The one with the gold glow is the one you're using.

## Choose a tool

Press its button, or press its key. Rest on a button to see the key.

## Not every tool is always there

Pixel layers and vector layers need different tools. The strip shows the ones that work on the layer you're drawing on, so you never pick one that can't help.

Tool keys can be changed in [keyboard shortcuts](help:keyboard-shortcuts).`,
  },
  {
    id: 'menus',
    title: 'The menus',
    section: 'Basics',
    summary: 'File, Edit, View, Draw, Animate and Help, along the top.',
    keywords: ['menu bar', 'file', 'edit', 'view', 'draw', 'animate'],
    body: `The menu bar is along the top. Press a name to open it, then press a choice.

- A **tick** means it is switched on.
- **Greyed** choices can't be used right now (nothing to undo yet, for example).
- Shortcuts are shown on the right.

With a menu open, use the **arrow keys** to move, **Enter** to choose, and **Esc** to close.`,
  },
  {
    id: 'status-bar',
    title: 'The status bar',
    section: 'Basics',
    summary: 'The thin strip at the bottom: zoom, size, speed, frame and a tip.',
    keywords: ['zoom', 'size', 'fps', 'frame', 'tips', 'bottom'],
    body: `The strip along the bottom tells you where you are.

- **Zoom** is how big the canvas looks.
- **Size** is your drawing's width and height.
- **fps** is how many frames play each second.
- **Frame** is which frame you're on, out of how many.
- A friendly **tip** changes every so often. Press it to see another. Turn tips off in **Preferences, General**.`,
  },
  {
    id: 'document-name',
    title: 'Naming your drawing',
    section: 'Basics',
    summary: 'The name at the top. Press it to change it.',
    keywords: ['rename', 'title', 'dirty', 'unsaved', 'dot'],
    body: `Your drawing's name sits in the middle of the top bar. Press it, type a new name and press **Enter**.

A small **dot** beside the name means there are changes you haven't saved yet.

The **undo** and **redo** buttons beside it do the same as **Ctrl+Z** and **Ctrl+Shift+Z**. See [Undo and redo](help:undo).`,
  },
  {
    id: 'messages',
    title: 'Little messages',
    section: 'Basics',
    summary: 'Gentle notes that pop up and go away by themselves.',
    keywords: ['toast', 'notification', 'undo button', 'alert'],
    body: `Now and then Frameling tells you something in a small message near the bottom. It goes away on its own.

If a message has a button, like **Undo**, press it before the message leaves to take something back. Resting your mouse on a message keeps it there.`,
  },
  {
    id: 'quests',
    title: 'Quests',
    section: 'Getting started',
    summary: 'Short guided lessons that teach by doing.',
    keywords: ['tutorial', 'guide', 'lesson', 'learn', 'first animation'],
    body: `A quest is a little lesson with a few steps. You do each one in the real app, and Frameling ticks it off.

The first one, **Your first animation in 60 seconds**, is on the welcome sheet. Quests are still being built, so for now it only points the way.`,
  },
]);
