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
through this, so they can't disagree. SVG writes instances as `<g transform="matrix(...)">` (tint is left out there).

## Where the follow-ups fit

- **Shape tweens**: `Tween.kind = 'shape'`, with optional `hints: {from, to}[]`. `poseAt` already builds a fresh
  drawing per tween frame, so a shape tween only adds a branch there that morphs paths between the two keys'
  drawings (`geometry/morph.ts` exists). Nothing else changes.
- **Camera**: a new layer kind `'camera'` whose cels hold one instance-like transform (and depth for parallax) and
  tween with the same `Tween`. Rendering applies its inverse to the other layers. `tweenInstance` and the easing,
  spin and path code are reusable as they are.
- **State graph**: clips already exist on the stage. A graph of named states on a symbol (`SymbolDef.states?`, with
  transitions) maps onto instance `play`/`firstFrame` (single frame is a pose, loop is a clip). Interactives' input
  nodes would drive it.
- **Lottie and animated SVG**: symbols map to Lottie precomps and instance transforms to layer `ks`; classic tweens
  map to keyframes with `i`/`o` bezier handles (`bezierFor` gives the nearest cubic for every preset; bounce and
  springy need baking into extra keys). Motion paths map to Lottie's position `ti`/`to`, or get baked.
- **Unpack into layers (Interactives)**: an instance is a group with a matrix, so it maps to an Interactives
  `InstanceNode` / group with the same transform fields.

## Not done yet

- On an in-between frame the selection box shows the key's transform, not the in-between (the panel says so).
  Moving it there changes the start key.
- Instances in a merge-mode layer never merge (they're treated like groups), and the paint bucket ignores them as
  walls.
