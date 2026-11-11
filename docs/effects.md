# Effects and compositing (phase 5, first part)

Kept light on purpose: it isn't After Effects. This part covers blend modes, the per-layer effects stack, clipping,
masks and layer folders. Particles, text animators, expressions and PSD / PDF / `.ai` / ProRes export come later; how
each fits is at the bottom.

## What's in the document

All optional, so older files open unchanged and files without any of it save exactly as before.

| Where | Field | Meaning |
|---|---|---|
| layer | `blend` | Blend mode (missing = normal). Canvas `globalCompositeOperation` names, plus `add` for `lighter`. |
| layer | `effects` | Effect stack, applied first to last. Each `{ id, kind, on?, values, keys? }`. |
| layer | `clipToBelow` | Clip to the layer below (clipping mask). |
| layer | `mask` | `'show'` or `'hide'`: a mask layer, never drawn itself. |
| layer | `folder` | The id of the folder it sits in. |
| doc | `folders` | `{ id: { id, name, visible, opacity, blend?, effects? } }`. |

`src/effects/io.ts` reads all of it back checked: unknown blend modes, effect kinds and bad numbers are dropped, and
layers pointing at a missing folder leave it.

### Animated effect values

An effect with `keys` is animated. Each key is `{ frame, values }` holding numbers only; between two keys a number
changes evenly, before the first and after the last it holds. Colours stay in `values` and don't animate. Moving a
slider on an animated effect writes a key on the current frame (`edit.setEffectValue`). That was the simplest model
that fits: one list per effect, no curves. Easing can come later as an optional per-key `ease` field without breaking
anything.

## The rules

Within a level (the stage, or one folder), bottom to top (`src/effects/plan.ts`):

- A layer or folder is drawn onto what's under it with its blend mode and opacity.
- Clipped layers sit on the nearest unclipped layer or folder under them and only show where it has drawing. Hiding
  the base hides them. With no base under them they draw as usual.
- A mask layer cuts out everything under it in the same level. At the stage level that's every layer under it, never
  the stage colour.
- Folders are one level deep. A folder with normal blend, full opacity, no effects and no masks inside is "pass
  through" (its layers draw straight onto the stage); otherwise it's drawn as one picture first.

Making a mask from the Effects menu or panel puts the mask and the layer under it (or every layer under it, asked the
first time and remembered: choice `effects.maskScope`) into a folder, so a new mask never reaches further than meant.

## How it renders

One compositor (`src/effects/composite.ts`) used by both:

- the single renderer, `renderFrame` in `src/core/render.ts`, so thumbnails, the eyedropper and every export agree;
- the editor canvas, `FramePainter` in `src/canvas/pipeline.ts`, through `src/effects/stage.ts`, which feeds it the
  painter's cached layer bitmaps.

A document with none of this takes the old code path unchanged (`needsCompositor`). Plain layers inside a composited
frame are still painted straight onto the target; only layers with a look get a buffer. Buffers are the size of the
target canvas and come from a pool, so a frame allocates nothing new once warm.

Effects (`src/effects/apply.ts`), all in canvas pixels with settings scaled from document pixels:

- Soften, Colour adjust and Shadow use the canvas `filter` (`blur()`, `hue-rotate() saturate() brightness() contrast()`,
  `drop-shadow()`), which Chromium does on the GPU.
- Glow is a blurred copy tinted with `source-in`, drawn under the layer, stacked when strength is over 1.
- Outline stamps the layer at rings of offsets out to the width, tints the result and puts the layer on top.
- Pixelate shrinks with smoothing and grows back without, with squares lined up on the stage corner.

Finished effect pictures are cached per layer content (the drawing object), settings and transform
(`EffectCache`, LRU inside a pixel budget). Holding a drawing with a glow over many frames blurs it once; constant
effects cost a blit while playing. The editor drops to uncached while zooming.

The editor paints the stage colour into the canvas for composited frames (normally it's the element behind), so blend
modes mix with it the same way exports do.

## Where it shows

- **Effects panel** (dockable, right side by default): opacity, blend picker with plain words and the industry term,
  clip and mask, the stack with on/off, animate, reorder, reset and remove, and Reset all. A/B of how effects are
  added: `brand/ab/effects-panel/`.
- **Effects menu** and the command palette: add each effect, clip (Ctrl+Alt+G), use as mask, put in a folder, take
  out of a folder, reset. Every blend mode is a palette command too (`effects.blend.*`).
- **Timeline**: folder header rows with fold, eye and menu; layers in a folder indented with a purple rule; one small
  mark per layer (mask, clipped, or blend/effects) with the details in its tooltip. Dragging a layer next to a layer
  in a folder joins it, next to one outside leaves it.
- **Help**: topics `effects`, `blend-modes`, `masks`, `layer-folders` (section Effects).

## Checks

- `test/effects/model.test.ts`: catalogue, keys, plan, edits, rows, file round trip.
- `scripts/e2e/effects.cjs`: real Chromium canvas pixel checks for every blend family, clip, masks (show, hide, kept
  in their folder), folder opacity, hidden folders, each effect and an animated blur.
  `npm run build && xvfb-run -a npx electron scripts/e2e/effects.cjs`.

## Known gaps

- SVG export keeps blend modes (`mix-blend-mode`) and leaves mask layers out, but drops effects, clipping and masking.
- Folders don't nest. Moving a layer out of its folder with Move up / Move down (rather than dragging) leaves it in
  the folder as a second run, which draws and shows as a second copy of the folder. Dragging does the right thing.
- The onion skin shows drawings plain, without effects.
- In the editor, effect pictures are canvas-sized and keyed by the stage's position, so panning recomputes them (on
  the GPU, quick for blur and colour adjust, slower for a wide outline). Stage-sized effect buffers would fix it.
- `warm()` (pre-rasterising before playback) warms layer bitmaps, not effect pictures; the first pass over an
  animated effect computes it live.

## Later, and how it fits

- **Particles**: a new layer kind (`kind: 'particles'`) whose drawing is an emitter description; the compositor
  already takes a per-layer paint callback, so it slots in as one more `paint` and gets blend modes, effects, masks
  and folders for free. Simulation must be deterministic per frame (seeded) so exports and scrubbing agree.
- **Text animators**: Interactives' text modifiers (`interactives-player/src/textmod.ts`, pure: unit ranges, shapes,
  per-piece styles) port almost as they are once Frameling has a text shape. Per-letter offsets, rotation, scale,
  opacity and blur map onto the renderer; the weights are already frame-based.
- **Expressions**: an optional `expr` next to an effect key's number (and later any animatable number), evaluated per
  frame by a small sandboxed evaluator like Interactives' `expr.ts`. The keys model above stays the source of truth.
- **Shader effects**: Interactives' shader layer (`shader.ts`, shared WebGL context, presets) could become a seventh
  effect kind, run on the layer buffer. Needs a fallback for exports without WebGL.
- **PSD / PDF / .ai export**: blend modes map one to one onto PSD; folders map to PSD groups, clipping to PSD
  clipping, mask layers to group masks (rasterised). Effects would be baked into the layer's pixels. PDF and `.ai`
  can carry blend modes and soft masks natively; effects get rasterised. All of it reads the same plan
  (`buildPlan`), so the structure is decided in one place.
- **ProRes**: an export container question, not a compositing one; every frame already comes out of `renderFrame`.
