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

Panels and settings that need a word of explanation have a small **?** beside them: point at it, or press it, to read the words. See [The ? icons](help:explanations).

## Help panel and help window

The **Help** panel sits with the other panels, handy while you work. Press the little window button in it for a bigger view, with the contents down the side.

## Searching

Type in the search box. You don't need to spell things perfectly. Press **Ctrl+K** to search the commands and the help at the same time.`,
  explanations: `Panels and settings used to explain themselves all the time. Now the words fold away behind a small **?** icon, so a panel is its controls, and nothing is lost: it is the same words, one point away.

## Read one

Point at a **?** icon, or Tab to it, and the words appear in a tip. Press it (a click, or **Enter**) and the tip stays open, so you can read at your own pace and press **Learn more** to go to the full help page. **Esc** closes it.

A panel's **?** sits in its title bar. A section inside a panel has its own beside its heading, and a setting that needs a word of explanation has one beside its name.

## Keep them on show

When you are new, the explanations sit on show where they always did, so you meet them once. After your first drawing Frameling offers to tuck them away, and you can say no. Any time you know your way round, tuck them away yourself: **View, Show the explanations**, or **Preferences, General, Explanations**. Turn it back on any time.

## Good to know

- A line that is a warning, or says what is going on right now ("The camera layer is hidden"), stays on show. Only the "what is this for" lines move.
- A screen reader reads the words when you reach the **?**, so they are there for everyone.

See also [Using help](help:using-help), [Panels](help:panels) and [Preferences](help:preferences).`,
  'command-palette': `Can't remember where something lives? Press **Ctrl+K** (**Cmd+K** on a Mac), or **Ctrl+Shift+P**.

## How

1. Type a few words. "onion", "export" or "dark" is plenty.
2. Use the **up and down arrows** to move through the results.
3. Press **Enter** to do it, or **Esc** to close.

Each command shows its shortcut on the right, so you can learn it for next time. Greyed out ones can't be used right now.

Help pages show up in the list too. Choose one to read it.

> With nothing typed, the list starts with the commands you used last. Until you've used a few, it shows **Try these** instead: new drawing, open, save, export, undo and help, the things most people reach for first.`,
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

Can't find a setting? Type in the box at the top: [searching Preferences](help:preferences-search) knows other apps' names for things too.

The pages down the left include:

- **General**: [mode and look](help:look-and-feel), [units](help:units), [sounds](help:sounds), motion, the welcome sheet and [Show Quill](help:meet-quill).
- **Themes**: pick [themes](help:themes) and [make your own](help:make-your-own-theme).
- **Behaviour**: [the choices Frameling asked you about](help:behaviour), like what N does.
- **Interface size** (on the General page): draws everything bigger or smaller, 75% to 200%. Handy on a 2k or 4k drawing tablet, where the usual size can be hard to read. [Quill can suggest a size](help:interface-size) for each screen.
- **Your settings** (on the General page): **Backup** saves everything you have set into one small file. **Restore** reads one back in: it tells you which backup it is and what it will replace, and only goes ahead when you say yes. Then it says what changed and starts Frameling again. Handy for a new computer.
- **Keyboard**: see and change [shortcuts](help:keyboard-shortcuts), or pick a [shortcut set](help:shortcut-sets).
- **Workspaces**: save and switch [panel layouts](help:workspaces).

Changes happen straight away and are remembered for next time.`,
  'preferences-search': `The box at the top of **Preferences** finds a setting when you only half remember it. Open Preferences (**Ctrl+,**), or run **Search settings...** from the command palette, and start typing. The box is ready as soon as the window opens.

## Use it

- Type a word or two. The pages step aside and the settings that match line up under the name of their page, so you see where each one lives.
- Press the one you want, or use the **up** and **down** arrows and **Enter**. You land on its page with the row lit for a moment.
- **Esc** clears the box. Press it again to close Preferences.
- A screen reader hears how many settings were found.

## It knows other apps' words

Each setting is also filed under what other drawing apps call it. Try **smoothing** (the stabilizer), **hotkeys** or **keymap** (the Keyboard page), **dark mode** (themes), **tablet pressure** (Pen and tablet), **canvas size** (the picture size), **autosave** or **history**. Nothing here has to be learned: type what you would say.

## Near enough is good enough

A typo still finds it (**stablizer**), and colour and color, stabiliser and stabilizer, work the same. It also searches the little explanation under each setting, the name of the page, and the questions Frameling asks in [Behaviour](help:behaviour) as well as their titles. Shortcuts for commands are in there too, so you can find a command and change its keys.

## Nothing found?

Then it says so, and offers to search the help for the same words instead. The answer may be a way of drawing and not a setting: **symmetry** is a [drawing tool](help:mirror-drawing), for example, not something in Preferences.

Good to know: the command palette (**Ctrl+K**) finds these settings too, below the commands and help. Press one and Preferences opens right at it. See also [Preferences](help:preferences) and [keyboard shortcuts](help:keyboard-shortcuts).`,
  'interface-size': `On a very sharp screen, like a 4k drawing tablet, everything can look tiny. **Interface size** draws the whole of Frameling bigger (or smaller): menus, panels, the timeline and the canvas, all still crisp.

## Set it yourself

Open **Preferences** (**Ctrl+,**), choose **General**, and drag the **Interface size** slider. It goes from 75% to 200%, and **100%** puts it back to the usual size.

## Quill offers

The first time Frameling opens on a very sharp screen, Quill asks if you'd like a bigger interface, and says what size he has in mind. Pick **Yes** and it changes at once. Pick **No thanks** and nothing changes.

Drag the window onto another screen and he looks again. If that screen would read better at a different size, he offers it once. Say yes or no and he remembers, for that screen, so moving back and forth never asks twice. Going back to a screen you said yes to puts its size back by itself.

## Ask again

Search the command palette (**Ctrl+K**) for **Suggest an interface size for this screen**, or find it in the **View** menu. Quill looks at the screen you're on and asks again, whatever you said before.

## Good to know

- He only offers on screens that hold a lot of pixels *as the computer shows them*. A 4k panel the computer already shows at 200% looks fine, so he stays quiet.
- He never suggests a size that leaves the window too small for the panels.
- If you set it high on a small screen, the window is short of room, so Frameling makes room for the drawing first. The panels get narrower, then fold to their slim rails, and menus that don't fit gather under **More** at the end of the menu bar. Your layout isn't changed: a bigger window, or a smaller interface size, brings it all back.
- Every answer is listed in **Preferences, Behaviour** while Frameling is running, and the slider always has the last word.

See also [Preferences](help:preferences) and [Behaviour choices](help:behaviour).`,
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
- On a new empty page he leaves a [faint line](help:empty-page) about where to start, and after your first drawing he says what to try next.

If nothing happens for about a minute he dozes off. Move the mouse or press a key and he wakes up.

## Hiding Quill

Open **Preferences** (**Ctrl+,**), choose **General** and turn off **Show Quill** (or turn it off on the settings step of **Help > Meet Quill again**). He goes away everywhere, and so does his chatter. Things you need, like quest steps, errors and what a sprite sheet holds, still show as plain notes, and you still get the usual pop-up messages (saved, exported and so on).

He'll be a little sad about it (a sniffle, maybe a tear), but he understands. He waves a brave goodbye and then hides. Want him back? Turn **Show Quill** on again, or say hi from **Help > Meet Quill again**. He'll cheer.

## Less movement

With **Reduce motion** on (or when your computer asks apps to be calm), Quill stands still in one pose instead of moving. See [Mode and look](help:look-and-feel).`,
  'empty-page': `A new page is white, and the panels around it are full of sliders, so it's fair to wonder where to start. Frameling helps in two small ways, and both are easy to send away.

## The line on the page

While a new drawing is still empty, a faint line sits in the middle of the page: **Draw something. The brush is ready.** It's only a hint painted over the page. You can't select it or draw over it, it never prints, and it's never in an export or a picture of your work.

It goes the moment you make your first stroke, and it doesn't come back for that file, even if you undo.

## Quill's tip

A moment after your first drawing, Quill pops up with an idea for what's next: press **Play** to watch it, or draw on frame 2 to make it move. **Play it** does the first for you. **Not now** means he won't mention it again.

He only says it a few times in all, and never again once you've pressed either button.

## Turning them off

- **Show Quill** in **Preferences** (**Ctrl+,**), on the **General** page, stops both. See [Meet Quill](help:meet-quill).
- **Preferences > Behaviour** has **A hint on an empty page** and **Quill's tip after your first drawing**, so you can keep one and drop the other. See [Behaviour choices](help:behaviour).
- **Help > Gentle nudges on or off** flips both at once.

Good to know: the line shows on plain drawings, not on pixel art or tile maps, which have their own welcome. It says **The brush is ready** with the Brush or Pencil picked, and asks you to pick a tool when something else is.`,
  behaviour: `Animators work in different ways. For things like "should a new drawing start blank or as a copy?", Frameling does the usual thing and tells you in a little message at the bottom, with a **Change** button. Press it and you pick the other way, and Frameling redoes it that way for you. Whichever you pick is remembered.

It only says something when the answers would really differ. With one layer, adding a frame on every layer or just this one is the same thing, so nothing is said.

## When it stops and asks

A few choices can take something with them, such as taking a frame off every layer, or bringing back an older version. Those stop and ask, with a short explanation of each option. Tick **Remember my choice** and it won't ask again. Untick it to be asked next time.

Press **Learn more** on a question and the question steps aside, so you can read the help before you decide. **Esc** brings it back just as you left it.

## Closing a question

Close one with **Esc** and Frameling does what closing always does: the safe answer, never one that could lose something. It asks again next time. Close the same question twice in a session and it stops asking until you restart, says so in a message, and the message has **Ask me again**. Questions that could lose work always ask.

## Don't want to be asked at all?

The first question you meet has a button, **Answer all 25 questions the usual way and stop asking** (the number is however many are left). It sets each one to what Frameling does to start with, except the few that could lose something, and the message after has an **Undo**. The same button sits at the top of **Preferences > Behaviour**, where every answer stays listed. Pick **Ask me** on any of them to be asked again.

## Dialogs

The first time you press the dim area beside a dialog, Frameling asks whether that should close it, and remembers your answer. Change your mind in **Preferences > Behaviour**. A press that only just misses a dialog's edge never counts either way: every dialog has 24 pixels of dead space all round it, so a near miss does nothing at all. The save question ignores the dim area completely. **Esc** and the close button always work.`,
  features: `Some parts of Frameling are optional. If you never use one, you can switch it off, and its panels, tools, commands, menu entries, help and example drawings go quiet until you want them back.

## Switching one on or off

Open **Preferences** (**Ctrl+,**) and choose **Features**, or search the command palette (**Ctrl+K**) for **Features**. Each feature has a switch and a line about what it does. Changes happen at once. You never need to restart.

For example, turning **Particles** off also takes its panel and commands out of the menus and the command palette. Turn it back on and they return.

## Getting them all back

If some are off and you want the lot, press **Turn everything back on** at the bottom of the list, or search the command palette (**Ctrl+K**) for **Turn every feature back on**. Both only work while something is off.

## Quill's hello puts some away

On its last page, Quill's hello can tuck away the parts your picks don't need. It says which, and **Bring them back** on the message that follows undoes it. They show here as switched off like any other, so it's the same way back. See [Quill's hello](help:first-run).

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

Open **Preferences** (**Ctrl+,**), then **Themes**. Every theme sits in one grid. Press one and Frameling asks what it is for:

- **Use it by day**: it becomes your light theme.
- **Use it at night**: it becomes your dark theme.
- **Use it for both**: the same colours whatever the time.

The change is instant. Your two wear a badge in the corner of the card, a sun by day and a moon at night, with a gold edge round them. Any theme can be either one, however bright or dark it is: a dark theme by day is allowed if that is what you like.

## Dark, light and System

The **Mode** switch decides which group is showing:

- **Dark** always uses your dark theme.
- **Light** always uses your light theme.
- **System** follows your computer. When your computer goes dark in the evening, Frameling switches to your dark theme by itself, and back to your light theme in the morning.

So you can have a pastel theme by day and a cosy dark one at night, without touching anything.

## The themes

| The darker one | The lighter one | Mood |
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
- **Pixel** is made for pixel art: only the pixel tools, a big palette, a real-size Preview and the pixel bar. Its tool strip starts with the pixel tools, with shade, dither and pixel select together, and the vector-only tools after. On a pixel layer it shows only the pixel tools. See [The Pixel workspace](help:pixel-workspace).

Each workspace brings its own tools, and you can change them (see below).

## Switching

Press a tab in the [switcher](help:workspace-switcher) at the top, or use **View, Draw workspace** (and friends), or the command search. **Ctrl+Alt+1**, **2** and **3** jump to Draw, Animate and Pixel. **Next workspace** and **Previous workspace** step through the list. Pixel art and drawings can pick their workspace for you: Frameling switches and says so in a message with a **Change** button, where you can answer **Always**, **Not now** or **Never** (you can also change it in Preferences, Behaviour). The Animate workspace is never switched.

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

**View, Reset layout** puts the panels back where the current workspace began. Handy if things get tangled. Your tool arrangement is separate: **Put the tools back** puts this workspace's tools back (see [Arrange your tools](help:tool-arrange)).

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

Drag a tab, or a whole window by its title bar, towards a side of the canvas. Bands light up to say **Dock left**, **Dock right**, **Dock at the top** and **Dock at the bottom**. Let go on one, on another zone's tabs, or anywhere over a zone's panels, to dock there. **Dock back** on the window's bar sends its panels back to the side, group and place they came from. There is no list of sides in the tab's menu: dragging is the way, and the command search has them for the keyboard.

## Names

Right-click a tab and choose **Rename** to call a panel what you like. Double-click a window's name to name the window. Both are kept in your workspace.

## Lock them in place

Right-click a tab and choose **Lock the panels**, and no slip of the mouse can move them. See [Lock the tools and panels](help:lock-layout).

## The tools

The tool strip has a small grip at its top. Drag it to move the strip: [Move the tool strip](help:tool-move) says where it can go.

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

## The strip stays put

Switch between a vector layer and a pixel layer and nothing moves, so your hand can learn the strip. A tool that doesn't work on the layer you're on is left off the strip, so the strip is shorter and everything else stays exactly where it was: Shade, Dither, Spray and the Magic wand wait out of sight on a vector layer, and Text, Gradient and the curve tools on a pixel layer. If you'd rather see every tool all the time, set **Tools that do not work here** to **Grey them out** in **Preferences, General** (or in [Change the tools](help:tool-builder)). Then they wait where they sit, and resting on one says why.

While they're out of sight, a small button with a number sits under the strip. Rest on it to read which tools are waiting and what they need (**Text and Gradient work on vector layers.**). Press it to jump to a layer they work on with the tool in your hand, or to see them greyed out instead.

A few tools share one place with their pixel twin: the Lasso, Polygon select, Magnetic lasso and Select each have one button, and it picks the one for the layer you're on. Change layer with the Lasso in your hand and you still have a lasso.

Tilemap and camera layers are different jobs, so on those the strip shows only the tools that work there.

## Your way

Drag tools into the order you like, or into other groups. See [Arrange your tools](help:tool-arrange). To rename groups, put tools away or fold a group into one button, open [Change the tools](help:tool-builder). Drag the strip's inner edge to make it wider, so the group names show whole. Drag the grip at its top to put it on another side, or [float it over the canvas](help:tool-move). Right-click the strip to put the tools back the way they came.

## One button per group

If you would rather have a thinner strip, open **Preferences, General** and set **Tool rail style** to **Stacked**. Each group becomes one button, with a small corner mark. Press and hold it, or right-click it, to see the rest of the group and pick from there.

Tool keys can be changed in [keyboard shortcuts](help:keyboard-shortcuts).`,
  'tool-move': `Pick the tool strip up by the little grip at its top and carry it. Where it would land lights up as you go, and letting go puts it there. There's no menu to hunt through.

## Where it can go

- **Any side:** a band lights up along the left, the right, the top and the bottom of your work area. Let go on one and the strip docks there.
- **Over the canvas:** the canvas gets an outline. Let go there and the strip floats where you let go, as a little window you can drag about.
- **Back where it was:** the band for the side it came from says **Back on the left, as it was** (or whichever side it was). A floating strip you pick up can go back there too, with the same width and the same arrangement of tools.

## Changed your mind?

Let go anywhere that isn't a band or the canvas (over the panels, the top bar, or off the window) and the strip goes back to exactly where you picked it up. So does **Esc**. Nothing is left floating by accident.

## Good to know

- The strip's inner edge, the thin line beside the canvas, is for making it wider. Drag that to change the width, and the grip to move it. They don't get in each other's way.
- With the keyboard: while it floats, press the arrow keys on the grip to nudge it. **Dock the tools back where they were** is in the command search, and so is every side.
- Panels move the same way: drag a tab to a side, or out over the canvas for a window. See [Floating windows](help:floating-windows).

See also [The tool strip](help:tool-strip) and [Change the tools](help:tool-builder).`,
  'lock-layout': `Lock the tool strip, the panels, or both, and nothing about them moves until you unlock them. It is for the day a slip of the mouse drags the strip to the other side, or a panel off into a window.

**Lock the tools:** right-click the tool strip and choose **Lock the tools**, or search for it. The grip and the width edge simply go. The strip can't be moved to another side, made wider, rearranged or changed, and **Change the tools** won't open. **Put the tools back** says so and leaves it alone.

**Lock the panels:** right-click a panel's tab and choose **Lock the panels**. No dragging a tab, moving or resizing a window, pulling a side wider, closing, renaming or regrouping.

**Unlock:** the same menu says **Unlock the tools** or **Unlock the panels**. Pressing **Unlock** on the message that appears does it too.

## What still works

Everything you actually do. Every tool draws, every panel is still there and works, the menus still open and the help still answers. Opening a panel from the **View** menu still works. Only the arranging stops.

## Why something is greyed

Things that invite a move, like the strip's grip and the edges of windows, go while it is locked, and nothing stands in for them. A locked menu entry stays on show but greyed, with a line under it saying it is locked, and a command or key that would move something says what the lock stops and how to undo it.

## Good to know

- The first time something moves by accident, Quill offers a **Lock it** button on the spot. He only says it once.
- Each [workspace](help:workspaces) has its own lock. It goes with the workspace when you save or share it.
- **Reset layout** leaves a locked strip alone, and won't run at all while the panels are locked.

See also [Change the tools](help:tool-builder), [Panels](help:panels) and [Floating windows](help:floating-windows).`,
  'tool-builder': `**Change the tools** lets you set the strip up the way you work: name your groups, make your own, put away the tools you never touch and fold a whole group into one button. Nothing is lost: every tool still has its key and its place in the command search.

**Open it:** **View > Change the tools > Change the tools**, or right-click the strip, or search for it. A gold edge shows the strip is open for changes, and **Done** (or **Escape**) closes it.

**Move a tool:** drag it to another place, or onto another group. Click a tool for a menu with the same things.

**Make a group:** drag a tool onto a gold **+** between two groups, or click a tool and choose **Start a new group here**. A group you never name is just a divider. **Join the group above** takes the divider away.

**Name a group:** click its name above it. Leave the name empty and it goes back to its usual one, or to a plain divider if it never had one.

**Put a tool away:** click it and choose **Hide this tool**, or drag it to **Put away**. A small chip at the foot of the strip counts what is away. Press it, then press a tool to bring it back to the place it had. The Lasso and its pixel twin are one place, so they go and come back together.

**Fold a group:** press the little arrow beside its name. The group becomes one button with a corner mark; press and hold it for the rest. **Rail style** in the panel folds every group at once, and your own folds are still there when you go back to **Every tool**.

**Button size** is small, medium or large. **Group names** shows or hides the names above the groups (it is on to begin with; turn it off for a slimmer strip). **Tools that do not work on this layer** hides them, or greys them out where they sit.

**Make the strip wider:** drag its inner edge, the line between the strip and the canvas. A wider strip shows more of each group's name and fits more buttons across. Double-click the edge to fit the longest name; double-click again for the usual width. A name that still doesn't fit ends in dots and never wraps. The command search has **Tool rail: wider**, **narrower** and **fit the group names** too.

**Put the tools back** undoes all of it for this workspace, and width, size, names and style too. The message that follows has **Undo**.

**Lock it:** right-click the strip and choose **Lock the tools** and none of this can change by accident. See [Lock the tools and panels](help:lock-layout).

Good to know: each [workspace](help:workspaces) keeps its own groups, names, hidden and folded tools and strip width, and they go with the workspace when you save or share it. See also [Arrange your tools](help:tool-arrange) and [The tool strip](help:tool-strip).`,
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

Right-click the strip and choose **Put the tools back**. It puts back the tools and the group names of the workspace you are in, the way that workspace comes. It is also in the command search.

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
- Along the top: **File**, **Edit**, **View**, **Tools and layers**, **Pixel tools**, **Frames and motion** and **Help**. The three in the middle are lists of things to do, not rooms. To change room, use the [workspace switcher](help:workspace-switcher).
- A **small arrow** on the right opens a smaller menu beside it. Related things are grouped that way: Snapping and Panels in View, Effects and Masks and folders in Tools and layers, Skeleton (rig) and Artboards in Frames and motion, Plugins in Edit.
- You can **move, rename, hide and add** entries, and make menus of your own: see [Change the menus](help:change-the-menus).
- A menu that is taller than the window **scrolls**: use the mouse wheel, or the arrow keys.

With a menu open, use the **arrow keys** to move, **Home** and **End** to jump to the first or last choice, **Enter** to choose, and **Esc** to close.`,
  'status-bar': `The strip along the bottom tells you where you are, and each part opens what it is telling you about.

- **Zoom** is how big the canvas looks. Press it to jump back to a good size.
- **Size** is your drawing's width and height. Press it to change the page.
- **fps** is how many frames play each second. Press it to change the speed.
- **Frame** is which frame you're on, out of how many. Press it to bring the Timeline out in front.
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
