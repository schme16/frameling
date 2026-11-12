import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'plugins',
    order: 1,
    title: 'Plugins',
    section: 'Plugins',
    summary: 'Add new commands, tools, shapes, exports and panels to Frameling. Each plugin runs in a sandbox and can only do what you allowed.',
    keywords: ['plugin', 'add-on', 'addon', 'extension', 'extend', 'install', 'permissions', 'sandbox', 'safe'],
    media: 'plugins.png',
    body: `A **plugin** adds something to Frameling: a command (like "Flip every other frame"), a new way to export, a panel of its own, and, if you allow it, tools, kinds of shape and guides on your canvas.

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

## Make your own

A plugin is a folder with a **manifest.json** and one script. See [Making a plugin](help:making-plugins).`,
  },
  {
    id: 'plugin-exports',
    media: 'plugin-exports.png',
    title: 'Exporting with a plugin',
    section: 'Plugins',
    summary: 'Plugins can add new kinds of export. Frameling draws your frames, the plugin turns them into files, and you choose where they go.',
    keywords: ['plugin', 'export', 'contact sheet', 'format'],
    body: `A plugin that adds an export puts it in the **File** menu as **Export ...** (for example **Export Contact sheet...**).

1. Choose it. A small window asks which **frames** (the whole animation, one clip, or just this frame) and what **size**.
2. Choose **Export**, then where to save.
3. Frameling draws the frames, exactly as you see them on the canvas, and hands them to the plugin. The plugin makes the file, and Frameling saves it where you said.

Some exports have **options** of their own (a number, a list to choose from, a switch or a text box). They show in the same window, under the plugin's name, and Frameling remembers what you chose for next time.

The plugin never touches your disk itself. Pressing **Cancel** stops it straight away.`,
  },
  {
    id: 'plugin-panels',
    title: 'Plugin panels',
    section: 'Plugins',
    summary: 'A plugin can add a panel of buttons, sliders and text. It docks like any other panel.',
    keywords: ['plugin', 'panel', 'dock'],
    media: 'plugin-panel.png',
    body: `Some plugins add a **panel**. It docks on the right at first, and you can drag it anywhere, like any other panel. Show or hide it from the **View** menu.

Frameling draws plugin panels itself, from a simple description the plugin sends: text, buttons, check boxes, sliders, number and text boxes, lists and colours. A plugin can't put web pages or anything else on screen.`,
  },
  {
    id: 'plugin-permissions',
    media: 'plugin-permissions.png',
    title: 'What a plugin may ask for',
    section: 'Plugins',
    summary: 'Some plugin powers need a yes of their own: adding tools, drawing on the canvas, adding shapes and changing your drawing. Each has its own switch, and you can change your mind.',
    keywords: ['plugin', 'permission', 'allow', 'power', 'safe', 'security', 'revoke', 'switch', 'ask', 'warning'],
    body: `Before a plugin that wants more than the basics is installed, Frameling stops and asks. Each **power** is on its own switch, and **every one starts off**:

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
  },
  {
    id: 'plugin-tools',
    media: 'plugin-tools.png',
    title: 'Plugin tools, shapes and guides',
    section: 'Plugins',
    summary: 'A plugin you allowed can add tools to the toolbox, its own kinds of shape and guides on your canvas.',
    keywords: ['plugin', 'tool', 'shape', 'guide', 'overlay', 'canvas', 'stamp', 'toolbox'],
    body: `## Tools

A plugin tool sits in the toolbox with the others (look for the puzzle piece or the icon it chose). Pick it like any tool. While it is picked, the plugin hears where you click and drag, and answers with a **preview** that Frameling draws for you, and, if you allowed it to change your drawing, the changes to make. Each change is one step, so **Undo** takes it back.

A tool that stops answering is left alone after a few tries, and Frameling says so.

## Shapes

A plugin can add a **kind of shape**, a star, a gear or a speech bubble, that remembers its settings. Frameling draws it as ordinary shapes you can move, colour and delete like any others. To change its settings, use the plugin (often a panel with sliders). Frameling redraws it where it was, as one Undo step.

## Guides

A plugin you allowed to **draw on the canvas** can show a grid, a ruler or a counter on top of your canvas. They are never part of your drawing or your exports, and they stay out of the way while you play the animation.

## Turn them off

**Plugins > Manage plugins...** has a switch for each power. Turning off **Add its own tools** takes the tool out of the toolbox straight away. See [What a plugin may ask for](help:plugin-permissions).`,
  },
  {
    id: 'making-plugins',
    media: 'making-plugins.png',
    title: 'Making a plugin',
    section: 'Plugins',
    summary: 'A plugin is a manifest.json and one JavaScript file. It talks to Frameling through the frameling object.',
    keywords: ['plugin', 'develop', 'api', 'script', 'javascript', 'manifest', 'make', 'write'],
    body: `A plugin is a folder (or a **.zip** of it) with two files:

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
- Version 2: \`frameling.events.on('frame.changed', fn)\` hears about the document, selection and frame changing and exports starting and finishing. \`frameling.tools.register(def, onPointer)\` adds a tool (it answers with \`{ overlay, ops }\`). \`frameling.canvas.overlay(list)\` shows a guide. \`frameling.shapes.register({ kind }, draw)\` adds a kind of shape, with \`shapes.place\` and \`shapes.update\`. \`frameling.files.pick()\` reads one file the person picks. Frameling draws every picture the plugin sends; the plugin never gets a canvas.

While you work on it, **Preferences > Plugins > Install from folder...** installs straight from your folder; install again to update. The full guide, with every op and part, is **docs/plugins.md** in Frameling's source, and examples of each power are in **plugins/examples**.`,
  },
]);
