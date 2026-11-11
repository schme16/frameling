# Plugins

A plugin adds commands, ways to export and panels to Frameling. It is a folder (or a `.zip` of it) with a
`manifest.json` and one script. Two examples are in `plugins/examples/`:

- `flip-every-other-frame`: a command and a panel that mirror every other key on the current layer (reads and edits the
  drawing).
- `contact-sheet`: two exports, a numbered contact sheet as a PNG and as a one-page PDF (export only).

Install one with **Plugins > Install a plugin...** (a `.zip`), or, while working on it, **Preferences > Plugins >
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

| Field | |
|---|---|
| `id` | Lower case letters, numbers and dashes, 3 to 60 long. Stays the same across versions. |
| `name`, `version`, `description`, `author` | Shown in the install dialog and in Preferences > Plugins. |
| `main` | The script inside the package (default `main.js`). One file: bundle anything else into it. |
| `permissions` | What it needs. People see this list before installing. |
| `network` | With the `network` permission only: the https origins it talks to (`https://api.example.com`). |
| `apiVersion` | 1. A newer number than Frameling knows is refused with "needs a newer Frameling". |

| Permission | Lets it |
|---|---|
| (none) | Register commands and show short messages. |
| `document.read` | `frameling.document.get()` and `frameling.document.state()`. |
| `document.edit` | `frameling.document.edit()`. |
| `export` | `frameling.exporters.register()`. |
| `panels` | `frameling.panels.register()`. |
| `network` | `fetch`, `XMLHttpRequest` and `WebSocket` to the listed https sites, if the person allows it. |

If an update asks for more than was allowed before, it stays off until the person turns it on and allows it again.

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

`get()` is a copy: changing it changes nothing. Pixel drawings hold `pixels` as a `Uint8ClampedArray` (RGBA).
Changes go through `edit()`, and only these ops exist (`src/plugins/ops.ts`). A batch is all or nothing: one bad op
and nothing changes, and the promise rejects with a message saying why.

| Op | Fields |
|---|---|
| `flipDrawing` | `drawingId`, `axis: 'horizontal' \| 'vertical'` (vector: around the stage middle; pixel: the whole grid) |
| `transformDrawing` | `drawingId`, `matrix: [a, b, c, d, e, f]` (vector only) |
| `setPixels` | `drawingId`, `pixels` (width x height x 4 bytes, pixel only) |
| `setLayer` | `layerId`, any of `name`, `visible`, `locked`, `opacity` |
| `setDocument` | any of `name`, `fps` (1 to 120), `background` (`#rrggbb` or null) |
| `setShapeStyle` | `drawingId`, `shapeId`, any of `color`, `fill`, `opacity` |
| `removeShape` | `drawingId`, `shapeId` |
| `addMarker` / `removeMarker` | `frame`, `name` / `markerId` |
| `addClip` / `removeClip` | `name`, `start`, `end`, `loop` / `clipId` |
| `addSwatch` | `name`, `color` |

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
- `info`: `{ name, fps, width, height, scale, frameNumbers, clips, markers }`.

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
| Talking to the internet without asking | The sandbox page's Content Security Policy: `default-src 'none'; connect-src 'none'` (fetch, XHR, WebSocket, EventSource), and scripts only from `blob:` and inline, so no `importScripts` from the web. A worker made from a `blob:` URL inherits that policy. The prelude also removes `fetch` and friends so the error is clear, but the policy is the wall. Checked in Electron. |
| Talking to sites it didn't list | `plugin-host-net.html` allows only `https:` and, before the worker starts, adds a second policy narrowing `connect-src` to the listed origins. Policies only ever add restrictions. Plain `http:` is never allowed. |
| Popups, navigation, forms, downloads | Not allowed by the sandbox flags. The app also denies new windows and navigation (`src/main/main.ts`). |
| Changing the drawing in ways the app can't handle | Edits are a short list of ops, each checked (ids exist, numbers are finite and in range, arrays the right size). A batch is applied in one `store.update`, so it is one undo step, and a bad op leaves the drawing untouched. Without `document.edit` the call is refused. |
| Escaping through what Frameling draws | Panels are a small set of parts drawn by React from checked data; text is text. Export file names are cut down to plain names, and the files are written by Frameling to the place the person picked. |
| Flooding the app | At most 50 commands, 10 exports, 5 panels, 200 panel parts, 5000 ops a batch and 1000 export files. Problems are shown at most three times. Exports can be cancelled; turning the plugin off kills it. |
| Doing more after an update | Stored permissions are compared with the new manifest; anything new turns it off until approved again. |
| A plugin pretending to be part of Frameling | Its commands sit in the Plugins menu and its toasts start with its name. Its panels have a puzzle-piece icon. |

### What is not covered

- **A plugin you allowed to edit can still spoil your drawing.** Undo takes it back, but a plugin that makes a lot of
  changes over time can make that tedious. Save before trying a new plugin.
- **A plugin can use CPU and memory** in its worker. It can't freeze the app (it runs on another thread), and turning
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
(`frameling.plugins.v1`).

## Tests

- `test/plugins/`: manifests, ops (through a real store, with undo), the runtime against the real prelude over a real
  `MessagePort` (permissions, hostile messages, the network block, both examples end to end), the sandbox flags and
  policies, and the manager (install, turn off, update asking for more, remove).
- `scripts/e2e/plugins.cjs` (Electron): the sandbox page blocks fetch, XHR, WebSocket, remote scripts and storage,
  has no way into the app, and both examples install, run, undo and export.
