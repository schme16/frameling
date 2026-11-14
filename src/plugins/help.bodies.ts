// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  plugins: `A **plugin** adds something to Frameling: a command (like "Flip every other frame"), a new way to export, a panel of its own, and, if you allow it, tools, kinds of shape and guides on your canvas.

## Install one

1. Get the plugin. It's a **.zip** file.
2. Choose **Plugins > Install a plugin...** and pick the file.
3. Frameling shows what the plugin asks to do. Read it, then choose **Install**.

Its commands turn up in the **Plugins** menu and the command palette (**Ctrl+K**). Exports go in the **File** menu. Panels open from **View**. Tools join the toolbox.

## What a plugin can and can't do

Every plugin runs in its own **sandbox**, a closed box inside Frameling. It can't see your files, your other drawings or the rest of the app. It can only:

- **See your drawing**, if it asked to.
- **Change your drawing**, if it asked to. Each change is one step, so **Undo** (Ctrl+Z) takes it back.
- **Add a way to export**, if it asked to. Frameling draws the frames and asks you where to save; the plugin only makes the file.
- **Show a panel**, if it asked to. Frameling draws the panel from a simple list of buttons, sliders and text.
- **Use the internet**, only if it asked for it, named the sites, and you said yes. You can install it **without the internet** instead.
- **Add its own tools**, **draw guides on the canvas** or **add its own kinds of shape**, only if it asked and you switched that on. These have a switch each. See [What a plugin may ask for](help:plugin-permissions).

## Turn plugins on and off

**Plugins > Manage plugins...** (or **Preferences > Plugins**) lists them. Use the switch to turn one off for a while, or the bin to remove it. Turning one off takes away everything it added.

If a plugin goes wrong, Frameling says so and offers to turn it off. Your drawing is safe either way.

Frameling also keeps an eye on each plugin. If one **stops responding** (stuck in a loop, or silent for a minute in the middle of a long job that never says how far it has got), Frameling turns it off for you and says so. It stays off, even next time you open Frameling, until you press **Turn it on** in the message or switch it on in **Preferences > Plugins**. Your drawing isn't touched.

**Curious how a plugin is doing?** In **Preferences > Diagnostics**, switch on **Measure plugins' memory and speed**. Each running plugin then shows how quickly it answers and how much it asks Frameling to do. In the desktop app, press **Restart now** beside the switch to see its memory too (see [Restarting Frameling](help:restart)): each plugin then runs on its own, which uses more memory (roughly 90 MB each), and one that grows past 1 GB is turned off. Leave it off, the default, to keep Frameling light.

## Make your own

A plugin is a folder with a **manifest.json** and one script. See [Making a plugin](help:making-plugins).`,
  'plugin-shapes': `Some plugins add their own **kinds of shape**, like a star with a number of points. Frameling keeps them as ordinary shapes, so you can move, colour, scale and turn them with the usual tools, and they export like anything else.

## Change its settings

Pick the shape with the **Select** tool. **Properties** shows a **Plugin shape** section with a **Change settings** form: numbers, choices, switches or text, whatever the plugin offers. Change one and the shape is drawn again with it. One **Undo** (Ctrl+Z) takes it back.

If you had scaled, turned or moved the shape, it **stays that way**: the new drawing is moved, scaled and turned the same. (If you edited its points one by one, it is redrawn where it was instead.)

## If the plugin is off

The section says so and shows **Turn it on**. Until then the shape still works like any other, you just can't change its settings. Frameling may ask you to allow the plugin again.

## If you don't have the plugin

A file made with a plugin you don't have still opens and looks right. The shape is plain shapes; install the plugin to change its settings. See [Plugins](help:plugins).`,
  'plugin-exports': `A plugin that adds an export puts it in the **File** menu as **Export ...** (for example **Export Contact sheet...**).

1. Choose it. A small window asks which **frames** (the whole animation, one clip, or just this frame) and what **size**.
2. Choose **Export**, then where to save.
3. Frameling draws the frames, exactly as you see them on the canvas, and hands them to the plugin. The plugin makes the file, and Frameling saves it where you said.

Some exports have **options** of their own (a number, a list to choose from, a switch or a text box). They show in the same window, under the plugin's name, and Frameling remembers what you chose for next time.

The plugin never touches your disk itself. Pressing **Cancel** stops it straight away.`,
  'plugin-panels': `Some plugins add a **panel**. It docks on the right at first, and you can drag it anywhere, like any other panel. Show or hide it from the **View** menu.

Frameling draws plugin panels itself, from a simple description the plugin sends: text, buttons, check boxes, sliders, number and text boxes, lists and colours. A plugin can't put web pages or anything else on screen.`,
  'plugin-permissions': `Before a plugin that wants more than the basics is installed, Frameling stops and asks. Each **power** is on its own switch, and **every one starts off**:

- **Change your drawing.** It can change, move or delete anything in your drawing. You can undo each change, but a faulty plugin could spoil a lot of work. Save a copy first.
- **Add its own tools.** Its tool joins your toolbox. While you have that tool picked it sees every click and drag on the canvas.
- **Draw on the canvas.** It can show lines, shapes and words on top of your canvas. They are only a guide on screen and never end up in your files, but a careless plugin could cover up what you are looking at.
- **Add its own kinds of shape.** It can add shapes to your drawing. They are saved as ordinary shapes.
- **Use the internet.** Only to the sites it lists.

Switch on only what you trust the plugin with. If you leave something off, the plugin still installs and works; the parts that need that power are simply left out.

## Change your mind

Open **Plugins > Manage plugins...**. Each plugin lists its powers with a switch. Turn one off and it stops at once. Turn one on and Frameling tells you what it could do and asks again.

## Updates

Frameling remembers what you said for each version. A newer version that asks for the same things keeps your answers. One that asks for **more** stays off until you have read what is new and said yes.

## Shapes made by a plugin

A shape a plugin added is saved as ordinary shapes, so the drawing opens and looks right on any computer, with or without the plugin. To change its settings the plugin has to be on. Frameling tells you when you open a drawing that needs one that is off or not installed.`,
  'plugin-tools': `## Tools

A plugin tool sits in the toolbox with the others (look for the puzzle piece or the icon it chose). Pick it like any tool. While it is picked, the plugin hears where you click and drag, and answers with a **preview** that Frameling draws for you, and, if you allowed it to change your drawing, the changes to make. Each change is one step, so **Undo** takes it back.

A tool that stops answering is left alone after a few tries, and Frameling says so.

A tool can also use a few extras:

- **Handles.** Round or square dots in its preview that you can drag, to stretch a star or move a point. Frameling draws them at the same size at any zoom.
- **Snapping.** A tool can ask for its points to **snap** like the built-in tools do: to guides, the page edge, the grid and other shapes, following your choices in **Snap** on the status bar. Hold **Ctrl** (Cmd on Mac) to leave a point where you put it.
- **Keys.** A tool can offer named actions such as "Finish the line". They show up in **Preferences > Keyboard** with no key to start with, so a plugin never takes a key you use. Give one a key and it works while that tool is picked.
- **Fonts.** A tool's preview can show text in a font you have installed.

## Shapes

A plugin can add a **kind of shape**, a star, a gear or a speech bubble, that remembers its settings. Frameling draws it as ordinary shapes you can move, colour and delete like any others. To change its settings, pick it and use **Change settings** in Properties (see [Shapes made by a plugin](help:plugin-shapes)). Frameling redraws it, as one Undo step, and keeps the size, turn and place you gave it.

## Guides

A plugin you allowed to **draw on the canvas** can show a grid, a ruler or a counter on top of your canvas. They are never part of your drawing or your exports, and they stay out of the way while you play the animation.

Shapes and tools snap to the straight lines and boxes of a plugin's guide too. It is one tick, **Plugin guides**, in [Snapping](help:snapping), and it goes off with the plugin or when you switch off its power to draw.

## Turn them off

**Plugins > Manage plugins...** has a switch for each power. Turning off **Add its own tools** takes the tool out of the toolbox straight away. See [What a plugin may ask for](help:plugin-permissions).`,
  'making-plugins': `A plugin is a folder (or a **.zip** of it) with two files:

**manifest.json** says who it is and what it needs:

\`\`\`
{
  "id": "flip-every-other-frame",
  "name": "Flip every other frame",
  "version": "1.0.0",
  "description": "Mirrors frames 2, 4, 6...",
  "author": "You",
  "main": "main.js",
  "permissions": ["document.read", "document.edit"]
}
\`\`\`

The permissions are **document.read**, **document.edit**, **export**, **panels** and **network** (with a **network** list of https sites). Ask only for what you use; people see the list before they install.

Add \`"apiVersion": 2\` for the newer powers: **tools**, **canvas**, **shapes** and **files.read** (and **document.write**, another name for **document.edit**), the **events** list that says what the plugin wants to hear about, and **exporters**, which describes the options an export shows. People must switch on **tools**, **canvas**, **shapes** and **document.write** one by one, so ask for them only when you need them. Older plugins without \`apiVersion\` keep working exactly as before.

**main.js** is plain JavaScript. It runs in a worker, with no page and no files, and gets a **frameling** object:

- \`frameling.commands.register({ id, label }, run)\` adds a command to the Plugins menu.
- \`await frameling.document.get()\` gives the drawing, \`await frameling.document.state()\` the frame and layer you're on.
- \`await frameling.document.edit('Label', [ops])\` changes it, as one Undo step. Ops include **flipDrawing**, **transformDrawing**, **setPixels**, **setLayer**, **setShapeStyle**, **addMarker** and **addClip** (which can also set how it plays: direction and repeat).
- \`frameling.exporters.register({ id, label, extension }, (frames, info) => files)\` adds an export. Frames are RGBA pictures. Hand back \`[{ name, bytes }]\`, \`{ name, text }\` or \`{ name, image }\` (Frameling makes the PNG).
- \`frameling.panels.register({ id, title }, ui, onEvent)\` adds a panel described as a tree of parts.
- \`frameling.ui.notify('Done!')\` shows a message.
- \`frameling.progress(done, total)\` says how far a long command or export has got. Frameling turns off a plugin that goes quiet for 60 seconds during a job (10 seconds otherwise), and every report that moves forward gives it a fresh 60 seconds. An export's reports also show in the Export dialog.
- Version 2: \`frameling.events.on('frame.changed', fn)\` hears about the document, selection and frame changing and exports starting and finishing. \`frameling.tools.register(def, onPointer)\` adds a tool (it answers with \`{ overlay, ops }\`). \`frameling.canvas.overlay(list)\` shows a guide. \`frameling.shapes.register({ kind }, draw)\` adds a kind of shape, with \`shapes.place\` and \`shapes.update\`. \`frameling.files.pick()\` reads one file the person picks. Frameling draws every picture the plugin sends; the plugin never gets a canvas.

While you work on it, **Preferences > Plugins > Install from folder...** installs straight from your folder; install again to update. The full guide, with every op and part, is **docs/plugins.md** in Frameling's source, and examples of each power are in **plugins/examples**.`,
};
