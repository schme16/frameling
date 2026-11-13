// The words of the help topics in helpTopics.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  welcome: `Frameling lets you draw pictures and make them move, one frame at a time. It works for smooth vector art and for chunky pixel art.

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
  'whats-in-frameling': `Frameling is for drawing pictures and making them move. Here's everything in it, in the order most people meet it.

## Draw

- [Brush](help:tool-brush), [Pencil](help:tool-pencil), [Eraser](help:tool-eraser) and [shapes](help:tool-rect).
- [Colours](help:fill-and-stroke), the [paint bucket](help:fill) and [text](help:text).
- [Select and move](help:selecting), [copy](help:copy-paste), [flip](help:flip) and [stack](help:arrange) things.
- [Rulers and guides](help:rulers-guides), [snapping](help:snapping), and [moving around the page](help:canvas-navigation).

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
  'new-document': `Open the chooser with **File, New drawing** or **Ctrl+N** (**Cmd+N** on a Mac).

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
  'using-help': `## Press F1

Point at something, or click into it, and press **F1**. Frameling opens the help page for that thing. If there is no page for it, you get the contents.

## Tooltips

Rest your mouse on a button for a moment. A small tip shows its name, what it does and its shortcut. **Learn more** opens its help page.

## Help panel and help window

The **Help** panel sits with the other panels, handy while you work. Press the little window button in it for a bigger view, with the contents down the side.

## Searching

Type in the search box. You don't need to spell things perfectly. Press **Ctrl+K** to search the commands and the help at the same time.`,
  'command-palette': `Can't remember where something lives? Press **Ctrl+K** (**Cmd+K** on a Mac), or **Ctrl+Shift+P**.

## How

1. Type a few words. "onion", "export" or "dark" is plenty.
2. Use the **up and down arrows** to move through the results.
3. Press **Enter** to do it, or **Esc** to close.

Each command shows its shortcut on the right, so you can learn it for next time. Greyed out ones can't be used right now.

Help pages show up in the list too. Choose one to read it.

> With nothing typed, the list starts with the commands you used last.`,
  'keyboard-shortcuts': `Shortcuts are the quick way to do things. **Mod** means **Ctrl** on Windows and Linux, and **Cmd** on a Mac.

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
- On a pixel sprite: **+** makes the brush bigger and **_** (Shift and minus) smaller, **[** and **]** step along the palette, and **1** to **6** zoom from 100% to 3200%. **=** adds a frame and **-** removes one, in every set but Aseprite keys, where they change the brush size instead.
- The **arrow keys** nudge the selection (**Shift** for ten pixels) in every set. In Aseprite keys, **Alt+Left** and **Alt+Right** step between frames.
- Tools for different kinds of layer can share a letter: **B** is the Brush on a drawing layer and the Tile brush on a tile layer. That's not a clash, because only one of them works at a time.
- A few keys moved so nothing clashes: **Lasso** is **Shift+L** (the Line tool keeps **L**), and the Rig feature's Pose tool sits next to its Bone tool on a **Shift** key (the Ellipse keeps **O**).

## Without a mouse

- **Tab** moves between buttons and boxes (hold **Shift** to go back). The one you're on has a ring round it.
- In a row of choices (tabs, the options in a panel), a list or a menu, the **arrow keys** move between them.
- **Enter** or **Space** presses the button you're on. (When you got there with Tab, Enter presses it rather than playing the animation.)
- With a slider or a list picked, the arrow keys change that, not the selection on the canvas.
- **Esc** closes a dialog or menu, and you land back where you were.
- **Mod+K** finds any command by name, even ones with no shortcut.`,
  preferences: `Open it with **Ctrl+,** (**Cmd+,** on a Mac), or **View, Preferences**.

There are five pages:

- **General**: [mode and look](help:look-and-feel), [units](help:units), [sounds](help:sounds), motion, the welcome sheet and [Show Quill](help:meet-quill).
- **Themes**: pick [themes](help:themes) and [make your own](help:make-your-own-theme).
- **Behaviour**: [the choices Frameling asked you about](help:behaviour), like what N does.
- **Keyboard**: see and change [shortcuts](help:keyboard-shortcuts), or pick a [shortcut set](help:shortcut-sets).
- **Workspaces**: save and switch [panel layouts](help:workspaces).

Changes happen straight away and are remembered for next time.`,
  installing: `Frameling is signed, but not yet with a paid certificate, so Windows and macOS don't recognise it. The first time you open it they ask you to say it's OK. After that it opens like any other app.

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
`,
  'meet-quill': `Quill is a small pixel-art hedgehog whose quills are coloured pencils. He turns up to help:

- He **waves** hello on the welcome sheet and in **Help, About Frameling**.
- In a [quest](help:quests) he reads each step out in a speech bubble, **points** while the gold ring shows where to look, and **cheers** when you finish a step or earn a badge.
- While an export is being made he has a **think**. He cheers on the message when it's done, and says **oops** if something went wrong.
- He keeps you company where there's nothing to show yet, like a help search with no results.
- A message that says no (or that something failed) has a tiny Quill on it.

If nothing happens for about a minute he dozes off. Move the mouse or press a key and he wakes up.

## Hiding Quill

Open **Preferences** (**Ctrl+,**), choose **General** and turn off **Show Quill** (or turn it off on the settings step of **Help > Meet Quill again**). He goes away everywhere, and so does his chatter. Things you need, like quest steps, errors and what a sprite sheet holds, still show as plain notes, and you still get the usual pop-up messages (saved, exported and so on).

He'll be a little sad about it (a sniffle, maybe a tear), but he understands. He waves a brave goodbye and then hides. Want him back? Turn **Show Quill** on again, or say hi from **Help > Meet Quill again**. He'll cheer.

## Less movement

With **Reduce motion** on (or when your computer asks apps to be calm), Quill stands still in one pose instead of moving. See [Mode and look](help:look-and-feel).`,
  behaviour: `Animators work in different ways. For things like "should a new drawing start blank or as a copy?", Frameling asks you the first time it comes up, with a short explanation of each option.

Tick **Remember my choice** and it won't ask again. Untick it to be asked again next time.

## Changing your mind

Open **Preferences** (**Ctrl+,**) and choose **Behaviour**. Every choice is listed there. Pick a different answer, or pick **Ask me** to be asked again next time.`,
  features: `Some parts of Frameling are optional. If you never use one, you can switch it off, and its panels, tools, commands, menu entries, help and example drawings go quiet until you want them back.

## Switching one on or off

Open **Preferences** (**Ctrl+,**) and choose **Features**, or search the command palette (**Ctrl+K**) for **Features**. Each feature has a switch and a line about what it does. Changes happen at once. You never need to restart.

For example, turning **Interactives** off also takes **Export for Interactives** out of the Export window, the File menu and the command palette. Turn it back on and it returns.

## Your drawings are safe

Turning a feature off never changes a file. If a drawing uses a feature that is off, Frameling asks when you open it: **Turn it on?** Say yes and everything works as before. Say no and the drawing still opens, still draws the same, and keeps all of its data, so you can turn the feature on later and carry on.

## Help for a feature that is off

Help topics for a feature that is off are hidden. If you search for one, Frameling says so and gives you a **Turn on** button.

Some features need others. If another feature needs one, its switch is greyed out and a note under it says which to turn off first.`,
  'look-and-feel': `## Mode

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
  themes: `A theme is a set of colours for the whole app. Frameling comes with several, each with a silly name and a calm mood.

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
| **Strawberry Night** | **Strawberry** | Berry red, cream and little yellow seeds scattered round the page. Quill's favourite. |
| **Glacier Grid** | **Ice Camo** | Charcoal, ice and bright aqua, with a faint camo print around the page. |
| **Lilac Static** | **Lavender Hum** | Soft lilac with a little pastel glow. |
| **Gumdrop Night** | **Gumdrop Day** | Based on Monokai: lemon, candy pink, lime and sky blue. |
| **Batwing** | **Bat Nap** | Based on Darcula: charcoal, pumpkin orange and a warm lamp. |
| **Mocha Puppy** | **Latte Kitten** | Based on Catppuccin: soothing pastels with lilac. |
| **Retro Groove Night** | **Retro Groove Day** | Based on Gruvbox: retro browns, cream and earthy colours. |
| **Puppy Socks** | **Kitty Socks** | Trans pink and blue with rainbow touches, knee-high sock stripes and paw prints round the page. |
| **Lantern Night** | **Sunbeam** | Extra contrast. |

Chosen things (the tool, the tab, a switch that is on) are gold in most themes. The aqua, lilac, Gumdrop, Kitten and Socks themes use their own colour instead, still with dark words on it.

## Easier to see

**Lantern Night** (dark) and **Sunbeam** (light) have extra contrast: brighter words and stronger borders. Try them if small text is hard to read.

## Textures

Some themes scatter a faint pattern round the page: strawberry seeds, a camo print, sock stripes and paw prints. If you'd rather have it plain, open **Preferences** and switch **Textures** off. Everything else about the theme stays as it is.

## Themes and the look

Themes are only colours. [Cosy or Crisp](help:look-and-feel) is separate, so you can mix any theme with either look.

## Make it yours

Press **Make a copy to customise** on any card to [make your own theme](help:make-your-own-theme).`,
  'make-your-own-theme': `You can't break anything: you always work on your own copy, and the built-in themes stay as they were.

## Start

Open **Preferences, Themes**, and press **Make a copy to customise** on a theme you almost like. (Or press **Make my own theme** to copy the one you're using.) The editor opens and your copy is switched on, so the whole app shows it as you work.

## Change colours

The colours are in friendly groups: **Background**, **Panels**, **Text**, **Accent (gold)**, **Timeline**, **Canvas surround**, **Messages** and **Snapping** (the colour of each snap line and its dot in the "Snapped to" note). Press a square to pick a colour, or type a colour code like \`#ffc94a\`.

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
  workspaces: `Different jobs want different rooms. Frameling comes with three, and each says what it is for:

- **Draw** has the tools and colours close, and a small timeline. The drawing tools lead the tool strip.
- **Animate** gives the timeline lots of room. The tool strip puts drawing first, then the rig and motion tools.
- **Pixel** is made for pixel art: only the pixel tools, a big palette, a real-size Preview and the pixel bar. Its tool strip starts with the pixel tools, with shade, dither and pixel select together, and the vector-only tools after. See [The Pixel workspace](help:pixel-workspace).

Each workspace brings its own tools, and you can change them (see below).

## Switching

Use **View, Draw workspace** (and friends), or the command search. **Next workspace** and **Previous workspace** step through the list. Pixel art and drawings can pick their workspace for you: the first time it matters, Frameling asks, and you can answer **Always**, **Not now** or **Never** (change it in Preferences, Behaviour). The Animate workspace is never switched.

## Your own

Arrange the panels how you like: dock them on any side, float some in windows (see [Floating windows](help:floating-windows)), name them, and arrange the tools into the groups you like (see [Arrange your tools](help:tool-arrange)). The tools you arranged become the starting tools of your new workspace. Then open **Preferences, Workspaces**, type a name and press **Save**. You can keep up to 12. It shows up in the View menu next to the others.

On that page you can also:

- **Rename** one, or move it **up** or **down** the list.
- **Update** one to the layout and tool arrangement you have now.
- **Delete** one (it asks once more, so a slip doesn't cost you anything).

## Share

Every workspace has a **Save as a file** button. Send the file to a friend. On their **Workspaces** page, **Add a workspace file** puts it in their list. If the file isn't a workspace, Frameling says so and changes nothing.

Prefer a message? **Copy as text** puts the whole workspace on your clipboard. Your friend pastes it into **Paste workspace text here** and presses **Add it to my workspaces**.

A shared workspace moves panels around (including any [stacked groups](help:panel-groups)) and brings its tool arrangement and group names. If it names a panel or tool your Frameling doesn't have, that one is skipped, and a panel or tool it doesn't mention goes where it normally lives.

## Reset

**View, Reset layout** puts the panels back where the current workspace began. Handy if things get tangled. Your tool arrangement is separate: **Reset tools to default** puts this workspace's tools back (see [Arrange your tools](help:tool-arrange)).

See also [Panels](help:panels).`,
  properties: `**Properties** is the first place on the right side's rail. It shows the settings for what you're doing right now, as sections in one list, so you don't have to know which panel holds what.

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
  panels: `Panels hold things like the timeline, layers and colours. They dock in four zones: **left**, **right**, **bottom** and **top**, or float in a window of their own. See [Floating windows](help:floating-windows). A zone with nothing in it takes no room.

## The right side

The right side has a **rail** down its edge: an icon with a name for every place there, so you can see everything at a glance.

- **Properties** comes first. It holds the settings for what you're doing now. See [Properties](help:properties).
- Below it are the panels you open now and then: **Library**, **Clip flow**, **Lip sync**, **Quests** and **Help**. Press one to open it, and press it again to fold the side away.
- **Panels**, at the bottom of the rail, lists every panel with a sentence on what it's for. Type to find one. Panels you closed are there too, marked *Closed*: pick one to bring it back. It's also in the **View** menu as **All panels**.

## Move

Drag a panel's **tab** (or its name on the rail) to another place to reorder it, or onto another zone to move it there. While you drag, bands light up along the edges of the canvas: drop on one to dock there. Right-click a tab for the same moves as a list, and to **Rename** it.

## Stack groups

A side can hold more than one group of tabs, stacked one over the other: **Layers** on top and **Colours** underneath, say, each with its own tabs. See [Stack panels in groups](help:panel-groups).

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
  'panel-groups': `Sometimes you want two panels in view at once, not one behind the other. Give each its own **group**: a side can hold up to four, one over the other (or side by side along the bottom and top), and each group has its own tabs.

## Make a group

Drag a panel's tab (or its name on the right-hand rail) to the **top or bottom edge** of a group's body. A gold box lights up over the half the new group would take, and the label says **new group below** (or above). Let go. The panel now has a group of its own and the two share the room.

Along the bottom and top, groups sit side by side, so the **left and right edges** do the same.

Prefer no dragging? Right-click a tab (or press the menu key on it) and choose **Move to a new group below** or **above**. Or press \`Ctrl+K\` and type **Put this panel in its own group**.

## Fill a group

Drag any tab (or a name on the right-hand rail) onto another group's tab bar or heading, or into its body, to put it there. Press **Move into the group above** or **below** in a tab's menu to do the same without dragging. A group left with no tabs goes away, and the one beside it takes the room.

## Resize

Pull the thin line between two groups. Or press **Tab** until it has the focus, then use the arrow keys (up and down on the left and right sides, left and right along the bottom and top). **Shift** makes bigger steps, **Home** and **End** go to the smallest and largest, and **Enter** makes the two even. Double-click the line for the same.

## Put them back

Drag the tabs into one group again, or right-click a tab and choose **Join this side into one group**. It is also in the command search.

## On the right side

The right side has one rail for all its groups. Each group gets a heading on the rail (**Top**, **Bottom**, and so on) with its panels listed under it, and the group's panel shows in its own box beside the rail, with the line between boxes to pull. **Properties** stays at the top of the first group. Drag a name on the rail to move a panel between groups. Fold the side away and the rail stays, headings and all. (If you set the right side to plain tabs in Preferences, each group has its own tab bar instead.)

## Kept with your workspace

Groups are part of the layout, so they are saved in your [workspaces](help:workspaces) and travel in the files you share. A layout from an older Frameling opens as one group per side, just as it was.

See also [Panels](help:panels).`,
  'floating-windows': `Any panel can float over the canvas in a window of its own. Handy for keeping the **Preview** next to your drawing, or a panel out of the way.

## Pop a panel out

Drag a panel's tab (or its name on the right-hand rail) out over the canvas and let go. A dashed box shows the window it will make. You can also right-click the tab and pick **Move to its own window**, or press \`Ctrl+Shift+\\\` while you are working in the panel.

## Group panels

A window can hold several panels as tabs. Drag a tab onto another window's tabs to join it. Drag one back out to split it off. Right-click a tab and use **Group with a window** if you would rather not drag.

## Move and resize

Drag the title bar to move a window. Pull any edge or corner to resize it, or use the keyboard (see below). Click a window to bring it to the front. Double-click the bar to dock it back.

## Dock it again

Drag a tab, or a whole window by its title bar, towards a side of the canvas. Bands light up to say **Dock left**, **Dock right**, **Dock at the top** and **Dock at the bottom**. Let go on one, or on another zone's tabs, to dock there. **Dock back** on the window's bar sends its panels home.

## Names

Right-click a tab and choose **Rename** to call a panel what you like. Double-click a window's name to name the window. Both are kept in your workspace.

## The tools

The tool strip has a small grip at its top. Drag it to float the tools, or onto a side of the canvas to put them there, even along the top or bottom. Right-click the strip for the same as a list. You can also drag tools into other groups, see [Arrange your tools](help:tool-arrange).

## Room to draw

**Hide all panels** (\`Ctrl+\\\`) puts every panel away. Press it again to bring them back.

## With the keyboard

Press the menu key on a tab, a window's grip or the tool strip's grip to open its menu. On a window's grip, the arrow keys nudge it, and **Alt** with the arrow keys makes it bigger or smaller (right and down grow it, left and up shrink it). **Shift** makes bigger steps, and **Alt** with **Enter** goes back to the usual size. The new size is read out. The window's menu has **Make it bigger**, **Make it smaller** and **Back to the usual size** too. Every move is also in the command search.

See also [Panels](help:panels) and [Workspaces](help:workspaces).`,
  'tool-strip': `The strip down the left holds your tools, two across. The one with the gold glow is the one you're using.

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
  'tool-arrange': `Your tools, your order. Everything on the [tool strip](help:tool-strip) can be moved.

## With the mouse

Press a tool and drag it. A gold bar shows where it will land: beside another tool to put it there, or on a group to add it to the end. Drop it on a gap between two groups to make a **new group** of its own. Press Escape while dragging to put it back.

## With the keyboard

Click or Tab to a tool, then hold **Alt** and press an arrow key. The tool moves one place along the strip, and crosses into the next group at the end of its own. The new place is read out.

## With a menu

Right-click a tool, or press the menu key on it. **Move to** lists every group. **Move to a new group** gives the tool a group by itself. A group that ends up with no tools goes away.

## Name your groups

A group you make is called **Group 2**, **Group 3** and so on. Give it a name of your own: double-click the thin divider above the group, or right-click a tool (or the divider) and choose **Rename**. Type a name and press **Enter**. Rest on the divider to see the name again. Clear the name to go back to the usual one. You can rename the usual groups too.

## Put them back

Right-click the strip and choose **Reset tools to default**. It puts back the tools and the group names of the workspace you are in, the way that workspace comes. It is also in the command search.

## One for each workspace

Every [workspace](help:workspaces) has its own tools. **Draw** starts with drawing first. **Animate** puts the rig and motion tools right after drawing. **Pixel** starts with the pixel tools, then shade, dither and pixel select, and keeps the vector-only tools for later.

Change the tools in one workspace and the others stay as they were. Switch to another workspace and its tools come with it. Switch back and yours are waiting. Reset only touches the workspace you are in.

## Saved and shared

When you save your own workspace, the tools and group names as they are now become its starting ones, and the workspace you share carries them along. An older workspace without any simply uses the usual groups. If you had arranged your tools before workspaces had their own, that arrangement is now yours for the workspace you were in.

## In the stacked style

With **Tool rail style** set to **Stacked** in Preferences, press and hold a group's button, or right-click it, and drag a tool from the list onto another group's button, or onto a gap to start a new group. The list is headed by the group's name, with a pencil button to rename it. Rest on a group's button to see its name there too.`,
  menus: `The menu bar is along the top. Press a name to open it, then press a choice.

- A **tick** means it is switched on.
- **Greyed** choices can't be used right now (nothing to undo yet, for example).
- Shortcuts are shown on the right.
- A **small arrow** on the right opens a smaller menu beside it (Snapping and Panels, in View, for example).
- A menu that is taller than the window **scrolls**: use the mouse wheel, or the arrow keys.

With a menu open, use the **arrow keys** to move, **Home** and **End** to jump to the first or last choice, **Enter** to choose, and **Esc** to close.`,
  'status-bar': `The strip along the bottom tells you where you are.

- **Zoom** is how big the canvas looks.
- **Size** is your drawing's width and height.
- **fps** is how many frames play each second.
- **Frame** is which frame you're on, out of how many.
- A friendly **tip** changes every so often. Press it to see another. Turn tips off in **Preferences, General**.`,
  'document-name': `Your drawing's name sits in the middle of the top bar. Press it, type a new name and press **Enter**.

A small **dot** beside the name means there are changes you haven't saved yet.

The **undo** and **redo** buttons beside it do the same as **Ctrl+Z** and **Ctrl+Shift+Z**. See [Undo and redo](help:undo).`,
  messages: `Now and then Frameling tells you something in a small message near the bottom. It goes away on its own.

If a message has a button, like **Undo**, press it before the message leaves to take something back. Resting your mouse on a message keeps it there.`,
  examples: `Not sure where to begin? Start from an example.

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
};
