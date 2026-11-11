# Effects and compositing (phase 5, first part)

Kept light on purpose: it isn't After Effects. The first part covers blend modes, the per-layer effects stack,
clipping, masks and layer folders. The second part adds particles, text with text animators, and PSD / PDF / `.ai` /
ProRes export (sections near the end). Expressions and shader effects come later; how they fit is at the bottom.

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

- SVG has no Pixelate, so the still and moving SVG leave it out (the Export window says so first).
- Folders don't nest. Move up / Move down step a layer into a folder at its edge and out of it again; any plain
  reorder keeps folders in one piece (`tidyFolders`), so there are never ghost copies of a folder.
- Symbol instances get the look of the layer they sit on (blend, effects, masks, folders), in the editor and in
  exports. Layers inside a symbol keep only their opacity for now; their own blend modes and effects are ignored.
- The onion skin shows drawings plain, without effects.
- In the editor, effect pictures are canvas-sized and keyed by the stage's position, so panning recomputes them (on
  the GPU, quick for blur and colour adjust, slower for a wide outline). Stage-sized effect buffers would fix it.
- `warm()` (pre-rasterising before playback) warms layer bitmaps, not effect pictures; the first pass over an
  animated effect computes it live.

## Particles (second part)

An emitter is a shape in a vector drawing (`type: 'particles'`, `src/particles`), not a layer kind: it moves, scales
and turns with the Select tool, sits on any vector layer, and gets the layer's blend modes, effects, masks and folders
for free. "Add particles" asks once (choice `particles.where`) whether it goes on a layer of its own (the default).

- **No simulation.** Particle n is born at `n / rate` (burst ones at 0) and its traits come from a hash of
  (seed, n, trait). Where it is at age `a` is a closed formula: constant pull (gravity, wind) with linear drag,
  `x = v0 (1 - e^-ka) / k + g / k (a - (1 - e^-ka) / k)`, plus a sine wander. So frame 500 costs the same as frame 1,
  scrubbing backwards needs no cache to be exact, and every export matches the canvas. The alive set at time T is the
  range of n born in `[T - maxLife, T]`, capped (`max`, hard cap 20000).
- **Posing.** `poseAt` (core/symbols.ts) poses moving shapes per frame (`poseMovingShape`): an emitter becomes a
  `PosedParticles` with its time, and the particle list is worked out once per posed object. Posed drawings are cached
  per cel and frame like instances, so the canvas's bitmap cache and the effect cache work unchanged.
- **Sprites:** dot, soft puff (a cached radial sprite per colour), square, star, twinkle, streak (along the velocity),
  paper bit (flips), snowflake, or any symbol (its own animation plays from each particle's birth).
- **Presets** (`PARTICLE_PRESETS`): Sparkle burst, Smoke, Rain, Snow, Confetti, Dust. Particles panel: preset cards,
  then plain-words settings in folding sections. A/B of sliders against number boxes: `brand/ab/particles/`.

## Text (second part)

Text is a shape too (`type: 'text'`, `src/text`): words, font, size, weight, colour, alignment, spacing, a transform,
and optional `animators`. Nunito and Inter ship with the app; the desktop app also lists common fonts found on the
computer (probed by measuring). Layout measures prefix widths with the canvas, so kerning is kept (`layoutText`).

- **Typing on the canvas:** the Text tool (T) puts a see-through textarea over the text with the same font, size and
  transform; it holds the caret and selection while the canvas draws the real text. Nothing is added until the first
  letter. Double-click text with Select or Text to type into it.
- **Text animators** (Fade, Slide, Grow, Spin, Typewriter, Wave): per letter, word or line, with order (forward,
  backward, middle, shuffled by seed), start, frames each, stagger and easing. The ordering, seeded shuffle and window
  maths are ported from Interactives' `textmod.ts`, cut down to frame-based presets. Animated text is posed per frame
  like particles; still text is never re-posed.
- **Convert to shapes** (Ctrl+Shift+O) draws the text large, traces it (`traceMask` + `fitClosedLoop`) and makes one
  even-odd fill. It works with any font, including ones only on this computer. PDF and `.ai` use the same outlines.
- **SVG** keeps text as `<text>` (per glyph when animated); particles become circles, rects and polygons, and symbol
  particles draw the symbol (written once as a `<g id="spriteN">`, placed per particle with `<use>`).

## PSD, PDF, Illustrator and ProRes export (second part)

- **PSD** (`export/psd.ts`, own writer, RLE): one PSD layer per Frameling layer (effects baked into its pixels via
  the compositor, blend and opacity kept as PSD settings), names (plus Unicode `luni`), visibility, clipping, folders as
  groups (pass-through when plain), mask layers in a folder as the group's layer mask, and the merged picture.
  Structure: `export/layered.ts` `layeredPlan`, records in `export/psd-layers.ts`. Checked with ag-psd (dev dependency,
  tests only) and ImageMagick.
  - A folder with effects becomes a group (its own opacity and blend kept as group settings) holding one baked layer,
    `<Folder> (with effects)`, drawn by the compositor with the folder's masks and effects but not its own opacity or
    blend, plus the original layers hidden underneath for editing.
  - A visible mask layer on the stage wraps everything under it in an isolated (normal) group, `Masked by <mask>`, with
    the mask as the group's layer mask (hide inverted); the mask layer stays inside, hidden. Later masks wrap earlier
    groups. A layer straight after a mask isn't clipped.
  - Single-layer pictures (PSD layers, PDF layers with effects) keep the bones layer (`soloDoc`), so layers bent on
    bones come out bent. Checked by compositing the read-back PSD against the merged picture (worst channel difference
    1.1/255).
- **PDF** (`export/pdf.ts`, own writer): one page per frame, shapes as vector paths (brush strokes as their outline,
  text as traced outlines, particles as primitives), each layer a PDF optional content group, layer and folder opacity
  and blend modes as transparency groups (add maps to Screen). Pixel and tile layers, layers with effects, clipped
  sets and masked sets become pictures with an SMask at twice the page size (`flatPlan`). Checked with Poppler and
  Ghostscript. Vector layers bent on a mesh (and layers or symbol copies holding a bent layer) become pictures through
  the renderer (`needsPicture`/`drawingHasMesh` in `layered.ts`), so they come out bent; layers that only follow a bone
  stay vector.
- **`.ai`**: the same PDF with the `.ai` extension. Illustrator opens PDF-compatible files as plain artwork (every
  path editable, PDF layers as layers). There is no `AIPrivateData`, so Illustrator asks to save as a full .ai the first
  time. Checked with Poppler (pdfinfo, pdftoppm) and Ghostscript; not yet opened in a real Illustrator, Inkscape or
  Affinity, which all import PDF.
- **ProRes** (`export/prores.ts`, `main/video.ts`): desktop only. The page draws each frame and streams raw RGBA over
  IPC to FFmpeg (`prores_ks`, profile 4444, `yuva444p10le` when see-through), which writes the picked file. FFmpeg is
  found on PATH, the usual install places, or `FRAMELING_FFMPEG`; without it the card says why in plain words.

Known gaps in this part: a mask layer inside a folder becomes a group mask over the whole folder in PSD (the canvas
masks only the layers under it); baked PSD folder pictures don't follow later edits to the hidden originals.

## Vector exports: what carries over

`export/carries.ts` is the one table of what each format keeps (`CARRY`), and `carryWarnings(doc, format)` lists what in
this document will become pictures or be left out. The Export window shows both under "What carries over"
(`CarryNotes.tsx`). Keep the table in step with the writers.

- **Lottie** (`export/lottie.ts`) follows the compositing plan (`buildPlan`): blend modes as `bm` (add becomes screen),
  opacity, masks and clipping as alpha track mattes (the matte a precomp right above a precomp of what it cuts), folders
  that isolate as precomps. Every precomp over the stage carries its own camera nulls under an offset null. Soften and
  Shadow are Lottie's Gaussian Blur (blurriness = radius / 0.3) and Drop Shadow (softness x2, direction from x/y), which
  lottie-web's SVG renderer, the mobile players and Skottie play; lottie-web's canvas renderer ignores effects. Other
  effects bake the layer or folder (drawn by `renderFrame` without its own blend and opacity) into a PNG per different
  frame, cropped, at 2x. Symbol tint recolours the precomp (a precomp per symbol and tint; the sum is linear, so
  recolouring each shape equals washing the group). Text is traced once per letter, font and size (`sprites.ts`
  `glyphOutline`, the Convert to shapes tracer) and each letter is a group with its own transform, so text animators
  are transform keys. Picked over Lottie text layers because those need the font in every player and players differ a
  lot in text support; traced letters look the same everywhere. Particles are a group per particle (static sprite path
  at 10 units, transform keyed per frame, faded to 0 outside its life), symbol particles a precomp layer per particle.
  Sprite keys that a straight line already hits within a small tolerance are dropped (`smoothTrack`).
- **SVG and moving SVG** (`export/svg-look.ts`, shared): the same plan, with `mix-blend-mode`, group opacity, effects as
  SVG filters (blur, shadow, colour matrices, glow, outline from the same ring of offsets the canvas uses), masks as
  `<mask>` (luminance, with the content forced white or black by a filter), clipping as a mask from `<use>` of the base,
  and tint as an `atop` flood filter. Effect settings that change are SMIL `<animate>` switching per frame.
- `scripts/e2e/vector-check.cjs` checks all of it against `renderFrame` in Chromium, now also through lottie-web's SVG
  renderer (effects only play there; a Lottie frame passes when either renderer matches).

## Later, and how it fits

- **Expressions**: an optional `expr` next to an effect key's number (and later any animatable number), evaluated per
  frame by a small sandboxed evaluator like Interactives' `expr.ts`. The keys model above stays the source of truth.
- **Shader effects**: Interactives' shader layer (`shader.ts`, shared WebGL context, presets) could become a seventh
  effect kind, run on the layer buffer. Needs a fallback for exports without WebGL.
