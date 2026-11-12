// Help for everything the shell does. Short words, what it does first, then how.
import { registerHelpTopics } from '../core/registry';
import './onboarding/help';

registerHelpTopics([
  {
    id: 'welcome',
    order: 1,
    title: 'Welcome to Frameling',
    section: 'Getting started',
    media: 'welcome.png',
    summary: 'Frameling is a friendly place to draw and make things move.',
    keywords: ['start', 'intro', 'begin', 'hello', 'first'],
    body: `Frameling lets you draw pictures and make them move, one frame at a time. It works for smooth vector art and for chunky pixel art.

## Starting

The very first time, [Quill says hello](help:first-run) and helps you set things up. After that, when Frameling opens, pick a card on the welcome sheet:

- **Doodle** is a wide, roomy page for sketching and cartoons.
- **Square** is good for icons and posts.
- **Game sprite** and **Tiny sprite** are pixel art, with big square pixels.
- **Custom** lets you choose the size yourself.

Press **Open** if you already have a drawing to carry on with.

## Your first animation

Draw something on one frame. Move to the next frame and draw it again, a little bit different. Press play. That is animation! The **first animation in 60 seconds** card on the welcome sheet walks you through it.

## Stuck?

Press **F1** over anything to read about it, or press **Ctrl+K** and type what you want to do. See [Finding things](help:command-palette).

Want the whole picture first? See [What's in Frameling](help:whats-in-frameling).`,
  },
  {
    id: 'whats-in-frameling',
    order: 2,
    title: "What's in Frameling",
    section: 'Getting started',
    media: 'tour.mp4',
    summary: 'Everything Frameling can do on one page, with a link to each part.',
    keywords: ['overview', 'tour', 'features', 'everything', 'what can it do', 'contents', 'map'],
    body: `Frameling is for drawing pictures and making them move. Here's everything in it, in the order most people meet it.

## Draw

- [Brush](help:tool-brush), [Pencil](help:tool-pencil), [Eraser](help:tool-eraser) and [shapes](help:tool-rect).
- [Colours](help:fill-and-stroke), the [paint bucket](help:fill) and [text](help:text).
- [Select and move](help:selecting), [copy](help:copy-paste), [flip](help:flip) and [stack](help:arrange) things.
- [Rulers and guides](help:rulers-guides), and [moving around the page](help:canvas-navigation).

## Animate

- The [timeline](help:timeline): [frames, keys and holds](help:timeline-frames), [layers](help:timeline-layers), [playing](help:timeline-playing).
- [Onion skin](help:timeline-onion) shows the frames around this one, so you can draw the next pose.
- [Clips](help:timeline-clips) and [markers](help:timeline-markers) name the parts of an animation.

## Pixel art

[Big square pixels](help:pixel-art) with a [palette](help:palette), [shading](help:tool-shade), [dithering](help:tool-dither) and [mirror drawing](help:pixel-mirror). [Tiles](help:tileset) build game maps.

## Symbols and motion

Draw once, reuse it as a [symbol](help:symbols), and let Frameling draw the [in-betweens](help:tweens) with [easing](help:easing), [paths](help:motion-paths) and [morphs](help:shape-tweens). Add a [camera](help:camera).

## Bones

[Pose a character like a puppet](help:rig): draw a skeleton, attach the parts and pose.

## Effects

[Glow, shadow and blur](help:effects), [blend modes](help:blend-modes), [masks](help:masks) and [particles](help:particles) like sparkles and snow.

## Sound

Add [speech, music and effects](help:sound), and let [lip sync](help:lip-sync) pick the mouths.

## Save and share

[Save your work](help:saving-and-opening) ([autosave](help:autosave) keeps a safety copy). [Export](help:exporting) a [video or GIF](help:export-video-gif-apng), [sprite sheets](help:export-sprite-sheets) for games, [SVG](help:export-svg) and more.

## Make it yours

[Preferences](help:preferences), [themes](help:themes), [panels](help:panels), [workspaces](help:workspaces), [keyboard shortcuts](help:keyboard-shortcuts) and [plugins](help:plugins).

## Learn as you go

[Quests](help:quests) are short guided lessons. [Examples](help:examples) are ready-made animations to pull apart. Press **F1** over anything to read about it.`,
  },
  {
    id: 'new-document',
    order: 3,
    title: 'Starting a new drawing',
    section: 'Getting started',
    media: 'new-document-cards.png',
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
    order: 6,
    media: 'using-help.png',
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
    order: 1,
    title: 'Finding things',
    section: 'Basics',
    media: 'command-palette.png',
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
    media: 'keyboard-shortcuts.png',
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

## Keys from another tool

Used Flash / Animate or a pixel tool before? Pick a [shortcut set](help:shortcut-sets) at the top of the page.

## Good to know

- Typing in a text box never triggers shortcuts, so you can type a name with the letter b in it.
- **Space** is for moving the canvas around. Holding it pauses every other shortcut.
- Each tool has a single-letter key. Change those here too.
- Tools for different kinds of layer can share a letter: **B** is the Brush on a drawing layer and the Tile brush on a tile layer. That's not a clash, because only one of them works at a time.
- A few keys moved so nothing clashes: **Lasso** is **Shift+L** (the Line tool keeps **L**), and the **Pose** tool is **Shift+K** (next to the Bone tool's **K**; the Ellipse keeps **O**).

## Without a mouse

- **Tab** moves between buttons and boxes (hold **Shift** to go back). The one you're on has a ring round it.
- In a row of choices (tabs, the options in a panel), a list or a menu, the **arrow keys** move between them.
- **Enter** or **Space** presses the button you're on. (When you got there with Tab, Enter presses it rather than playing the animation.)
- With a slider or a list picked, the arrow keys change that, not the selection on the canvas.
- **Esc** closes a dialog or menu, and you land back where you were.
- **Mod+K** finds any command by name, even ones with no shortcut.`,
  },
  {
    id: 'preferences',
    order: 1,
    title: 'Preferences',
    section: 'Settings',
    media: 'preferences.png',
    summary: 'Themes, sounds, shortcuts and workspaces, all in one place.',
    keywords: ['settings', 'options', 'config'],
    body: `Open it with **Ctrl+,** (**Cmd+,** on a Mac), or **View, Preferences**.

There are five pages:

- **General**: [mode and look](help:look-and-feel), [units](help:units), [sounds](help:sounds), motion, the welcome sheet and [Show Quill](help:meet-quill).
- **Themes**: pick [themes](help:themes) and [make your own](help:make-your-own-theme).
- **Behaviour**: [the choices Frameling asked you about](help:behaviour), like what N does.
- **Keyboard**: see and change [shortcuts](help:keyboard-shortcuts), or pick a [shortcut set](help:shortcut-sets).
- **Workspaces**: save and switch [panel layouts](help:workspaces).

Changes happen straight away and are remembered for next time.`,
  },
  {
    id: 'installing',
    title: 'Installing Frameling',
    section: 'Getting started',
    media: 'installing.png',
    summary: 'Windows and macOS ask you to say Frameling is OK the first time you open it. Here is how.',
    keywords: ['install', 'installer', 'download', 'smartscreen', 'run anyway', 'gatekeeper', 'damaged', 'cannot be opened', 'unidentified developer', 'open anyway', 'signed', 'certificate', 'windows protected your pc'],
    body: `Frameling is signed, but not yet with a paid certificate, so Windows and macOS don't recognise it. The first time you open it they ask you to say it's OK. After that it opens like any other app.

## Windows

1. Open **Frameling-setup** (the installer) or **Frameling-portable** (runs without installing).
2. If a blue **Windows protected your PC** box appears, click **More info**.
3. Click **Run anyway**.

The publisher shows as **Frameling (self-signed)**.

## macOS

1. Open the **.dmg** and drag **Frameling** into **Applications**.
2. In Applications, **right-click** (or Control-click) Frameling and choose **Open**, then **Open** again.
3. If macOS still won't open it, go to **System Settings**, **Privacy & Security**, scroll down and click **Open Anyway**.

## Linux

Make the **AppImage** executable (right-click, **Properties**, **Allow executing as a program**, or \`chmod +x\`) and double-click it.

## Or skip installing

The [web version](help:web-browser) runs in Chrome, Edge or Firefox with nothing to install.`,
  },
  {
    id: 'meet-quill',
    title: 'Meet Quill',
    section: 'Getting started',
    media: 'quill-goodbye.mp4',
    summary: 'Quill is the little hedgehog who shows you round. You can hide him in Preferences.',
    keywords: ['quill', 'hedgehog', 'mascot', 'guide', 'helper', 'character', 'hide', 'show quill', 'turn off', 'goodbye', 'sad'],
    body: `Quill is a small pixel-art hedgehog whose quills are coloured pencils. He turns up to help:

- He **waves** hello on the welcome sheet and in **Help, About Frameling**.
- In a [quest](help:quests) he reads each step out in a speech bubble, **points** while the gold ring shows where to look, and **cheers** when you finish a step or earn a badge.
- While an export is being made he has a **think**. He cheers on the message when it's done, and says **oops** if something went wrong.
- He keeps you company where there's nothing to show yet, like a help search with no results.
- A message that says no (or that something failed) has a tiny Quill on it.

If nothing happens for about a minute he dozes off. Move the mouse or press a key and he wakes up.

## Hiding Quill

Open **Preferences** (**Ctrl+,**), choose **General** and turn off **Show Quill** (or turn it off on the settings step of **Help > Meet Quill again**). He goes away everywhere. Anything he was saying still shows, just without him.

He'll be a little sad about it (a sniffle, maybe a tear), but he understands. He waves a brave goodbye and then hides. Want him back? Turn **Show Quill** on again, or say hi from **Help > Meet Quill again**. He'll cheer.

## Less movement

With **Reduce motion** on (or when your computer asks apps to be calm), Quill stands still in one pose instead of moving. See [Mode and look](help:look-and-feel).`,
  },
  {
    id: 'behaviour',
    title: 'Behaviour choices',
    section: 'Settings',
    media: 'behaviour-choice.png',
    summary: 'Some things people like differently. Frameling asks the first time, then remembers.',
    keywords: ['ask', 'remember', 'choice', 'behaviour', 'behavior', 'preference', 'held', 'space', 'wheel'],
    body: `Animators work in different ways. For things like "should a new drawing start blank or as a copy?", Frameling asks you the first time it comes up, with a short explanation of each option.

Tick **Remember my choice** and it won't ask again. Untick it to be asked again next time.

## Changing your mind

Open **Preferences** (**Ctrl+,**) and choose **Behaviour**. Every choice is listed there. Pick a different answer, or pick **Ask me** to be asked again next time.`,
  },
  {
    id: 'features',
    title: 'Turning parts on and off',
    section: 'Settings',
    media: 'features.png',
    summary: 'Switch off the parts of Frameling you do not use, to keep it simple. Your drawings keep everything.',
    keywords: ['turn off', 'turn on', 'switch', 'hide', 'optional', 'simple', 'disable', 'enable', 'switch off'],
    body: `Some parts of Frameling are optional. If you never use one, you can switch it off, and its panels, tools, commands, menu entries, help and example drawings go quiet until you want them back.

## Switching one on or off

Open **Preferences** (**Ctrl+,**) and choose **Features**, or search the command palette (**Ctrl+K**) for **Features**. Each feature has a switch and a line about what it does. Changes happen at once. You never need to restart.

## Your drawings are safe

Turning a feature off never changes a file. If a drawing uses a feature that is off, Frameling asks when you open it: **Turn it on?** Say yes and everything works as before. Say no and the drawing still opens, still draws the same, and keeps all of its data, so you can turn the feature on later and carry on.

## Help for a feature that is off

Help topics for a feature that is off are hidden. If you search for one, Frameling says so and gives you a **Turn on** button.

Some features need others. If you try to turn one off while another needs it, Frameling tells you which to turn off first.`,
  },
  {
    id: 'look-and-feel',
    media: 'look-and-feel.png',
    title: 'Mode and look',
    section: 'Settings',
    summary: 'Dark or light, soft or sharp. Make it feel right for you.',
    keywords: ['dark', 'light', 'mode', 'theme', 'cosy', 'crisp', 'motion', 'animation', 'reduce', 'sounds', 'rounded'],
    body: `## Mode

**System** follows your computer. **Dark** is easy on the eyes at night. **Light** is bright and papery. Switch quickly with **View, Switch dark or light**.

Which colours you get in each mode is up to you: see [Themes](help:themes).

## Look

- **Cosy** is soft and rounded, with friendly bouncy movement. It's the one Frameling starts with.
- **Crisp** is tighter and sharper, closer to a classic tool.

Try both. Neither changes how anything works, and every [theme](help:themes) works with both.

## Reduce motion

Turn this on to stop bouncing and fading. Quill stands still instead of moving. Frameling also does this by itself when your computer asks apps to be calm.

## Sounds

Soft little sounds for quest steps, finished exports and "no". They're on to start with; switch them off here. See [Sounds](help:sounds).`,
  },
  {
    id: 'themes',
    title: 'Themes',
    section: 'Settings',
    media: 'themes.png',
    summary: 'Pick the colours Frameling wears, one for dark mode and one for light.',
    keywords: ['theme', 'themes', 'colour', 'color', 'colours', 'dark', 'light', 'contrast', 'high contrast', 'accessibility', 'palette', 'pastel', 'midnight', 'cocoa', 'strawberry', 'camo', 'aqua', 'lavender', 'lilac'],
    body: `A theme is a set of colours for the whole app. Frameling comes with several, each with a silly name and a calm mood.

## Choosing

Open **Preferences** (**Ctrl+,**), then **Themes**. You'll see two groups:

- **For dark mode**: pick the theme to use when Frameling is dark.
- **For light mode**: pick the theme to use when Frameling is light.

Press a card to pick it. The change is instant. A tick shows which one is in use.

## Dark, light and System

The **Mode** switch decides which group is showing:

- **Dark** always uses your dark theme.
- **Light** always uses your light theme.
- **System** follows your computer. When your computer goes dark in the evening, Frameling switches to your dark theme by itself, and back to your light theme in the morning.

So you can have a pastel theme by day and a cosy dark one at night, without touching anything.

## The themes

| For dark mode | For light mode | Mood |
| --- | --- | --- |
| **Midnight Sketchbook** | **Paper & Honey** | The classic Frameling look. |
| **Moonlit Pond** | **Studio White** | Calm and plain. |
| **Hot Cocoa** | **Strawberry Milk** | Warm and cosy, soft and pink. |
| **Strawberry Night** | **Strawberry** | Berry red, cream and little yellow seeds. Quill's favourite. |
| **Glacier Grid** | **Ice Camo** | Charcoal, ice and bright aqua, with a faint camo print around the page. |
| **Lilac Static** | **Lavender Hum** | Soft lilac with a little pastel glow. |
| **Lantern Night** | **Sunbeam** | Extra contrast. |

Chosen things (the tool, the tab, a switch that is on) are gold in most themes. The aqua and lilac themes use their own colour instead, still with dark words on it.

## Easier to see

**Lantern Night** (dark) and **Sunbeam** (light) have extra contrast: brighter words and stronger borders. Try them if small text is hard to read.

## Themes and the look

Themes are only colours. [Cosy or Crisp](help:look-and-feel) is separate, so you can mix any theme with either look.

## Make it yours

Press **Make a copy to customise** on any card to [make your own theme](help:make-your-own-theme).`,
  },
  {
    id: 'make-your-own-theme',
    title: 'Making your own theme',
    section: 'Settings',
    media: 'theme-editor.png',
    summary: 'Copy a theme, change the colours you like, and see it on the whole app as you go.',
    keywords: ['custom', 'customise', 'customize', 'theme', 'editor', 'colour', 'color', 'picker', 'export', 'import', 'share', 'contrast', 'readable', 'palette', 'copy', 'clone'],
    body: `You can't break anything: you always work on your own copy, and the built-in themes stay as they were.

## Start

Open **Preferences, Themes**, and press **Make a copy to customise** on a theme you almost like. (Or press **Make my own theme** to copy the one you're using.) The editor opens and your copy is switched on, so the whole app shows it as you work.

## Change colours

The colours are in friendly groups: **Background**, **Panels**, **Text**, **Accent (gold)**, **Timeline**, **Canvas surround** and **Messages**. Press a square to pick a colour, or type a colour code like \`#ffc94a\`.

Changes show straight away on the picture in the editor and on the app behind it. Hold **Hold to peek** to see the whole app without the dialog in the way.

## Start from a colour

Not sure where to begin? Under **Start from a colour**, pick one colour you like, choose dark or light, and press **Make my palette**. Frameling works out backgrounds, text and highlights to go with it. It's a starting point, so tweak anything after. You can undo it.

## Easy to read

Frameling checks the words against what they sit on. If something may be hard to read, you'll see a warning in plain words under that colour, and a **Make it easier to read** button that nudges the text colour for you. **Fix them for me** does all of them at once.

Gold stays gold for chosen things by default, with dark text on it. If you change it, keep the text on it a strong contrast.

## Undo, reset and more

- **Undo** and **Redo** step through your changes.
- **Reset** goes back to the theme you copied (or to how it was when you opened it).
- **Duplicate** makes another copy to try something different.
- **Delete** removes your theme. If it was in use, Frameling goes back to the usual one.
- Rename it any time by typing in the name box at the top.
- A theme is **for dark mode** or **for light mode**. Change that with the switch under the picture.

## Share a theme

**Export** saves your theme as a small file ending in **.frameling-theme.json**. Send it to a friend. On the **Themes** page, **Import a theme file** adds one to your list. If the file isn't a theme, Frameling says so and changes nothing.`,
  },
  {
    id: 'workspaces',
    title: 'Workspaces',
    section: 'Workspace',
    media: 'workspaces.png',
    summary: 'A workspace is a saved way of arranging your panels. Keep your own, and share them.',
    keywords: ['layout', 'panels', 'draw', 'animate', 'pixel', 'reset', 'save', 'arrange', 'share', 'export', 'import', 'rename', 'reorder', 'file', 'copy', 'paste'],
    body: `Different jobs want different rooms. Frameling comes with three, and each says what it is for:

- **Draw** has the tools and colours close, and a small timeline.
- **Animate** gives the timeline lots of room.
- **Pixel** is made for pixel art: only the pixel tools, a big palette, a real-size Preview and the pixel bar. See [The Pixel workspace](help:pixel-workspace).

## Switching

Use **View, Draw workspace** (and friends), or the command search. **Next workspace** and **Previous workspace** step through the list.

## Your own

Arrange the panels how you like: dock them on any side, float some in windows (see [Floating windows](help:floating-windows)), name them, and arrange the tools into the groups you like (see [Arrange your tools](help:tool-arrange)). Then open **Preferences, Workspaces**, type a name and press **Save**. You can keep up to 12. It shows up in the View menu next to the others.

On that page you can also:

- **Rename** one, or move it **up** or **down** the list.
- **Update** one to the layout you have now.
- **Delete** one (it asks once more, so a slip doesn't cost you anything).

## Share

Every workspace has a **Save as a file** button. Send the file to a friend. On their **Workspaces** page, **Add a workspace file** puts it in their list. If the file isn't a workspace, Frameling says so and changes nothing.

Prefer a message? **Copy as text** puts the whole workspace on your clipboard. Your friend pastes it into **Paste workspace text here** and presses **Add it to my workspaces**.

A shared workspace only moves panels around. If it names a panel your Frameling doesn't have, that one is skipped, and a panel it doesn't mention goes where it normally lives.

## Reset

**View, Reset layout** puts the panels back where the current workspace began. Handy if things get tangled.

See also [Panels](help:panels).`,
  },
  {
    id: 'properties',
    order: 2,
    media: 'properties.mp4',
    title: 'Properties',
    section: 'Workspace',
    summary: 'The settings for what you are doing now, in one place on the right.',
    keywords: ['inspector', 'settings', 'options', 'selection', 'tool options', 'colours', 'effects', 'symbol', 'text', 'where is', 'find a setting', 'right side', 'sections', 'fold', 'rail', 'tabs', 'layout'],
    body: `**Properties** is the first place on the right side's rail. It shows the settings for what you're doing right now, as sections in one list, so you don't have to know which panel holds what.

Prefer it another way? **Preferences**, **General**, **Right side** offers **Rail** (every panel on the labelled rail, one at a time) or **Tabs** (the older row of tabs across the top, with a **Panels** list).

## What shows

- **Tool options** and **Colours** are always there while you draw.
- Select a **symbol** and its size, turn, fade and in-betweens (**Symbol and motion**) show, with **Effects** for its layer. Selected things come first.
- Pick the **Text** tool or select text and the text settings show. Select particles, pick the camera layer or the **Bone** tool and theirs do.

## Also here

Sections that don't apply yet wait at the bottom under **Also here**, each with what brings it up ("Select particles on the canvas"). Press one to open it anyway.

## Fold sections

Press a section's name to fold it, and again to open it. **Alt**-click opens only that one. Right-click folds or opens them all. Folded sections stay folded next time.

## Help on anything

Each section has a **?** that opens its help. Rest the mouse on a name on the rail to see what it's for.

## With the keyboard

Section names are buttons: **Tab** to one, **Enter** or **Space** folds it. Screen readers hear each section as a heading.

Want a section somewhere else? Drag its name onto the left or bottom zone. See [Panels](help:panels).`,
  },
  {
    id: 'panels',
    order: 1,
    media: 'panels.png',
    title: 'Panels',
    section: 'Workspace',
    summary: 'Panels dock on the left, right and bottom. The right side names every one on its rail.',
    keywords: ['dock', 'tabs', 'more', 'overflow', 'drag', 'resize', 'collapse', 'splitter', 'hide', 'show', 'move', 'missing panel', 'lost panel', 'panel gone', 'bring back', 'close panel'],
    body: `Panels hold things like the timeline, layers and colours. They dock in four zones: **left**, **right**, **bottom** and **top**, or float in a window of their own. See [Floating windows](help:floating-windows). A zone with nothing in it takes no room.

## The right side

The right side has a **rail** down its edge: an icon with a name for every place there, so you can see everything at a glance.

- **Properties** comes first. It holds the settings for what you're doing now. See [Properties](help:properties).
- Below it are the panels you open now and then: **Library**, **Clip flow**, **Lip sync**, **Quests** and **Help**. Press one to open it, and press it again to fold the side away.
- **Panels**, at the bottom of the rail, lists every panel with a sentence on what it's for. Type to find one. Panels you closed are there too, marked *Closed*: pick one to bring it back. It's also in the **View** menu as **All panels**.

## Move

Drag a panel's **tab** (or its name on the rail) to another place to reorder it, or onto another zone to move it there. While you drag, bands light up along the edges of the canvas: drop on one to dock there. Right-click a tab for the same moves as a list, and to **Rename** it.

## When the tabs don't all fit

On the left and bottom, when a zone gets narrow, the other tabs shrink to just their icon (hover one to see its name). If even that's not enough, a **+N** button lists the rest.

## Resize

Drag the thin line between a zone and the canvas. Arrow keys work too when the line has focus: **Shift** makes bigger steps, **Home** and **End** go to the smallest and largest, **Enter** puts it back to the usual size.

## Collapse

Press the little arrow at the end of a tab bar, or at the bottom of the rail, to tuck a zone away. Press a tab or a rail name to bring it back.

## Show and hide

Press the **x** on a tab (or by a panel's name on the right) to close it, or press **Delete** while its tab has the keyboard. Bring it back from **Panels** or the **View** menu. Panels with a tick are showing.

## With the keyboard

**Tab** lands on the chosen tab of each zone. The **arrow keys** move between tabs (up and down on the rail), **Home** and **End** jump to the first and last.

Your layout is remembered. Save arrangements as [workspaces](help:workspaces).`,
  },
  {
    id: 'floating-windows',
    order: 3,
    media: 'floating-windows.mp4',
    title: 'Floating windows',
    section: 'Workspace',
    summary: 'Drag a panel out to a window of its own, and drag it back to dock it.',
    keywords: ['float', 'window', 'detach', 'undock', 'dock', 'pop out', 'tabs', 'group', 'rename', 'name', 'tools', 'tool strip', 'toolbar', 'move tools', 'top', 'second', 'hide all', 'panels away'],
    body: `Any panel can float over the canvas in a window of its own. Handy for keeping the **Preview** next to your drawing, or a panel out of the way.

## Pop a panel out

Drag a panel's tab (or its name on the right-hand rail) out over the canvas and let go. A dashed box shows the window it will make. You can also right-click the tab and pick **Move to its own window**, or press \`Ctrl+Shift+\\\` while you are working in the panel.

## Group panels

A window can hold several panels as tabs. Drag a tab onto another window's tabs to join it. Drag one back out to split it off. Right-click a tab and use **Group with a window** if you would rather not drag.

## Move and resize

Drag the title bar to move a window. Pull any edge or corner to resize it. Click a window to bring it to the front. Double-click the bar to dock it back.

## Dock it again

Drag a tab, or a whole window by its title bar, towards a side of the canvas. Bands light up to say **Dock left**, **Dock right**, **Dock at the top** and **Dock at the bottom**. Let go on one, or on another zone's tabs, to dock there. **Dock back** on the window's bar sends its panels home.

## Names

Right-click a tab and choose **Rename** to call a panel what you like. Double-click a window's name to name the window. Both are kept in your workspace.

## The tools

The tool strip has a small grip at its top. Drag it to float the tools, or onto a side of the canvas to put them there, even along the top or bottom. Right-click the strip for the same as a list. You can also drag tools into other groups, see [Arrange your tools](help:tool-arrange).

## Room to draw

**Hide all panels** (\`Ctrl+\\\`) puts every panel away. Press it again to bring them back.

## With the keyboard

Press the menu key on a tab, a window's grip or the tool strip's grip to open its menu. On a window's grip, the arrow keys nudge it. Every move is also in the command search.

See also [Panels](help:panels) and [Workspaces](help:workspaces).`,
  },
  {
    id: 'tool-strip',
    title: 'The tool strip',
    section: 'Basics',
    media: 'tool-strip.png',
    summary: 'Your tools, two across, in groups. Pick one to draw with.',
    keywords: ['tools', 'toolbar', 'tool rail', 'brush', 'shortcut', 'layer kind', 'groups', 'two wide', 'stacked', 'flyout'],
    body: `The strip down the left holds your tools, two across. The one with the gold glow is the one you're using.

## Groups

Tools that belong together sit together, with a thin gap between groups: drawing tools, colour and pixel extras, shapes, select and pen, rig and motion, and the view tools (hand and zoom). A tool that came from a plugin and has no group yet goes in **Other**.

## Choose a tool

Press its button, or press its key. Rest on a button to see the key.

## Not every tool is always there

Pixel layers and vector layers need different tools. The strip shows the ones that work on the layer you're drawing on, so you never pick one that can't help.

## Your way

Drag tools into the order you like, or into other groups. See [Arrange your tools](help:tool-arrange). Right-click the strip to move it to another side, or to put the tools back the way they came.

## One button per group

If you would rather have a thinner strip, open **Preferences, General** and set **Tool rail style** to **Stacked**. Each group becomes one button, with a small corner mark. Press and hold it, or right-click it, to see the rest of the group and pick from there.

Tool keys can be changed in [keyboard shortcuts](help:keyboard-shortcuts).`,
  },
  {
    id: 'tool-arrange',
    title: 'Arrange your tools',
    section: 'Basics',
    media: 'tool-arrange.mp4',
    summary: 'Drag tools into the order you like, into other groups, or into a group of your own.',
    keywords: ['tools', 'toolbar', 'tool strip', 'groups', 'group', 'order', 'reorder', 'rearrange', 'arrange', 'move', 'drag', 'reset', 'default', 'new group', 'stacked'],
    body: `Your tools, your order. Everything on the [tool strip](help:tool-strip) can be moved.

## With the mouse

Press a tool and drag it. A gold bar shows where it will land: beside another tool to put it there, or on a group to add it to the end. Drop it on a gap between two groups to make a **new group** of its own. Press Escape while dragging to put it back.

## With the keyboard

Click or Tab to a tool, then hold **Alt** and press an arrow key. The tool moves one place along the strip, and crosses into the next group at the end of its own. The new place is read out.

## With a menu

Right-click a tool, or press the menu key on it. **Move to** lists every group. **Move to a new group** gives the tool a group by itself. A group that ends up with no tools goes away.

## Put them back

Right-click the strip and choose **Reset tools to default**. It is also in the command search.

## Saved with your layout

The arrangement is kept with the rest of your layout, so a [workspace](help:workspaces) you save keeps it, and a workspace you share carries it along. The built-in workspaces leave your arrangement alone. An older workspace without one simply uses the default groups.

## In the stacked style

With **Tool rail style** set to **Stacked** in Preferences, press and hold a group's button, or right-click it, and drag a tool from the list onto another group's button, or onto a gap to start a new group.`,
  },
  {
    id: 'menus',
    title: 'The menus',
    section: 'Basics',
    media: 'menus.png',
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
    media: 'status-bar.png',
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
    media: 'document-name.png',
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
    media: 'messages.png',
    title: 'Little messages',
    section: 'Basics',
    summary: 'Gentle notes that pop up and go away by themselves.',
    keywords: ['toast', 'notification', 'undo button', 'alert'],
    body: `Now and then Frameling tells you something in a small message near the bottom. It goes away on its own.

If a message has a button, like **Undo**, press it before the message leaves to take something back. Resting your mouse on a message keeps it there.`,
  },
  {
    id: 'examples',
    order: 4,
    title: 'Examples',
    section: 'Getting started',
    media: 'examples.png',
    summary: 'Ready-made drawings to start from, or to pick apart and learn.',
    keywords: ['template', 'sample', 'demo', 'starter', 'learn', 'bouncing ball', 'walk cycle', 'run cycle', 'explosion', 'sticker', 'emoji', 'icons', 'title card', 'spinner'],
    body: `Not sure where to begin? Start from an example.

## How

Open **Help, Examples** (or **File, New drawing** and look under **Start from an example**). Press a card to open it. Each card shows a small picture, whether it is **vector** or **pixel** art, and what it is for. The little chips under it (walk, loop, pixel...) say what is inside; rest your mouse on **+2** to see the rest. Square and tall drawings show whole on their card.

Under the cards, **Or start blank, with layers ready** has empty starters by size: a blank vector stage with a Colour and a Lines layer, and a blank pixel grid.

## What there is

- **Learn the basics:** Bouncing ball, Flour sack hop, Blink, Morphing shapes.
- **Characters:** Walk cycle (on twos, with onion skin on), Run cycle (pixel), Game hero sprite set, Paper doll puppet (bones), Lip sync mouth chart.
- **Effects:** Explosion and smoke (drawn frames plus particles, with dark smoke that shows on light and dark backgrounds), Sparkle FX.
- **For games and apps:** UI icon set (16x16 pixel icons), Sticker pack (emoji stickers), Tileset and level, Loading spinner.
- **Video:** Title card (animated text and a camera move), Camera and parallax, Bouncing logo.

## Set up for you

Some examples get things ready when they open. The walk cycle turns [onion skin](help:timeline-onion) on. The first time you export, the spinner starts on a see-through GIF, the icons and stickers on separate pictures, and the run cycle on a sprite sheet at its real pixel size. Pick anything else in **Export** if you like; next time it remembers your choice.

## Make it yours

An example is a normal drawing, so you can change anything. Nothing happens to the original, and Frameling asks before it replaces a drawing you haven't saved.

Every card ends with a **Try it** idea. Looking at how an example is built is a good way to learn: try the timeline to see where each drawing sits.`,
  },
  {
    id: 'quests',
    order: 5,
    title: 'Quests',
    section: 'Getting started',
    summary: 'Short guided lessons that teach by doing.',
    keywords: ['tutorial', 'guide', 'lesson', 'learn', 'first animation', 'badge', 'tiles quest'],
    body: `A quest is a little lesson with a few steps. You do each one in the real app, and Frameling ticks it off.

The first one, **Your first animation**, is on the welcome sheet (sprite and tile people start with **Pixel pal** or **Tiles** instead). Finish it and the rest open up in the **Quests** panel (Help > Open the Quests panel): the bouncing ball, filling in, a pixel pal, shading, **Tiles** (draw a seamless tile and paint a little level with it) and sharing. Each earns a badge.

Stuck on a step? **Show me** does it for you, and **Tell me more** opens the help for it.`,
  },
]);
