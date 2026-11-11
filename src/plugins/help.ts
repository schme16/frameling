import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'plugins',
    title: 'Plugins',
    section: 'Plugins',
    summary: 'Add new commands, exports and panels to Frameling. Each plugin runs in a sandbox and can only do what you allowed.',
    keywords: ['plugin', 'add-on', 'addon', 'extension', 'extend', 'install', 'permissions', 'sandbox', 'safe'],
    media: 'plugins.png',
    body: `A **plugin** adds something to Frameling: a command (like "Flip every other frame"), a new way to export, or a panel of its own.

## Install one

1. Get the plugin. It's a **.zip** file.
2. Choose **Plugins > Install a plugin...** and pick the file.
3. Frameling shows what the plugin asks to do. Read it, then choose **Install**.

Its commands turn up in the **Plugins** menu and the command palette (**Ctrl+K**). Exports go in the **File** menu. Panels open from **View**.

## What a plugin can and can't do

Every plugin runs in its own **sandbox**, a closed box inside Frameling. It can't see your files, your other drawings or the rest of the app. It can only:

- **See your drawing**, if it asked to.
- **Change your drawing**, if it asked to. Each change is one step, so **Undo** (Ctrl+Z) takes it back.
- **Add a way to export**, if it asked to. Frameling draws the frames and asks you where to save; the plugin only makes the file.
- **Show a panel**, if it asked to. Frameling draws the panel from a simple list of buttons, sliders and text.
- **Use the internet**, only if it asked for it, named the sites, and you said yes. You can install it **without the internet** instead.

## Turn plugins on and off

**Plugins > Manage plugins...** (or **Preferences > Plugins**) lists them. Use the switch to turn one off for a while, or the bin to remove it. Turning one off takes away everything it added.

If a plugin goes wrong, Frameling says so and offers to turn it off. Your drawing is safe either way.

## Make your own

A plugin is a folder with a **manifest.json** and one script. See [Making a plugin](help:making-plugins).`,
  },
  {
    id: 'plugin-exports',
    title: 'Exporting with a plugin',
    section: 'Plugins',
    summary: 'Plugins can add new kinds of export. Frameling draws your frames, the plugin turns them into files, and you choose where they go.',
    keywords: ['plugin', 'export', 'contact sheet', 'format'],
    body: `A plugin that adds an export puts it in the **File** menu as **Export ...** (for example **Export Contact sheet...**).

1. Choose it. A small window asks which **frames** (the whole animation, one clip, or just this frame) and what **size**.
2. Choose **Export**, then where to save.
3. Frameling draws the frames, exactly as you see them on the canvas, and hands them to the plugin. The plugin makes the file, and Frameling saves it where you said.

The plugin never touches your disk itself. Pressing **Cancel** stops it straight away.`,
  },
  {
    id: 'plugin-panels',
    title: 'Plugin panels',
    section: 'Plugins',
    summary: 'A plugin can add a panel of buttons, sliders and text. It docks like any other panel.',
    keywords: ['plugin', 'panel', 'dock'],
    body: `Some plugins add a **panel**. It docks on the right at first, and you can drag it anywhere, like any other panel. Show or hide it from the **View** menu.

Frameling draws plugin panels itself, from a simple description the plugin sends: text, buttons, check boxes, sliders, number and text boxes, lists and colours. A plugin can't put web pages or anything else on screen.`,
  },
  {
    id: 'making-plugins',
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

**main.js** is plain JavaScript. It runs in a worker, with no page and no files, and gets a **frameling** object:

- \`frameling.commands.register({ id, label }, run)\` adds a command to the Plugins menu.
- \`await frameling.document.get()\` gives the drawing, \`await frameling.document.state()\` the frame and layer you're on.
- \`await frameling.document.edit('Label', [ops])\` changes it, as one Undo step. Ops include **flipDrawing**, **transformDrawing**, **setPixels**, **setLayer**, **setShapeStyle**, **addMarker** and **addClip**.
- \`frameling.exporters.register({ id, label, extension }, (frames, info) => files)\` adds an export. Frames are RGBA pictures. Hand back \`[{ name, bytes }]\`, \`{ name, text }\` or \`{ name, image }\` (Frameling makes the PNG).
- \`frameling.panels.register({ id, title }, ui, onEvent)\` adds a panel described as a tree of parts.
- \`frameling.ui.notify('Done!')\` shows a message.

While you work on it, **Preferences > Plugins > Install from folder...** installs straight from your folder; install again to update. The full guide, with every op and part, is **docs/plugins.md** in Frameling's source, and two examples are in **plugins/examples**.`,
  },
]);
