# Architecture

How Frameling is put together, one short section per part, with the files to read. The document format has its own
page (`docs/format.md`), and so do the tests (`docs/testing.md`).

## The big picture

Frameling is an Electron app with a React and TypeScript page, built with Vite. There is no server.

- **Main process** (`src/main/`): windows, file dialogs, the disk, autosave copies, the user library, FFmpeg for
  ProRes. Bundled by esbuild to `dist/main/main.cjs` (`scripts/build-main.mjs`).
- **Preload** (`src/preload/`): puts a small bridge on `window.frameling`. Bundled to `dist/preload/preload.cjs`.
- **Renderer** (`src/renderer/` plus every feature folder): the whole app. Vite builds it to `dist/renderer`
  (`vite.config.ts`, root `src/renderer`, relative `base: './'`).
- **Platform layer** (`src/platform/`): the page only talks to `window.frameling`, the preload bridge, and keeps the
  few things it does for itself (downloads, the file picker, which OS this is).

Everything in the page reads and writes one store (`src/core/store.ts`). Features register commands, panels, tools,
help topics and choices in registries (`src/core/registry.ts`), and the shell (menus, palette, keyboard, dock, help)
is built from those registries. One renderer (`src/core/render.ts`) draws a frame for the canvas, thumbnails, onion
skins and every export, so what you see is what you export.

`npm run dev` (`scripts/dev.mjs`) builds main and preload, starts the Vite dev server on port 5199 and starts Electron
with `FRAMELING_DEV_URL` pointing at it.

## Main process

`src/main/main.ts`:

- One instance only. A second launch, macOS `open-file` and `open-url`, and `frameling://open?path=` links all open
  their file in the running window (`fileFromArgs`). The protocol handler is registered only when packaged.
- The window runs with `contextIsolation`, `sandbox` and no Node. The app version is passed as
  `--frameling-version=`. New windows are refused (http links go to the browser) and navigation is blocked.
- Closing with unsaved work asks Save / Don't save / Cancel natively. Don't save puts the work aside in "Recover
  unsaved work" rather than deleting it. At start-up anything a crash left behind is put aside too.

`src/main/ipc.ts` registers every channel (`files:*`, `recent:*`, `autosave:*`, `library:*`, `media:*`, `video:*`,
`app:*`). Each handler checks the sender is our own window. Writes are allowed only to files or folders the person
picked in a dialog this session, or to `.flplay` packages linked earlier (`linked-playables.json`). Opening is capped
at 1 GB. `FRAMELING_AUTOMATION_DIR` makes save dialogs answer themselves, for `scripts/e2e/export.cjs`.

Other files: `store.ts` (recent files in `files.json`, the autosave copy, kept copies for 7 days, atomic writes),
`library.ts` (the user library, below, and `frameling://` parsing), `paths.ts` (case-insensitive path keys on
Windows and macOS, safe file names), `menu.ts` (no native menu on Windows and Linux; a minimal one on macOS),
`media.ts` (FFmpeg to re-encode MP4 sound to AAC), `video.ts` (FFmpeg ProRes 4444 jobs fed raw RGBA frames).

## Preload and the bridge

`src/preload/api.ts` is the bridge's type, `FramelingApi`: `kind` (`'desktop'` or `'web'`), `platform`, `versions`,
`files`, `recent`, `autosave`, `app`, and the optional `library`, `media` and `video`. `src/preload/preload.ts` builds it
from `ipcRenderer` and exposes it with `contextBridge`.

## Platform layer

- `src/platform/index.ts`: `platformKind()` is `'none'` without a bridge, else `'desktop'`. `can(feature)`
  (`showInFolder`, `nativeMenus`, `closeWithSave`) is what code checks, along with `download`, `pickUpload` and
  `guessOs`. Very little code asks.
- `src/platform/ask.ts` + `AskDialog.tsx`: an in-page question (falls back to `confirm`).
- `src/platform/library.ts`: the library API, or an in-memory one.
- `src/io/desktop.ts` `desktop()` returns the bridge (desktop or web) or null.

## The store

`src/core/store.ts`. One `Store` holding `{doc, ui}`; `store()` returns it, `useStore(selector)` reads it in React,
`resetStore()` is for tests.

- **Changes** go through `update(label, recipe, {coalesce?})`, which runs immer's `produceWithPatches` on the doc.
  No patches, no step. Otherwise it records `{patches, inverse, label}` on the undo stack, clears redo, marks the
  document dirty and notifies listeners. Auto-freeze is off because pixel drawings hold typed arrays.
- **UI state** (`setUi`) is a shallow merge with no undo: frame, tool, selection, zoom, pan, playing, and so on.
- **Undo and redo** apply the inverse or forward patches. 300 steps are kept. Every undoable change must go through
  `update`.
- **Coalescing**: two updates with the same `coalesce` key within 1.2 s merge into one step, so a drag or typing is
  one undo. Keys are chosen by the caller (`depth-<layerId>`, `type-<session>`, `rig-joint-<bone>-<end>`).
- **No transactions.** A multi-part change is one recipe. Tools keep gesture state out of the doc with the canvas's
  live preview (`setLive`) and commit once at the end.
- `load(doc)` replaces the document and clears history. `markSaved(path)` clears dirty.

Three ways of editing "something inside" the document:

- **Tiles: nested editing** (`Store.enterNested` / `exitNested`, used by `src/tiles/tileEdit.ts`). Editing a tile swaps
  in a small document of its own (one pixel layer, a cel per tile frame) with fresh undo stacks. `store().rootDoc()`
  merges it back for saving. Leaving makes the whole session one undo step in the parent ("Edit tile ..."). Tile UI
  (brush, flips, tile mode) lives in `src/tiles/state.ts`, outside the store.
- **Symbols: `Doc.editing`** (`enterSymbol` / `exitSymbol` in `src/core/symbols.ts`, driven by `src/symbols/ops.ts`).
  Entering moves the symbol's layers into `doc.layers` and pushes an `EditFrame` holding what they replaced, so the
  timeline, canvas and tools work on it unchanged. Entering and leaving are ordinary undo steps. `rootDoc(doc)` puts
  everything back for saving and is memoised.
- **Artboards: swapping content** (`src/artboards/model.ts`, `ops.ts`). The open artboard's content is the document's
  own fields; the others hold theirs in `Artboard.content`. `switchArtboard` swaps them (an undo step, refused while a
  symbol is open). Leaving tile and symbol editing comes first. The view, frame and layer are remembered per artboard.
  See `docs/artboards.md`.

Save, autosave and versions always save `rootDoc(store().rootDoc())`: tile nesting merged, symbols put back.

## Registries

`src/core/registry.ts` holds module-level maps:

- **Commands** (`registerCommand`): `{id 'area.verb', label, category, keys?, help?, keywords?, enabled?, checked?,
  run, global?, layers?}`. Menus, the command palette, the keyboard, tooltips and the help audit all read them.
- **Help topics** (`registerHelp`, `registerHelpTopics`): `{id, title, summary, body? (Markdown, help:id links),
  section, keywords?, media?, order?}`. The words of the built-in topics are not in the topic: they sit in a
  `*.bodies.ts` file beside the topic list (`export const bodies = { 'topic-id': \`...\` }`) and load as one chunk
  (`src/core/helpBodies.ts`) when Help opens, so the start-up bundle only carries ids, titles, summaries and keywords.
  Read the words with `helpBody(topic)` after `await loadHelpBodies()` (the help browser does this and shows a short
  loading state; tests and scripts that search or audit the text await it first). A topic that sets `body` itself (a
  plugin's) needs neither.
- **Panels** (`registerPanel`): `{id, title, icon, component, zone: left|right|bottom, order?, help?}`.
- **Tools** (`registerTool`): `{id, label, icon, key?, layers, options?, down, move, up, hover, cancel, overlay, onKey,
  leave, ...}`.

`src/ui/dynamic.ts` `syncDynamicCommands()` makes commands on demand for every tool (`tools.<id>`), panel
(`view.panel.<id>`) and workspace (`view.workspace.<id>`), without overwriting ids a feature registered.

**Choices** (`src/core/choices.ts`): "ask the first time, then remember". `registerChoice`, `choose(id)` (asks through
the choice dialog), `withChoice`, `currentChoice`. Answers in `localStorage` `frameling.choices.v1`, changeable in
Preferences > Behaviour.

**Features (the trusted tier).** `src/features/feature.ts` defines `FeatureDescriptor`: id, name, a one-line `about`,
`optional`, `requires`, and what it registers (`commands`, `panels`, `tools`, `help`, `quests`, `choices`, `templates` ids,
`menus`, `sections` (panel info), plus `activate`/`deactivate`, `usedBy(doc)` and `opens(path)`). `src/features/host.ts` `registerFeatures` runs
each registration inside `withOwner(id, ...)` (`src/core/owners.ts`); every registry that adds something calls
`ownedUndo`, so `setFeatureOn(id, false)` takes away exactly that feature's things and `true` puts them back, no restart.
Choices live in `localStorage` `frameling.features.v1` (the ids turned off). A feature with `legacy: true` still registers
when its folder is imported (`src/features/planned.ts`, empty now) and is not offered in Preferences > Features until it is converted.
Every optional feature is converted: Lip sync, Audio, Clip flow, Interactives, Camera, Particles, Text, Tiles, Rig and Godot exports (`src/lipsync`, `src/audio`, `src/flow`, `src/interactives`,
`src/camera`, `src/particles`, `src/text`, `src/tiles`, `src/rig` `index.ts`, and `src/export/godot.ts`; copy one). A feature's Properties entry (`sections`, a `PanelInfo`) lives in
its descriptor too (`layerOf`, `picked` and `toolIs` in `src/ui/panelInfo.ts` help write `relevant`). Tiles and Rig read the document through **layer kinds**
(`src/core/layerKinds.ts`): `registerDrawingKind` (how a `tilemap` drawing is drawn, `draw`, and flattened to pixels, `flatten`, which the SVG, PDF and Lottie writers use) and
`registerLayerBinder` (how a layer attached to a bone is moved or bent). `src/tiles/kind.ts` and `src/rig/kind.ts` register them for good when the folder loads, so a level
or a puppet still draws, exports and saves with the feature off (that only takes away the panel, tools, commands, help, lesson, templates and, for Rig, the Delete-key takeover,
which is put back as it was). `test/setup-kinds.ts` loads them for tests. Godot exports has no document data, so it
has no `usedBy`; its sprite sheet engine card is a registered engine (`registerEngine` in `src/export/types.ts`) and a saved Godot setting falls back while it is off.
Camera, Particles and Text `usedBy` read the drawing (a camera layer, emitters, text shapes), so opening such a file with the feature off asks to turn it on; their
lessons carry `features` tags and are hidden; their shape kinds stay registered so the drawing still draws and exports. Audio shows its rows through timeline slots (`src/timeline/slots.ts`: `registerTimelinePart` for
the layer side, the grid and the header), so `timeline/` imports nothing from it. The data stays in the document
(`doc.audio`, `doc.flow`); Interactives leaves a marker in `doc.ext.interactives` (written by the Interactives export
for the drawing it embeds). A tool says which rail group it starts in with `group` and `groupAt` (`src/ui/toolArrange.ts`
only names tools in the Pixel workspace's default, `BUILTIN_RAILS`, and skips any that are not registered). Each workspace has its
own rail arrangement: `Workspace.rail` is its default, `DockState.rails[workspaceId]` is what the person changed (`railOf`,
`setToolGroups` in `src/ui/dock.ts`); the old single `layout.tools.groups` migrates into `rails` on load. Turning a feature off parks where its panels were (`parkPanels` in `src/ui/dock.ts`) and turning it on
puts them back there; the palette offers "Turn on X" and a lesson of it (`quests` or `Quest.features`) is put down. Opening a drawing whose `usedBy` says it holds data
of a feature that is off asks "Turn it on?" (`src/features/prompt.ts`, called from `io/document.ts`); help topics of an off
feature are hidden and a help search offers "Turn on X" (`hiddenHelp()`). `test/features/boundary.test.ts` keeps `core/`
from importing feature folders (only `core/render.ts -> effects` is left, and it stays: effects are core by nature; the list may only shrink) and lists who may import each converted feature. `test/features/all-off.test.ts`
runs the help audit and the shortcut check with every optional feature off. Owner-tagged registrations also include canvas
**Hidden features.** A descriptor's `hidden()` keeps a whole feature out of sight: nothing is registered, Preferences > Features does not list it, nothing offers to turn it on. Interactives is hidden by `src/features/flags.json` (`{ "interactives": false }`; set it to `true` and rebuild to bring it all back). `src/features/flags.ts` reads it: `ix(on, off)` is for its mentions in other features' help, and the installers read the same file in `electron-builder.cjs` (the settings that used to be `build` in package.json), so the `.flplay` file type is only claimed while it is on. `usedBy` and `opens` still work while hidden: `hiddenFeaturesUsedBy`/`hiddenFeatureOpening` let opening such a drawing or file say so plainly (`explainHiddenFile`, `offerTurnOn` in `src/features/prompt.ts`) instead of failing oddly. The help audit gets the hidden topics as `keptOut` (`hiddenFeatureHelp()`): their pictures still count, a link to one is broken. `test/features/hide-interactives.test.ts` checks both states.
hooks, file openers, save hooks, choices and template sources: call them from `activate()`.

**Export formats (a registry).** `src/export/registry.ts` holds `ExporterDef`s: the card (`info`), whether it is `popular`, plan rules
(`video`, `baked`, `stills`, `loops`, `singleFrame`, `extension`, `fileKind`, `folderTitle`), what it keeps (`carry`, `clipPlayNote`),
`prepare` (checks this computer, e.g. the video codec), `settle` (asks before saving), `support` (greys the card out with a reason),
`picked`/`opened` (settings to change when chosen), `repair` (remembered settings), `load()` (the making, `src/export/formats/*.ts`, loaded on
first use) and `ui()` (the options the dialog shows: `Before`, `Size`, `Notes`, `After`, `summary`, `exported`, in `src/export/options/*.tsx`).
`FormatId` is a plain string. The built-in formats register in `src/export/builtin.ts` (cards and rules only, so start-up stays light);
`src/export/types.ts` loads it, so `formatInfo(id)` always works. A feature adds a format through its descriptor
(`exporters: [...]`), which the host registers as that owner: the Interactives card is in `src/interactives/exporter.ts` and goes with
the feature. File > Export entries are ordinary commands, so a format's commands ride on the feature's `commands`. `runExport` and
`exportDocument` find the format through the registry and never name one. **Sound with Audio off:** exports always keep the sound
(it is in `doc.audio`, so a video mixes it in); Audio owns the sound-related export options, today the `export.mp4Sound` choice (what to do
when the sound would not play everywhere), so with Audio off nothing is asked and an MP4 stays an MP4.

**How a core area plugs in.** `src/renderer/features.ts` imports every area for its side effects, in order. A folder's
`index.ts` imports its `commands.ts` and `help.ts` and registers its panel, usually with `lazyPanel`. See
`src/particles/index.ts` for a small one. Canvas hooks for features: `registerDecoration` (`src/canvas/decorations.ts`),
`addStageOverlay`, `addCanvasGrab`, `addPointerDownHook` (`src/canvas/controller.ts`). A new kind of shape (beyond strokes, fills, paths and symbol instances) registers a
`ShapeKind` (`src/core/shapeKinds.ts`: `draw`, `extend` (box), `bounds`, `hit`, `transform`, `moving`, `pose`, `read`), and the export side registers a
`ShapeExport` (`src/export/shapeExport.ts`: `svg`, `pdf`, `lottie`, and the `feature` name "What carries over" uses). Text (`src/text/kind.ts`) and particles
(`src/particles/kind.ts`) do; `render.ts`, `symbols.ts`, `canvas/geometry.ts`, `io/file.ts` and the SVG, PDF/Illustrator and Lottie writers ask the registry and
import neither. A kind stays registered for good, also while its feature is off, so a drawing that holds one still draws, exports and saves; the export code
(`text/exports.ts`, `particles/exports.ts`) is loaded on first use (`loadShapeExports`, awaited by the formats that write shapes), and
`test/setup-kinds.ts` registers and loads them for every test. Lottie hands a kind a `LottieKit` (the writer's own helpers) so its sprites come out the same.

## The renderer and posing

`src/core/render.ts` is the single source of truth for how a frame looks.

- `renderFrame(g, doc, frame, opts)` paints the background, works out the camera view, and then either draws each
  visible layer (`drawLayerAt`) or hands the whole frame to the effects compositor when any layer has a look.
  `renderFrameToCanvas` returns an `OffscreenCanvas` for exports and thumbnails.
- `drawLayerAt` poses the layer (`poseAt`), then `drawDrawing`: vector shapes one by one (`drawShape`), pixel drawings
  as a cached canvas, tilemaps through `drawTilemap`. A faded layer reuses one scratch buffer.
- `drawShape` handles strokes, fills and paths (gradients from `src/core/gradient.ts`) and instances; text
  (`src/text/draw.ts`) and particles (`src/particles/draw.ts`) draw through their registered shape kinds.

**Posing** (`src/core/symbols.ts`): `poseAt(doc, layer, frame)` returns the drawing as it looks on that frame.

- A plain drawing comes back as the same object, so caches keyed on it keep working.
- A shape tween morphs the two keys (`morphShapes`, `src/core/shape-tween.ts`, with hints).
- Instances are tweened between keys (easing from `src/core/ease.ts`, spin, motion paths) and posed recursively into
  their symbol's timeline, at most 12 deep.
- Moving shapes (animated text, particles) get their frame or time stamped on by their kind's `pose` (`poseParticles`). Particles are worked
  out from the seed for each frame (`src/particles/model.ts`), with no step simulation.
- A layer bound to a bone is wrapped by `boundDrawing` (`src/rig/pose.ts`): moved by the bone, or bent through a skin
  mesh. Bone maths is `src/rig/math.ts`; weights are `src/rig/weights.ts`.
- `src/core/motions.ts` is data for one-click motions; it makes keys and plays no part in rendering.

**Camera** (`src/core/camera.ts`): `cameraViewAt` finds the first visible camera layer and eases its keys;
`layerCameraMatrix` applies parallax by `depth`. The editor decides whether to look through the camera
(`src/camera/ops.ts`); `src/camera/canvas.ts` draws the camera frame and registers the camera tool.

**Tilemaps** (`src/tiles/map.ts`, drawn through the `tilemap` drawing kind in `src/core/layerKinds.ts`): one bitmap per map, repainting only changed slots; maps over 16 megapixels are
drawn slot by slot. `src/tiles/look.ts` is editor-only (faded tile copies).

**Effects compositor** (`src/effects/`): `plan.ts` turns the layer list into steps (clips, masks, folders; folders can hold
folders, see `src/core/folders.ts`, which reads the flat layer list as a tree and is what the timeline rows and every
exporter walk);
`composite.ts` runs them with a buffer pool per depth and caches effect results; `apply.ts` does each effect;
`stage.ts` is the editor's way in, reusing the canvas's bitmaps. Symbols with a look inside are composited in their
own space. See `docs/effects.md`.

**Pixel drawings hold only what is painted** (`src/core/pixelBounds.ts`). A `PixelDrawing` is a block (`x`, `y`, `width`,
`height`, `pixels`) on the layer's art grid, trimmed after every edit, so `d.pixels` is NOT grid sized and `d.width` is NOT
the grid width. Code that thinks in grid positions (fills, selections, filters, tests) asks for `gridPixels(d, gw, gh)`
(read only, a short list of recent copies is kept) and writes back with `setGridPixels`, or through the tool helpers in
`tools/edit.ts`: `setActivePixels` (a whole-grid array) and `paintActiveGrid` (a copy to change in place). Code that
only walks pixels one by one (colour counts, recolouring, exports that draw the block) works on the block directly and
adds `x`, `y` where position matters (`render.ts`, `svg.ts`, `lottie.ts`, `pdf.ts`, `canvas/geometry.ts`). The pixel
session (`tools/pixelSession.ts`) still paints on a whole grid copy while a stroke is going, but commits only the rectangle
it touched joined with the old block (`setGridRect`), so a stroke on a 4000 x 4000 canvas copies a few kilobytes, not the
grid. Picture import (`pixel/import/build.ts` `drawingOf`) and the Aseprite import (lazy cels: `parseAseprite(bytes,
{ lazy: true })` inflates one cel at a time) build trimmed drawings straight away.

**Caches and invalidation.** Almost every cache is a `WeakMap` keyed on an object (a shape, a drawing, a pixel array,
a cel, a doc). Immer makes new objects for anything edited and pixel and tile arrays are replaced, never changed, so
an edit misses the old entry and the old one is garbage collected. The main ones:

| Cache | File | Bounded by |
|---|---|---|
| Stroke and path `Path2D`s, pixel canvases, mesh textures, bounding boxes | `core/render.ts` | Object identity |
| Symbol look pictures (32 MP), export effect results (16 MP) | `core/render.ts` | Pixel budget, oldest first |
| Pose results per cel, shown in-betweens | `core/symbols.ts` | 600 per cel, 200, at most 4 "worlds" per drawings object |
| `rootDoc` | `core/symbols.ts` | Doc identity |
| Shape tween plans | `core/shape-tween.ts` | 8 |
| Pose blends, meshes, bound drawings | `rig/pose.ts` | 400, identity |
| Tilemap bitmaps | `tiles/map.ts` | 24 maps; slot diffs repaint |
| Text widths and layouts | `text/draw.ts` | 5000 / 400; cleared when a font loads |
| Canvas layer bitmaps | `canvas/pipeline.ts` | 40 megapixels LRU |

## The canvas

- `src/canvas/CanvasView.tsx` is the React shell: stage div, main canvas, overlay canvas, the text editor, the symbol
  edit bar, the tile banner and rulers. It creates a `CanvasEngine` and stays out of the hot path.
- `src/canvas/engine.ts` `CanvasEngine` owns both canvases, the `FramePainter`, gestures (pan, tool, grab) and the
  animation frame loop. It subscribes to the store and repaints the main canvas only when the doc, frame, view, onion
  skin, light table or playing changes; anything else repaints only the overlay. While playing it pre-draws upcoming
  frames in about 5 ms per tick (`warmAhead`); when paused, idle callbacks pre-draw neighbouring frames.
- `src/canvas/pipeline.ts` `FramePainter.paint`: edit backdrop (symbol open), light table, onion skin or the empty
  frame ghost, then layers (through the compositor when needed), then the pasteboard. Vector layers use whole-stage
  bitmaps from `BitmapCache` (40 MP LRU); a new stroke is drawn onto a copy of the old bitmap rather than redrawing the
  drawing. Tile mode draws eight copies around the stage.
- `src/canvas/controller.ts` is the DOM-free meeting point: viewport (`getView`, `setView`, `fit`), live previews
  (`setLive`), redraw requests, cursor, hints, and the feature hooks.
- **Tool input**: pointer down pans (middle button, Space, hand tool), or runs pointer-down hooks, or a canvas handle
  (`grabAt`), or the current tool. The pointer is turned into document space (through the camera, then bone space) and
  passed to `tool.down/move/up`. Tools preview with `setLive` and the overlay, then commit with one `store().update`.
- Pure helpers: `view.ts` (zoom and pan maths), `input.ts` (wheel intent, Space tap), `onion.ts`, `lightTable.ts`,
  `snap.ts`, `grid.ts`, `guides.ts`. `perf.ts` records timings only with `?perf`.
- **Snapping choices**: `snapModel.ts` (pure) lists the targets (page, centre, guides, grid, other shapes, perspective,
  cells, angles, artboards) and `activeTargets` says which are in force for one gesture, from the master switch, the
  per-kind ticks (`viewSettings.snapPicks`: vector, pixel, artboard), Ctrl and what is showing. `guides.ts` asks it before
  every pull (`snapPt`, `snapMove`, `snapLineEnd`, `vanishingPoints`, `angleSteps`, `artboardTargets`), `snapShapes.ts`
  supplies other shapes' lines, `snapOps.ts` changes the ticks, `SnapOptions.tsx` is the popover, Preferences page and
  the "Snapped to" note. Pixel cells wins on a pixel layer (only cells, perspective and angles apply). Angle steps are
  a Shift choice, so the master switch and Ctrl do not stop them.

## The shell, dock and right side

`src/renderer/App.tsx` lays out the top bar, tool strip, left zone, canvas (with the pixel bar), bottom zone, right zone
and status bar, plus overlays (palette, preferences, choices, help, welcome, onboarding, About, toasts, tooltips).
Before the first paint it applies preferences and syncs panels and dynamic commands; on mount it installs the
keyboard, the roving keys and hover tracking, then onboarding or the welcome sheet. Two frames after mount it sets the
`frameling:interactive` mark and starts warming lazy parts.

- **Dock**, in layers:
  - `src/ui/dockModel.ts` is the pure model: `Layout` (zones `left`, `right`, `bottom`, `top` with tabs, active tab,
    size and collapsed state; `floats`, the floating windows, later = nearer the front; `tools`, where the tool rail
    is; `names`, panels the person renamed; `hidden`; `known`), `normaliseLayout` (tidies anything, so layouts saved
    before the top zone and windows load as they were), and the moves (`movePanelTo`, `moveGroupTo`, `dockFloat`,
    `closePanel`, `frontPanel`, `clampBox`...). No registry, no storage.
  - `src/ui/dock.ts` is the live store (`dock`), saved in `localStorage` `frameling.dock.v1` (`v: 2`), over the model:
    `syncPanels()` places newly registered panels by their `zone`, `reconcile` fits a layout to what is registered,
    `placePanel`, `floatPanel`, `showPanel`, `togglePanel`, workspaces (below). `panelsAway` is "Hide all panels".
  - `DockView.tsx` draws the zones (tabs fit by `tabFit.ts`: full, compact, or overflow behind "+N"); `DockFloats.tsx`
    the floating windows (two looks, `floatChrome`); `ToolStrip.tsx` the tool rail in whichever slot it is placed
    (`ToolSlot`) or floating (`ToolFloat`); `DockOverlays.tsx` the drag bands and label, the right-click menu and the
    name box.
  - `dockDrag.ts` does the dragging with pointer events (not HTML drag and drop, so a tab can leave the window).
    Views mark drop places with `data-dock-strip`, `-tab`, `-tabs`, `-axis`, `-area`, `-zone`, `-float` and `-edge`, and
    `targetAt` reads what is under the pointer. `dockMenus.ts` holds the menus as data; `dockCommands.ts` the
    commands ("this panel" is the last one clicked in, `lastPanel`).
- **Right side** (`src/ui/RightDock.tsx`), chosen by preference (`src/ui/rightStyle.ts`): `inspector` (default),
  `rail` or `tabs`. The rail is a vertical labelled strip. In inspector mode, panels marked as sections (tool options,
  colours, palette, tileset, motion, effects, text, particles, camera, bones) show as one stack of foldable sections
  called Properties, with sections that don't apply yet listed under "Also here" and selection-related ones moved up.
  Other panels (library, artboards, timeline, preview, clip flow, lip sync, quests, help, plugin panels) are rail
  entries.
- **`src/ui/panelInfo.ts`** is the data behind that: per panel a short name, blurb, rail group, whether it is a
  section, when it's relevant and why it's idle, and search keywords. Unknown panels (plugins) go under "More".
- `src/ui/PanelPicker.tsx` is the searchable list of every panel. `src/ui/rightCommands.ts` adds
  `view.properties` and `view.allPanels`.
- `src/symbols/PropertiesPanel.tsx` is the Motion section (instance and tween settings), not the whole inspector. Its
  `Num` and `Section` controls are reused elsewhere.

## Workspaces

`src/ui/dock.ts` `builtinWorkspaces()` makes Draw, Animate and Pixel from the registered panels, each with a one-line `about`. Pixel puts colours and
the palette on the left, closes panels pixel art rarely needs (`PIXEL_HIDDEN`) and narrows the tool strip
(`PIXEL_TOOLS`). People can keep up to 12 of their own (`saveWorkspace`, `renameWorkspace`, `moveWorkspace`, `deleteWorkspace`; floating windows, the tool rail place, its arrangement and its width (`railWidth`, pixels, from `src/ui/toolRailWidth.ts`; the person's own kept per workspace in `rails`' neighbour `railWidths`) and panel names go with a workspace). They share as a file or as text: `src/ui/workspaceFile.ts` writes and reads `{ format: 'frameling-workspace', version, name, layout... }` and trusts nothing in it (the same tidying as a saved layout, size and count caps), `importWorkspace` adds one with a free name, `workspaceActions.ts` has the file picker, clipboard and toasts. `applyWorkspace(id)` switches,
called from `view.workspace.<id>`, Preferences > Workspaces and onboarding. `src/pixel/workspace.ts` makes the workspace follow
the kind of document (one remembered choice, `workspace.follow`: Always / Not now / Never; Draw and Pixel only, Animate is left alone). `src/ui/presets.ts` is new-document size presets, not
workspaces.

The switcher in the top bar (`WorkspaceSwitcher.tsx`, pure parts in `switcherModel.ts`) shows every workspace as a tab, or one chip when the window is under 1400 wide or the `workspaceSwitcher` Preference says so (`tabs`, `chip`, `off`). `switcherSlots` keeps five tabs and the current one always on a tab. The three built-in workspaces have keys (`WORKSPACE_KEYS`, Ctrl+Alt+1 to 3), given to their `view.workspace.<id>` commands in `dynamic.ts`. A menu's `label` in `menus.ts` is its id (features add items by it); `title` is what the bar shows.

## Lazy loading

`src/core/lazy.ts`:

- `lazyModule(load, {warm?})` memoises an `import()` and retries after a failure.
- `lazyComponent(load)` wraps it in `React.lazy` and `Suspense`.
- `lazyPanel(load)` is a warmed lazy component, for panels.
- `warmLazyParts()` runs 1.5 s after start-up and loads warmed modules one at a time in idle time, so the first click
  doesn't wait.

Deferred this way: most dock panels (help, clip flow, tileset, artboards, bones, camera, effects, particles, text,
quests, palette, preview, lip sync, library, motion), the Export dialog and every exporter (`src/export/open.ts`),
Preferences, the help window and the welcome sheet (warmed), onboarding and About (not warmed), plugin exports. Some
dialogs use plain `import()` without warming (document and grid settings, tileset export, artboard player and export,
rotate, recolour, save template, versions). `src/renderer/debug.ts` loads only with `?debug`. Start-up cost is measured
by `scripts/perf/startup.cjs`.

## The timeline

`src/timeline/`. One panel (`timeline`, bottom zone), two looks:

- **Detailed** (default): key, hold and empty cells with diamonds, tweens drawn with their easing, property rows
  under an opened layer (effect keys, drawing keys), colour labels, solo, multi-key pick, retime and stretch.
- **Clean** (`prefs.cleanTimeline`, command `view.cleanTimeline`): one plain block per drawing.

Where things live:

- `TimelinePanel.tsx` = `Header.tsx` (counter, fps, holds, onion skin, play range, light table chip, an overflow menu
  for what doesn't fit) + `TimelineBody` in `Grid.tsx` (ruler, markers and clips rows, playhead, drags, key picking,
  context menus, the tween offer).
- `Layers.tsx` (layer list), `Detail.tsx` (detailed rows and easing curves), `Menu.tsx` (floating menus),
  `layout.ts` (row layout for both looks), `view.ts` (look and layout hooks), `state.ts` (timeline-only UI: cell width,
  open layers, picked keys; no undo), `geometry.ts` (pixel and frame maths).
- `edit-core.ts` is the pure document edits (new key, duplicate, clear, insert and remove frames, exposure, move and
  resize cels); `ops.ts` wraps them as undo steps that say why they can't run. `tracks.ts` and `keys.ts` handle
  property rows and moving, scaling and deleting picked keys. A symbol's property key (`p:` ref) is one row's value on a
  drawing key: `propKeys.ts` moves it alone (the key it leaves takes the earlier value, a landing frame inside a hold or
  tween gets a drawing key cut out). Drawing (`c:`) and effect (`e:`) keys are as before.
- `playback.ts`: one loop driven by `ui.playing`; the frame comes from the clock, not by counting. Plays the picked
  clip, the play range (`inout.ts`, `range.ts`) or everything, looping or ping-pong. Any document change stops it.
- `tweenOffer.ts`: clicking between two keys can offer a classic or shape tween inline.
- `commands.ts`, `keyCommands.ts`, `choices.ts` (remembered answers about new keys and holds), `help.ts`.

## Exports

`src/export/`. The Export dialog (`ExportDialog.tsx`, opened lazily through `open.ts`) and "Export again" both call
`exportDocument` (`exporter.ts`), which asks for a file or folder and then runs the export.

- `plan.ts` (pure): range, size and name; limits 8192 px per side, 5000 frames, 16384 px sheets.
- `run.ts` `runExport`: draws each frame with the shared renderer (`draw.ts`) and hands it to the format's writer.
- `capabilities.ts`: what this machine can encode (WebCodecs through mediabunny: H.264 for MP4; AV1, VP9 or VP8 for
  WebM, transparency only with VP9 and VP8).
- `carries.ts` + `CarryNotes.tsx`: a table of what each format keeps (text, particles, tint, blend, effects, clipping,
  masks, folders, bones, gradient alpha) as kept, shapes, picture or lost; `carryWarnings` tells the person before
  they export. `LayeredNotes.tsx` does the same for the layered formats.

Writers:

- **MP4 / WebM** (`run.ts`): mediabunny. MP4 frames go through `yuv.ts`; sound from `src/audio/export.ts`, with AAC
  made by FFmpeg on the desktop when needed (`src/main/media.ts`).
- **GIF** (`gif.ts`, gifenc, one palette), **APNG** (`apng.ts`), **PNG** and **PNG sequence** (zip).
- **Sprite sheet** (`sheet.ts` trim and dedupe, `pack.ts` max-rects, `engines.ts` data files for Godot, Unity, Phaser,
  PixiJS, CSS and JSON, picked in `EnginePicker.tsx`). Godot gets `.tres`/`.tscn` and the clip flow.
- **SVG** (`svg.ts`, `svg-extra.ts`, `svg-look.ts`) and **animated SVG** (`svg-anim.ts`, CSS keyframes).
- **Lottie** (`lottie.ts`, symbols as precomps; `sprites.ts` for text and particles).
- **PDF and .ai** (`pdf.ts`, one page per frame, layers as optional content).
- **PSD** (`psd.ts`, `psd-layers.ts`, `layered.ts`, `layered-run.ts`): one layer per Frameling layer, folders as groups (nested folders as nested groups).
- **ProRes** (`prores.ts`): desktop only, streams frames to FFmpeg (`src/main/video.ts`).
- **Interactives `.flplay`** (`playable.ts`), described in `docs/format.md`.
- **Godot add-on** (`godot-addon.ts`, zips `godot/addons/frameling_importer`) and **Godot bones** (`godot-bones-scope.ts` the parts,
  nested symbol rigs and layer looks; `godot-bones.ts` the scene text with Camera2D and Parallax2D;
  `godot-bones-run.ts` draws the pictures, baking effects: Skeleton2D scene with parts).
- Plugin exports: `src/plugins/export.ts`. Per-artboard export: `src/artboards/export.ts`. Tilesets:
  `src/tiles/export.ts`.

`kitchenSink.ts` builds a document that uses every feature, for tests, `scripts/e2e/export.cjs` and perf.

## io

`src/io/`:

- `file.ts`: read, validate and write `.frameling` (see `docs/format.md`).
- `document.ts`: open, save, Save As (new doc id for the copy), "Save changes?". `registerOpener` lets other areas
  claim file types (`.flplay` does) and `registerSaveHook` lets them act on save (versions, Interactives).
- `autosave.ts`: autosaves every 60 s on the desktop, 15 s on the web, and when the window is hidden; opens the launch
  file; offers recovery. `recovery.ts` holds what was found; `RecoverDialog.tsx` lists put-aside work.
- `versions.ts`, `version-rules.ts`, `VersionsDialog.tsx`: version history, a copy at most every 10 minutes while the document changes, thinned
  out (all within an hour, hourly for a day, daily for 14 days, at most 60 automatic and 400 MB). Restore or open as a
  copy.
- `ioClient.ts`, `ioWorker.ts`, `ioJobs.ts`, `workerPool.ts`: worker threads (a bundled module worker, up to 4, let go after 20 s idle)
  that zip a save (`saveFileAsync`) and decode the pictures of a big pixel document in parallel (`loadFileAsync`, used
  by `loadBytes`). Without a worker (Node tests, a page that cannot start one) or when one fails, the same code runs
  on the calling thread, so nothing depends on them. Autosave and versions (`saveFileAsync(..., { reuse: true })`) also keep
  each vector drawing's `doc.json` text, already UTF-8 encoded, in a `WeakMap` by drawing object (`file.ts`), relying on
  a drawing never being changed in place once it is in the document (edits replace it). Save and Save As never reuse.
  Under test and with `?debug` (not `&nofreeze`) immer auto-freezes committed documents and the kept drawings are frozen,
  so a write in place throws where it happens.
- `png.ts` (own PNG codec), `thumb.ts`, `RecentDialog.tsx`, `notify.ts` (toasts from io and export).

**The user library** (desktop: `library/<kind>/` in the user data folder, `src/main/library.ts`; web: IndexedDB):
`plugins/*.zip`, `templates/*.frameling`, `versions/*.frameling`, `versions-index/*.json`. Also in the user data
folder: `files.json`, `autosave/`, `linked-playables.json`.

## Interactives round trip

`src/interactives/`: `link.ts` reads the `source.frameling` out of a `.flplay` and remembers the link per document id
(`localStorage` `frameling.playableLinks.v1`); `roundtrip.ts` opens it and, on save, re-exports into the same package
(as well as, or instead of, a `.frameling`). Commands in `index.ts`.

## Templates

`src/templates/`: 21 built-in templates made in code (`index.ts`, helpers in `build.ts`, per-template setup in
`setup.ts`). People's own templates are `.frameling` files with a `template.json` (`community.ts`) in the library;
`user.ts` `registerTemplateSource` lists sources for the welcome sheet.

## Plugins

`src/plugins/`. Each plugin runs in a hidden `sandbox="allow-scripts"` iframe (`public/plugin-host.html`, or
`plugin-host-net.html` with network) whose CSP blocks the network, and inside it a worker. `prelude.ts` builds the
`frameling` API over a `MessageChannel` and removes network and storage APIs. `runtime.ts` checks each call against
the plugin's permissions and limits; `ops.ts` applies edits as one undo step; `ui-schema.ts` cleans panel
descriptions; `manager.ts` installs, enables and removes; approvals live in `localStorage` `frameling.plugins.v1`. The
API and threat model are in `docs/plugins.md`; the manifest is in `docs/format.md`.

## Other feature folders

- `src/audio/`: sound clips on the timeline, decode, waveforms, playback that follows the playhead, offline mix.
- `src/lipsync/`: guesses mouth shapes from sound (loudness and spectrum, no AI) and keys a mouth symbol.
- `src/flow/`: the clip flow graph and its panel.
- `src/pixel/`: pixel tools, palettes and palette files, transforms, the pixel bar and preview panel.
- `src/select/`: pixel selections (box, lasso, wand, masks, floating selection) and the vector lasso.
- `src/rig/`, `src/symbols/`, `src/text/`, `src/particles/`, `src/camera/`, `src/tiles/`, `src/effects/`,
  `src/artboards/`, `src/geometry/` (fill, merge, morph, trace), `src/tools/`: as named.

## Quests and onboarding

- **Onboarding** (`src/ui/onboarding/`): `flow.ts` is a pure reducer through hello, what you want to make, themes,
  preferences, a name, done. `planFor` turns interests into a workspace, template, first quest and help. Opens once on
  first run (`maybeOnboard`), never under `?debug`.
- **Quests** (`src/quests/`): `engine.ts` is a `QuestEngine` with no React or DOM (dependencies passed in), progress in
  `localStorage` `frameling.quests.v1`. `runtime.ts` wires it to the store, commands, clock and DOM; `hook.ts` wraps
  command runs while a quest is active. Quests are in `library.ts` and each feature's `quest.ts`; `predicates.ts`
  checks the document, `probe.ts` reads what isn't in the store, `actions.ts` does "Show me how" through normal
  commands. `QuestLayer.tsx` mounts the spotlight, quest bar and celebration in their own React root.
  Start-up only has `registry.ts`, `catalog.ts` (a quest's id, title, summary, icon, badge, group and needs, the
  `QuestInfo` the welcome card, onboarding and the panel list read) and the saved progress (`saved.ts`). The steps and
  checks (`library.ts`), the engine, its runtime and the layer are one lazy chunk, `boot.ts`, brought in by
  `startQuest` (and the resume command, and the Quests panel) through `loadQuests()`. Read a quest's steps with
  `getFullQuest(id)` (undefined until then); `getQuest(id)` is the catalog entry or the whole quest.
  `test/quests/catalog.test.ts` fails when the catalog and the library disagree, so change both together.

## Quill, the mascot

- `src/ui/mascot/timing.ts` (pure sheet maths), `runtime.ts` (loads `mascot/mascot.json` and `.png`, one shared timer
  moves every Quill on screen by setting `background-position`, an idle clock sends him to sleep), `Quill.tsx`
  (`Quill`, `QuillSays`, `QuillEmpty`), `scripts.ts` (little performances), `goodbye.ts` (turning him off and on).
- `lines.json` holds everything he says; `lines.ts` reads it (`line`, `lines`, `lineParts`) with typed ids.
- `npm run build:mascot` (`scripts/build-mascot.mjs`, helpers in `scripts/mascot/`) turns
  `brand/mascot/mascot.frameling` into the sheet and `mascot-icon.frameling` into the app icons. See the README.

## Help

Topics are registered next to each feature (`src/*/help.ts`) and in `src/ui/helpTopics.ts`. `src/ui/HelpBrowser.tsx`
is both the Help panel and the help window. `src/ui/help/`: `search.ts` (typo-tolerant search), `context.ts` (what F1
opens: the element under the pointer or focused, via `data-help` or `data-command`), `markdown.tsx`, `media.tsx`
(pictures and H.264 clips from `public/help/`), `audit.ts` (the help audit, see `docs/testing.md`).

## Themes, preferences, keyboard, menus

- **Preferences** (`src/ui/prefs.ts`, `localStorage` `frameling.prefs.v1`): theme, look (cosy or crisp), sounds,
  reduced motion, welcome, tips, Quill, right side style, units, keymap and keymap set, clean timeline, and more.
  `applyPrefs` writes the theme's CSS variables and `data-theme`, `data-look`, `data-motion` on `<html>`.
  `src/ui/PrefsModal.tsx` has the pages (general, themes, behaviour, keyboard, workspaces, plugins).
- **Themes** (`src/ui/themes/`): built-in themes (`builtIn.ts`), tokens and derived tokens (`tokens.ts`), custom themes
  and the theme file (`model.ts`, `library.ts`), contrast checks and fixes (`contrast.ts`), the editor.
- **Keyboard** (`src/ui/keyboard.ts`): one listener; in a field or with an overlay open only `global` commands fire.
  `src/ui/keys.ts` parses `Mod+Shift+Z` combos and layers keys: command defaults, then the chosen set
  (`src/ui/keymapSets.ts`: Frameling, Flash style, Pixel), then the person's own.
- **Command palette** (`src/ui/palette.ts`, `CommandPalette.tsx`): commands and help topics, fuzzy matched
  (`match.ts`); `runCommand` is the one runner menus and keys use too.
- **Menus** (`src/ui/menus.ts`, `MenuBar.tsx`): lists of command ids per menu; commands of a menu's category that
  aren't listed are added at the bottom.
- **Toasts** (`src/ui/toast.ts`, `ToastView.tsx`) and **tooltips** (`src/ui/Tooltips.tsx`: one layer for the whole
  app, built from `data-command`, `data-tip` or `title`).

## Accessibility helpers

- `src/ui/roving.ts`: one document listener gives arrow, Home and End keys to `radiogroup`, `listbox` and `menu`
  roles. It skips events a component already handled.
- `src/ui/popover.ts` `usePopover(ref, onClose)`: focus in on open, Escape closes (before the canvas sees it), focus
  back afterwards.
- Checked by `scripts/a11y.cjs` and `test/a11y/`.

## Sounds

`src/ui/sounds/`: every cue is synthesised from notes (`synth.ts`, no sample files): step, celebrate, exported,
refused, goodbye, nothing to undo, tick. `index.ts` `playCue` caches each as an `AudioBuffer`, honours the sounds
preference and rate-limits.
