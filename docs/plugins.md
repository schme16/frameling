# Plugins

A plugin adds commands, ways to export and panels to Frameling, and (version 2, with the person's yes) tools, its own
kinds of shape, guides on the canvas and options in the Export dialog. It is a folder (or a `.zip` of it) with a
`manifest.json` and one script. Examples are in `plugins/examples/`:

- `flip-every-other-frame` (version 1): a command and a panel that mirror every other key on the current layer (reads and
  edits the drawing).
- `contact-sheet` (version 1): two exports, a numbered contact sheet as a PNG and as a one-page PDF (export only).
- `star-kit` (version 2): its own kind of shape, a tool that stamps it and a panel that redraws it (`tools`, `shapes`).
- `drawing-guides` (version 2): a rule-of-thirds grid and a frame counter on the canvas, kept up to date by an event
  (`canvas`, `events`).
- `layer-fader` (version 2): a tool that answers with a preview and an edit (`tools`, `document.write`).
- `export-report` (version 2): an exporter with options (text, choice, number, switch) and export events.

**Version 1 plugins keep working unchanged.** A manifest without `apiVersion` (or with 1) is a version 1 plugin: same
API, same install question as before. Version 2 only adds.

Install one with **Plugins > Install a plugin...** (a `.zip`, or the same zip renamed `.flplugin`), or, while working on it, **Preferences > Plugins >
Install from folder...** (desktop only). Installing again with the same `id` updates it.

## The manifest

```json
{
  "id": "flip-every-other-frame",
  "name": "Flip every other frame",
  "version": "1.0.0",
  "description": "Mirrors every other key on the layer you're on.",
  "author": "You",
  "main": "main.js",
  "permissions": ["document.read", "document.edit", "panels"],
  "network": [],
  "apiVersion": 1
}
```

A version 2 manifest adds `events` and `exporters` and may ask for more permissions:

```json
{
  "id": "star-kit",
  "name": "Star kit",
  "version": "1.0.0",
  "main": "main.js",
  "permissions": ["document.read", "tools", "shapes", "panels"],
  "events": ["frame.changed"],
  "exporters": { "report": { "options": [ { "id": "every", "type": "number", "label": "Every Nth frame", "min": 1, "max": 100, "default": 1 } ] } },
  "apiVersion": 2
}
```

| Field | |
|---|---|
| `id` | Lower case letters, numbers and dashes, 3 to 60 long. Stays the same across versions. |
| `name`, `version`, `description`, `author` | Shown in the install dialog and in Preferences > Plugins. |
| `main` | The script inside the package (default `main.js`). One file: bundle anything else into it. |
| `permissions` | What it needs. People see this list before installing. |
| `network` | With the `network` permission only: the https origins it talks to (`https://api.example.com`). |
| `apiVersion` | 1 (the default) or 2. A newer number than Frameling knows is refused with "needs a newer Frameling". Version 2 things in a version 1 manifest are refused, saying what to change. |
| `events` | Version 2. The events it wants to hear about (see Events). It hears nothing it did not list. |
| `exporters` | Version 2. `{ "<exporter id>": { "options": [...] } }`: what each exporter asks in the Export dialog (see Exporter options). |

| Permission | Lets it |
|---|---|
| (none) | Register commands and show short messages. |
| `document.read` | `frameling.document.get()` and `frameling.document.state()`. |
| `document.edit` | `frameling.document.edit()`. |
| `export` | `frameling.exporters.register()`. |
| `panels` | `frameling.panels.register()`. |
| `network` | `fetch`, `XMLHttpRequest` and `WebSocket` to the listed https sites, if the person allows it. |
| `tools` | Version 2. `frameling.tools.register()`: tools in the toolbox that hear the pointer. |
| `canvas` | Version 2. `frameling.canvas.overlay()`: a guide Frameling draws on top of the canvas. |
| `shapes` | Version 2. `frameling.shapes.*`: its own kinds of shape in the drawing. |
| `files.read` | Version 2. `frameling.files.pick()`: asks the person to pick a file, then reads that file only. |
| `document.write` | Version 2's spelling of `document.edit` (the same power; either works in a version 2 manifest). |

### How the person is asked

The install (and turn on, and update) dialog lists what the plugin asks for in plain words ("Draw on the canvas", "Add its
own tools", "Change your drawing", "Add its own kinds of shape"), with what each could do in the wrong hands and a
warning. In a **version 2** manifest the powers that change things (`document.write`, `tools`, `canvas`, `shapes`) and
`network` each have their own switch, **all off to start with**. The plugin installs either way and runs with the parts that
need a refused power left out: its `register` calls for them are ignored without an error, and `await frameling.permissions()`
says what it was given. A plugin that never asked for a power and uses it anyway gets an error and a message to the person.
A **version 1** manifest is asked as it always was (everything it lists is allowed, `network` has its own switch).

What was decided is remembered for each plugin: which powers were allowed, which were refused, the version it was decided
for. A newer version that asks for nothing it was not already asked about keeps the answer; one that asks for more stays
off until it is turned on and the person says yes (`samePermissions` in `src/plugins/manifest.ts`). **Preferences >
Plugins** has a switch for each power: turning one off restarts the plugin without it at once; turning one on asks again.

## The API

The script runs in a Web Worker with a global `frameling` object. Everything that talks to Frameling returns a promise.

### Commands

```js
frameling.commands.register({ id: 'flip', label: 'Flip every other frame', description: '...' }, async () => { ... });
```

Shows in the **Plugins** menu and the command palette as `plugin.<plugin id>.<command id>`. People can give it a
shortcut in Preferences > Keyboard.

### The drawing

```js
const doc = await frameling.document.get();      // the whole document (src/core/format.ts), as saved
const st = await frameling.document.state();     // { frame, activeLayerId, selection, drawingId }
await frameling.document.edit('Label', [ops]);   // one undo step called "<plugin name>: Label"
```

`get()` is a copy: changing it changes nothing. Pixel drawings hold `pixels` as a `Uint8ClampedArray` (RGBA) of just the painted part: `width` x `height` art pixels at (`x`, `y`) on the art grid (`x` and `y` are missing when 0).
Changes go through `edit()`, and only these ops exist (`src/plugins/ops.ts`). A batch is all or nothing: one bad op
and nothing changes, and the promise rejects with a message saying why.

| Op | Fields |
|---|---|
| `flipDrawing` | `drawingId`, `axis: 'horizontal' \| 'vertical'` (vector: around the stage middle; pixel: the whole grid) |
| `transformDrawing` | `drawingId`, `matrix: [a, b, c, d, e, f]` (vector only) |
| `setPixels` | `drawingId`, `pixels` (width x height x 4 bytes, pixel only), and optionally `x`, `y`, `width`, `height` to put a different block (whole numbers, 0 to 16384; Frameling trims it to what is painted). Without them it replaces the block the drawing holds. |
| `setLayer` | `layerId`, any of `name`, `visible`, `locked`, `opacity` |
| `setDocument` | any of `name`, `fps` (1 to 120), `background` (`#rrggbb` or null) |
| `setShapeStyle` | `drawingId`, `shapeId`, any of `color`, `fill`, `opacity` |
| `removeShape` | `drawingId`, `shapeId` |
| `addMarker` / `removeMarker` | `frame`, `name` / `markerId` |
| `addClip` / `removeClip` | `name`, `start`, `end`, `loop`, `direction`, `repeat` / `clipId` |
| `addSwatch` | `name`, `color` |

`addClip`'s `direction` is `'forward'` (the default), `'reverse'`, `'pingpong'` or `'pingpong-reverse'`, and `repeat` is
how many times it plays, a whole number from 1 to 999. Give a `repeat` without `loop` and the clip plays that many times
instead of for ever; `loop: true` plays for ever and ignores `repeat`. Both are optional, so older plugins keep working
(`apiVersion` is still 1).

Edits are refused while a symbol or tile is open for editing in place.

### Exports

```js
frameling.exporters.register(
  { id: 'png', label: 'Contact sheet (PNG)', extension: 'png', multiple: false, transparent: false },
  async (frames, info) => [{ name: 'sheet.png', image: { width, height, data } }],
);
```

It shows in the **File** menu as **Export Contact sheet (PNG)...**. Frameling asks which frames and what size, asks
where to save, draws the frames exactly as the canvas does, and calls the function with:

- `frames`: `[{ width, height, data }]`, RGBA `Uint8ClampedArray`s, first to last. With `transparent: false` they're
  drawn on the stage colour (or white).
- `info`: `{ name, fps, width, height, scale, frameNumbers, clips, markers }`. Each clip is
  `{ name, start, end, loop, direction, repeat }`: `direction` is `'forward'`, `'reverse'`, `'pingpong'` (first to last
  and back, the end frames shown once) or `'pingpong-reverse'`, and `repeat` is how many times it plays when `loop` is
  false (1 = once; ignored when `loop` is true; for the back and forth directions each direction counts as one, so 1 is there only and 2 is there and back). `direction` and `repeat` came later and `apiVersion` is still 1, so
  older plugins that ignore them keep working. `frames` is always the chosen range in order: a plugin that wants a
  clip's play order builds it from these.

Return a list of files, each `{ name, bytes }` (a `Uint8Array`), `{ name, text }` (saved as UTF-8) or
`{ name, image: { width, height, data } }` (Frameling makes the PNG). With `multiple: true` they go into a folder the
person picks; otherwise the export must make exactly one file. Names are cut down to plain file names.
`OffscreenCanvas`, `createImageBitmap` and `CompressionStream` work in the worker (the contact sheet uses all three).

### Panels

```js
const panel = frameling.panels.register({ id: 'flip', title: 'Flip frames' }, ui, async (event) => { ... });
panel.update(nextUi);
```

A panel is described, not drawn. `ui` is a tree of these parts (`src/plugins/ui-schema.ts`), at most 200 of them:

| Part | Fields | Event value |
|---|---|---|
| `column`, `row` | `children` | |
| `text` | `text`, `style: 'title' \| 'muted'` | |
| `divider` | | |
| `button` | `id`, `label`, `primary` | `true` |
| `checkbox` | `id`, `label`, `value` | boolean |
| `slider` | `id`, `label`, `min`, `max`, `step`, `value` | number |
| `number` | `id`, `label`, `value`, `min`, `max`, `step` | number |
| `text-input` | `id`, `label`, `value` | string (on Enter or leaving the box) |
| `select` | `id`, `label`, `options: [{ value, label }]`, `value` | string |
| `color` | `id`, `label`, `value` (`#rrggbb`) | string |

Events arrive as `{ id, value }`. Unknown parts are dropped. Text is shown as text, never as HTML.

### Messages

```js
frameling.ui.notify('Done!', 'success'); // 'info', 'success', 'warn' or 'error'
```

Shown as a toast starting with the plugin's name.

### Events (version 2)

```js
frameling.events.on('frame.changed', (e) => { ... });   // also 'document.changed', 'selection.changed', 'export.started', 'export.finished'
frameling.events.off('frame.changed', fn);
```

List the events in the manifest's `events`; asking to hear one that is not listed is an error. Payloads are summaries,
never the drawing:

| Event | Payload |
|---|---|
| `document.changed` | `{ label, frame, length, layers, drawings, shapes }`: counts, and the name of the last Undo step. Folded into one at most every 300 ms. |
| `selection.changed` | `{ count, ids }`: `ids` (up to 200) only with `document.read`. At most every 100 ms. |
| `frame.changed` | `{ frame }`. At most every 80 ms. |
| `export.started`, `export.finished` | `{ format, name }`, and for finished `{ ok, cancelled, error }`. `format` is the format id, or `plugin:<plugin>:<exporter>`. |

Changes the plugin makes itself are announced too, so a plugin that edits in answer to `document.changed` can keep itself busy: check what changed before editing. While a burst of changes goes by, only the newest is sent, once the gap is over. No more than 40 events a second go to a
plugin, and a plugin that does not finish handling them (200 waiting) stops being told, with a message.

### Exporter options (version 2)

Describe options in the manifest (or, for a plugin that works them out, as `options` in the `register` call; the manifest wins):

| Type | Fields |
|---|---|
| `number` | `id`, `label`, `min`, `max`, `step`, `default` |
| `choice` | `id`, `label`, `choices: [{ value, label }]`, `default` |
| `switch` | `id`, `label`, `default` |
| `text` | `id`, `label`, `maxLength`, `default` |

All take an optional `hint`. At most 20. They appear in the plugin's Export dialog; the values are checked against the
description (wrong kinds and out of range fall back to the default) and passed as the third argument:
`async (frames, info, options) => files`. Frameling remembers what was used for next time.

### Tools (version 2, `tools`)

```js
frameling.tools.register({ id: 'stamp', label: 'Star stamp', icon: 'polygon', layers: ['vector'] }, async (e) => {
  // e = { type: 'down' | 'move' | 'up' | 'hover' | 'cancel' | 'leave', x, y, pressure, shift, alt, mod, button, frame, drawingId, zoom }
  return { overlay: [...], ops: [...], label: 'Stamp', hint: 'Short message' };   // everything optional
});
```

The tool joins the toolbox (`group: extras`). It has no shortcut of its own, so a plugin can never take one of Frameling's keys; people can give it one in Preferences > Keyboard. `x` and `y` are in stage coordinates (document pixels). Frameling sends events
one at a time: while the plugin is still answering, pointer moves pile up into the newest one; presses and releases are never
dropped. The answer is checked: `overlay` is a draw list shown while the tool is picked, `ops` are the same edit ops as
`document.edit()` (applied as one undo step called `<plugin>: <label>`, and only if it was allowed `document.write`), and
`hint` is shown near the cursor. A tool that fails to answer within 2 seconds three times in a row is left alone.

### Canvas guides (version 2, `canvas`)

```js
frameling.canvas.overlay([{ type: 'line', x1: 0, y1: 0, x2: 100, y2: 100, stroke: '#ff0000' }]);   // [] takes it away
```

A guide drawn on top of the canvas in stage coordinates, never part of the drawing or an export, hidden while playing. At
most 30 updates a second.

### Draw lists

Pictures a plugin sends (tool previews, guides, the drawing of a shape) are **draw lists**: plain data that Frameling checks
and draws itself. The plugin never gets a canvas. At most 1000 items and 20000 points; colours are `#rrggbb` or `#rrggbbaa`.

| Item | Fields |
|---|---|
| `line` | `x1`, `y1`, `x2`, `y2` |
| `rect` | `x`, `y`, `w`, `h`, `r` (corner radius) |
| `ellipse` | `cx`, `cy`, `rx`, `ry` |
| `polygon`, `polyline` | `points: [[x, y], ...]` |
| `path` | `d: [['M', x, y], ['L', x, y], ['Q', cx, cy, x, y], ['C', c1x, c1y, c2x, c2y, x, y], ['Z']]` |
| `text` | `x`, `y`, `text`, `size`, `align` (guides and previews only; left out of shapes) |

Every item may have `stroke`, `fill`, `width`, `opacity`, `join`, `cap`; on guides also `dash: [on, off]` and `screen: true`
(widths and dashes in screen pixels, so they keep their size at any zoom). A line with no colour is a thin black line.

### Shapes (version 2, `shapes`)

```js
frameling.shapes.register({ kind: 'star', label: 'Star' }, (props) => drawList);      // local coordinates, (0, 0) is the middle
const inst = await frameling.shapes.place('star', { points: 5 }, { x: 300, y: 200 }); // adds it, picks it; one undo step
await frameling.shapes.update(inst, 'star', { points: 7 });                            // redraws it, centred where it was
```

A plugin shape is **ordinary vector shapes**, so every tool, renderer and exporter (SVG, PDF, Lottie, ...) works on it, and
the file opens and looks right without the plugin. Frameling asks the plugin's draw function for a draw list, checks it,
turns it into path shapes tied together with a group id (`pg-<inst>`), and writes this into each part's `ext` bag under
`plugin.<plugin id>`: `{ kind, inst, part, props? }` (`props`, the settings, only on part 0; at most 64 KB of plain JSON, 12
deep). The file reader already keeps `ext` untouched. If the plugin draws nothing, a faint box with a cross stands in
(`placeholder: true`).

Moving, colouring or deleting the parts with the ordinary tools works. Changing the settings needs the plugin: when a
drawing that uses a plugin that is off or not installed opens, Frameling says so, with a **Turn it on** button
(`src/plugins/docPrompt.ts`). A plugin can only redraw its own shapes (the ext key holds its id). At most 20 shapes a
second; a locked layer refuses them.

### Files (version 2, `files.read`)

```js
const f = await frameling.files.pick({ extensions: ['svg'], title: 'Pick a picture' });   // { name, bytes } or null
```

Shows the Open dialog. The person picks, the plugin gets that one file (up to 50 MB) and nothing else, and never a path.
Desktop only.

## How it runs

```
app page ──MessagePort── sandboxed iframe (plugin-host.html) ── starts ──> Worker (prelude + plugin script)
            (the port is handed straight to the worker; the frame only starts it)
```

1. `src/plugins/sandbox.ts` adds a hidden `<iframe sandbox="allow-scripts">` that loads `public/plugin-host.html`
   (or `plugin-host-net.html` for a plugin allowed onto the network).
2. The frame says it's ready; the app sends it the prelude (`src/plugins/prelude.ts`), the plugin's script and one end
   of a `MessageChannel`.
3. The frame starts a Worker from the prelude and hands it the port. The prelude builds `frameling` on top of the port,
   then loads the plugin's script.
4. `src/plugins/runtime.ts` answers on the app's side. `src/plugins/manager.ts` wires what the plugin registers into
   the app's command, panel and export registries, and takes it all away when the plugin is turned off.

Turning a plugin off removes the frame, which ends its worker even if it's stuck in a loop.

## Threat model

**What we protect:** the person's files and computer, their other drawings, the app itself (its DOM, storage and the
desktop bridge `window.frameling`), and their trust that a plugin does what its install dialog said.

**Who we don't trust:** the plugin's code, completely. It may be careless or written to do harm. Everything it sends is
treated as hostile input.

**What the person decides:** whether to install it, after seeing what it asks for; whether to let it use the internet
(a separate switch, off by default); and when to turn it off or remove it.

### Boundaries

| Threat | What stops it |
|---|---|
| Reading files, running programs, Node | The plugin runs in the page's renderer, which has no Node (`nodeIntegration: false`, `sandbox: true`, `contextIsolation: true`). It never gets `window.frameling`. |
| Reaching into the app's DOM, storage or the bridge | The worker has no DOM. The frame has `sandbox="allow-scripts"` without `allow-same-origin`, so it has an opaque origin: no access to the parent page, its storage or cookies, and no IndexedDB or cache storage of its own. `scripts/e2e/plugins.cjs` checks this in Electron. |
| Talking to the internet without asking | The sandbox page's Content Security Policy: `default-src 'none'; connect-src 'none'` (fetch, XHR, WebSocket, EventSource), and scripts only from `blob:` and inline, so no `importScripts` from the web. A worker made from a `blob:` URL inherits that policy. The prelude also removes `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `WebTransport`, `indexedDB` and `caches` so the error is clear, but the policy is the wall. Checked in Electron. |
| Talking to sites it didn't list | `plugin-host-net.html` allows only `https:` and, before the worker starts, adds a second policy narrowing `connect-src` to the listed origins. Policies only ever add restrictions. Plain `http:` is never allowed. |
| Popups, navigation, forms, downloads | Not allowed by the sandbox flags. The app also denies new windows and navigation (`src/main/main.ts`). |
| Changing the drawing in ways the app can't handle | Edits are a short list of ops, each checked (ids exist, numbers are finite and in range, arrays the right size). A batch is applied in one `store.update`, so it is one undo step, and a bad op leaves the drawing untouched. Without `document.edit` the call is refused. |
| Escaping through what Frameling draws | Panels are a small set of parts drawn by React from checked data; text is text. Export file names are cut down to plain names, and the files are written by Frameling to the place the person picked. |
| Flooding the app | At most 50 commands, 10 exports, 5 panels, 200 panel parts nested at most 6 deep, 5000 ops a batch, and 1000 export files and 1 GB per export. Problems are shown at most three times. Exports can be cancelled; turning the plugin off kills it. |
| Doing more after an update | What was asked about is compared with the new manifest; anything new turns it off until approved again. |
| Elevated powers without a yes | Each of `document.write`, `tools`, `canvas`, `shapes` and `network` has its own switch, off to start with. The host checks the grant on every message (`can()` needs it both listed in the manifest and granted), so a plugin cannot use a power it was refused or never asked for. |
| Drawing on the canvas or over Frameling's own screen | Plugins never get a canvas. Tools, guides and shapes send **draw lists**: plain data, checked (known items, finite numbers, hex colours only, at most 1000 items and 20000 points) and drawn by Frameling, inside the canvas, never in the page. Text is drawn with a fixed font. |
| A tool or shape that hangs | Tool answers must come within 2 s (three misses in a row and it is left alone); a shape's draw function within 5 s. Pointer moves are folded while it is busy, so nothing queues up. |
| A tool or shape flooding the drawing | Tool ops are the same checked ops (at most 5000 a batch, one undo step); at most 20 shapes a second; each shape's settings at most 64 KB. Events: at most 40 a second, and a plugin that does not finish them stops getting them. |
| Reading files | `files.read` shows the system's Open dialog; the plugin gets one file the person picked, never a path. |
| Reading the drawing through events | Events are counts and a label. Selection ids need `document.read`. |
| A plugin pretending to be part of Frameling | Its commands sit in the Plugins menu and its toasts start with its name. Its panels have a puzzle-piece icon. |

### What is not covered

- **A guide on the canvas can mislead.** A plugin allowed to draw on the canvas can cover or imitate things inside the
  canvas area (it cannot reach outside it). The dialog says so; Preferences > Plugins can turn it off at once.
- **A plugin you allowed to edit can still spoil your drawing.** Undo takes it back, but a plugin that makes a lot of
  changes over time can make that tedious. Save before trying a new plugin.
- **A plugin can use CPU and memory** in its worker (there is no memory limit on a worker, only on what it sends back). It can't freeze the app (it runs on another thread), and turning
  it off stops it.
- **Data you let it see can be shown back to you** in its panel or messages. Without the network permission it has no
  way to send it anywhere.
- **A plugin with the network permission can send what it reads to the sites it listed.** That's why the switch is
  separate and off by default, and why sites must be listed.
- **There's no code signing or plugin store.** People install files they got from somewhere; the dialog shows the
  author's name as the plugin claims it. A future gallery would need signing and review.
- **Side channels** (timing, Spectre-style attacks against the renderer process) are outside this design. Chromium's
  site isolation may put the opaque-origin frame in its own process, but we don't rely on it.

## Where plugins are kept

Desktop: `library/plugins/<id>.zip` in Frameling's user data folder (Preferences > Plugins > Show plugins folder).
Web: the browser's IndexedDB (store `library`). On/off state and what was allowed are in `localStorage`
(`frameling.plugins.v1`): whether it is on, which powers were allowed, which it was asked about and the version it was decided for. Export options are remembered in `frameling.plugins.exportOptions.v1`. `frameling.apiVersion` is 2 in the sandbox; a plugin that must run on an older Frameling checks it.

## Tests

- `test/plugins/`: manifests, ops (through a real store, with undo), the runtime against the real prelude over a real
  `MessagePort` (permissions, hostile messages, the network block, both examples end to end), the sandbox flags and
  policies, and the manager (install, turn off, update asking for more, remove). Version 2: `v2-manifest` (manifests, v1
  compatibility, what is asked about), `runtime-v2` (events, tools, guides, shapes, files, exporter options and the limits,
  against the real prelude), `manager-v2` (the permission flow: ask, remember per version, refuse, revoke; a tool and a shape
  kind round trip through the real store; events), `drawlist`, `shapes` (placing, redrawing, a saved file opening and
  saving without the plugin), `options`, `events`, `pipe`.
- `scripts/e2e/plugins.cjs` (Electron): the sandbox page blocks fetch, XHR, WebSocket, remote scripts and storage,
  has no way into the app, the version 1 examples install, run, undo and export, and the version 2 examples run in the real
  sandbox: powers start off in the dialog, a tool stamps a shape and fades a layer, an exporter gets its options, events flow.
