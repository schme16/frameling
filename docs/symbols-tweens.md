# Symbols and tweens: how they're built

Phase 3, core part. What's in the format, how it renders, and where the follow-ups (shape tweens, camera, the state
graph, Lottie and animated SVG) slot in.

## Format (all optional, old files open unchanged)

- `Doc.symbols: Record<id, SymbolDef>`. A symbol is `{ name, layers, length, origin }`. Its layers are ordinary
  layers whose cels point into the shared `Doc.drawings`, so every tool, the timeline and the file code work on them
  unchanged. Symbol space is stage space as it was when the symbol was made, and `origin` is the registration point.
- `InstanceShape` (`type: 'instance'`) is a fifth shape kind, living in vector drawings beside strokes and paths. It
  holds `symbolId`, a decomposed `Transform2D` (x, y, scaleX, scaleY, rotation, skew; degrees), `opacity`, an
  optional `tint {color, amount}`, `play` ('loop' | 'once' | 'single') and `firstFrame`. Being a shape means select,
  move, scale, rotate, arrange, copy and paste all work on it. Geometry code (`canvas/geometry.ts`) composes a
  matrix with it and decomposes the result back, so the stored values stay readable and tweenable.
- `Cel.tween: { kind?: 'classic', ease, spin?, path? }`: in-betweens from this key to the next one on the layer,
  which must start where this one ends (otherwise it's shown dashed and does nothing). `ease` is a preset name (the
  same names Interactives uses) or a cubic bezier. `path` is a motion path in the layer's space with `orient`.
- `Doc.editing: EditFrame[]`: set only while a symbol is open. Never saved (`rootDoc` strips it, `saveFile` calls it).

## Editing in place

Opening a symbol swaps its layers into `doc.layers` (and its length into `doc.length`), pushing what was there onto
`doc.editing`. That's one undo step, so history stays consistent: every later patch addresses `layers` as it is at
that moment. Everything else in the app keeps working on `doc.layers` without knowing symbols exist.

- `rootDoc(doc)` rebuilds the document as saved. Save, autosave thumbnails and every export go through it
  (`sceneOf` also gives the stage's playhead).
- `symbolContent(doc, id)` is the one way to read a symbol's layers: an open symbol's live layers are in
  `doc.layers` (or the frame above), not in `doc.symbols[id].layers`, which is emptied while it's open.
- The canvas paints the scene dimmed underneath (`canvas/backdrop.ts`) through the inverse of the instance matrices,
  so the symbol's content lines up with where its instance sits while tools keep working in symbol space.
- Limitation: the canvas clips to the stage rectangle, so symbol content off the stage can't be seen while it's open
  (a toast says so). Symbols made with F8 are always on stage.

## Rendering

`poseAt(doc, layer, frame)` (`core/symbols.ts`) is what a layer shows: plain drawings come back as the same object
(so the canvas bitmap cache is untouched), drawings with instances come back as a synthesised drawing whose
instances carry `posed: { matrix, layers }`, recursively. Poses are memoised per world (drawings, symbols, open
layers) then per cel and a key of the tween progress and each instance's inner frame, so a held symbol frame or a
replayed tween frame is the same object and blits from the bitmap cache. `drawShape` draws posed instances with a
per-depth buffer for group opacity and tint. The canvas, onion skin, thumbnails, GIF, video, sheets and SVG all draw
through this, so they can't disagree. SVG writes instances as `<g transform="matrix(...)">`, tint as a small filter.

## Phase 3 follow-ups (built)

- **Shape tweens** (`core/shape-tween.ts`): `Tween.kind = 'shape'` with optional `hints: ShapeHint[]` (`{id, from, to}`).
  `poseAt` has a branch (`morphAt`) that blends the key's drawing into the next key's. Shapes pair by order
  (instances with instances, in order; other shapes with other shapes); each pair is planned once (WeakMap on the two
  drawings plus a hint key) and the in-betweens just blend. Outlines become rings of cubic segments; the side with
  fewer segments has its longest ones split until counts match, then the start point and direction with the least
  travel are picked (both rings centred first). Hints split the outline at the nearest point on each key and the
  stretches between hints are matched on their own; hints that cross the others are dropped. Pieces (subpaths)
  pair by nearest middle, spares shrink to (or grow from) their middle. Strokes morph point by point after even
  resampling; a stroke meeting a fill morphs as its outline. Fills, line colours and widths, opacity blend; a missing
  fill fades via alpha. Instances in a morph use the classic `tweenInstance`.
  Text and particles come along: text pairs with text and emitters with emitters, each in drawing order (apart from
  outlines and symbol copies). Transform, size, colour and opacity blend with the same maths as symbol copies
  (`tweenTransform`, so extra spins and motion paths apply). An unpaired text or emitter fades out (or in) without
  shrinking. Text with different words or font crossfades as two shapes; weight, line height and letter spacing blend;
  italic, alignment and animators switch halfway. Emitters blend position, spread, direction, speed, gravity, wind,
  drag, wobble, size, colours and opacity, but keep the start key's count, life, seed, sprite and emitter shape so
  particles don't pop, and their clock keeps running from the start key. `morphNotes` gives the panel's plain-words
  notes on what can't blend.
- **Camera** (`core/camera.ts`): `LayerKind 'camera'` with `CameraDrawing { view: {x, y, zoom, rotation} }` keys, so
  the timeline, holds, key copies and `Tween` (easing, spin, path) work unchanged. The first visible camera layer on
  the stage is in charge (never one in a symbol). `cameraMatrix(doc, view, factor)` is stage to output space;
  `BaseLayer.depth` gives `parallaxFactor = 1 / (1 + depth)`, which scales pan and zoom (zoom as `zoom ^ factor`), not
  the turn. `renderFrame` applies it per layer (`opts.camera: false` for the editor's own uses), so every export and
  thumbnail goes through it. The canvas looks through it when asked (`viewSettings.throughCamera`, or while playing):
  the painter draws camera-moved layers directly with the matrix, overlays and pointer input go through it too.
  Otherwise it draws the camera frame and a faded pasteboard of what's off stage. `setCameraKey` splits a hold to
  make a key, keeping the in-betweens going.
- **Clip flow** (`core/flow.ts`): `Doc.flow = { start?, transitions: {id, from, to, when: 'end' | 'trigger', trigger?}[],
  positions? }`; states are the clips. Exports write it by export clip name (`flowManifest`, `exportClipNames`):
  the .flplay manifest gets an optional `flow` field, the Godot export adds `<base>-flow.json` and `<base>_flow.gd`
  (an AnimatedSprite2D script: start clip, on-end transitions, `fire(trigger)`), checked in a real Godot by
  `test/export/godot-e2e.test.ts`. Frameling's own play button ignores the flow; the panel's Try it follows it.
- **Lottie and moving SVG** (`export/lottie.ts`, `export/svg-anim.ts`): symbols as precomps with time remap, classic
  tweens as eased keys (bezier handles from `bezierFor`; springy, bouncy and paths baked per frame), shape tweens as
  per-frame path keys, the camera as null parents per depth, pixel layers as PNG images. Moving SVG uses CSS
  keyframes (SMIL can't animate a full matrix). `scripts/e2e/vector-check.cjs` renders both in Chromium (lottie-web
  canvas renderer, SVG seeked through the Web Animations API) and compares with `renderFrame`.

## Not done yet

- On an in-between frame the selection box shows the key's transform, not the in-between (the panel says so).
  Moving it there changes the start key.
- Instances in a merge-mode layer never merge (they're treated like groups), and the paint bucket ignores them as
  walls.
- Off-stage drawing shows on the faded pasteboard only while a camera exists, and isn't cached (drawn directly).
