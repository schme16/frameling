# Brush parity: the plan

This follows from `table.md`. It is a work list, not a design: each piece can be merged alone, and the order is the one I would build in. Sizes are rough: **small** is a few hours, **medium** a day or two, **large** several days. Risk is about breaking what works now.

## What is settled, and what is not

Settled by you:

1. Equal runs both ways. What pixels have and vectors lack (wet paint, dual tip, dynamics, imported Photoshop, Krita and Procreate brushes) comes to vectors. What vectors have and pixels lack (watercolour, bristles, along the line, edged, matte) comes to pixels.
2. A brush stays picked when you move between a pixel layer and a vector layer. It swaps mode: pixels on a pixel layer, vectors on a vector layer.

Still with you, and both of them change the panel that gets shared, so the shared panel should not be finished before they are answered (the mock-ups are in the `wip/brush-clarity` worktree, off unless `?debug` is on):

- **How Brush, Tip and Stick are arranged.** Parts folded under the brush, against three pickers one under the other as now.
- **What each picker's picture shows.** What the picker button shows, and Paper becoming a picker of its own.

A known model problem, which this plan fixes on the way: **a vector brush cannot keep its own paper.** The paper is the sheet's. `BrushTip` has `dry` (which stick) but no `paper`, and `src/tools/vectorStroke.ts:63` writes the sheet's paper into the stroke's Paper tooth effect when you draw. A pixel brush can keep its own: `DabBrush.grain.paper` is optional, and left out it follows the sheet. The effect already has a `paper` value of its own, so the fix is small (piece 8).

## Where the two panels live now

| | Vector Brush on a vector layer | Pixel brush on a pixel layer |
|---|---|---|
| Panel | `VectorBrushOptions` in `src/tools/options/BrushOptions.tsx` | `DabOptionsPanel` in `src/dab/Options.tsx` (Pixel brush), `src/soft/Options.tsx` (Soft paint), `src/dry/Options.tsx` (Chalk and charcoal), and `PixelBrushOptions` in `BrushOptions.tsx` for the plain Brush (B) on a pixel layer |
| Preview | `BrushPreview`, top of the panel | none |
| Picker row | `BrushPresetPicker` (titled) then `BrushPresetActions` below Size | `BrushPresetRow`, picker and actions together at the top |
| Tip, Stick, Paper | `src/brushes/TipOptions.tsx`, `src/dry/PaperGroup.tsx` | `Tip` buttons inside `Options.tsx`; `PaperSection`, `DynamicsSection`, `TextureSection`, `ColourSection` in `src/dab/DynamicsOptions.tsx` |
| Settings held in | `ui.brush` (`BrushSettings`, `src/core/format.ts`) | `getDab()` (`src/dab/settings.ts`), `getSoft()`, `getDry()`, and `getToolSettings().pixelBrush*` / `pixelStamp` for the plain Brush |
| Stroke drawn by | `src/tools/vectorStroke.ts`, `src/geometry/tip.ts` | `src/dab/stroke.ts` (`sessionStroke`), `src/soft/stroke.ts`, `src/dry/stroke.ts`, `src/tools/pixelStroke.ts` |
| Which list | `brushesOnSide('vector')` | `brushesOnSide('pixel')` |

What is already shared: `BrushPicker` and its panel (one component, `side` picks the list), the library and its save, share and import (`src/brushes/presets.ts`, one list holding both kinds, a preset has `brush` and an optional `pixel`), `PaperGroup`, `MirrorOptions`, `PenOptions` (Stabilizer), and the sample drawing code. Which side shows is decided by **the tool you are on** (`currentSide()`), not by the layer.

What one shared panel takes:

1. One component, `BrushToolOptions`, that reads the active layer's kind (`useActiveLayerKind`, already there) and renders one skeleton in one order: preview, Brush, Tip, Stick, Paper, Size, Save and Share, then folds. Each section asks the side for its controls. A control the side cannot honour is shown greyed with the reason, never left out (so the panels look the same and the test below can compare them).
2. One brush description both sides read for the panel (a "recipe": tip, size, spacing, and so on) with a per side adapter, so the panel code stops reaching into `ui.brush`, `getDab()`, `getSoft()` and `getDry()` directly. The adapters are `useBrushValue(id)` and `setBrushValue(id, v)`.
3. The three pixel tools (Pixel brush, Soft paint, Chalk and charcoal) and the plain Brush become engines chosen by the brush, not four different panels. The tools can stay in the toolbar and on their keys, all pointing at the one panel.
4. The two pending decisions decide the arrangement inside the skeleton. Everything else in the plan stands whichever way they go.

## How "the brush stays picked and swaps mode" could work

The two data models stay separate: `BrushSettings` (path, per point pressure, a tip) and `DabBrush` and friends (dabs, dynamics). Forcing one model on both would mean a rewrite of the vector format. Instead:

1. **One picked brush.** `pickedId` in `presets.ts` is already one id for both sides. Stop deriving the side from the tool and derive it from the layer: when `activeLayerId` changes kind (`src/ui/drawingMode.ts` already works out which kind of layer you are drawing on), apply the picked brush's half for that kind.
2. **Every preset can give both halves.** A `BrushPreset` already has `brush` and an optional `pixel`. Add an optional `pair`: the other half, when the brush was made on both sides. The 15 "there on both" brushes in the table become 15 pairs straight away. Anything with one half gets the other from a **translation**.
3. **Translation, never loss.** `toPixel(brush)` and `toVector(spec)` are pure, best effort functions: size, tip kind, spacing, taper, pressure on size, angle. They never change the preset itself: the half you made stays exactly as it was, and the translated half is worked out when needed. So swapping back is lossless. What a side cannot draw is listed in one line ("Dual tip is kept but vectors don't draw it"), and the controls for it are greyed.
4. **One list.** The panel shows one list that works on both layers. The 15 pairs merge; the 11 "different" ones are candidates the table lists (Ink and Tapered ink, and so on) and are confirmed by you, not guessed. Group names are unified last. If you would rather keep two lists, the picker already supports it and only the layer rule changes.
5. **Format.** In the brushes file (`frameling-brushes`, version 1) a pixel preset already carries a stand in vector half (the standard brush), and a vector preset has no pixel half. `pair` is optional, so old files open as they are. An older build that rewrites the file drops `pair`, and the translation rebuilds the other half, so nothing breaks. No version bump.
6. **Ask once.** Where a swap changes the look a lot (a vector Gouache on a pixel layer), the first time asks, with the answer remembered (`registerChoice`/`withChoice`, `src/core/choices.ts`): "Draw it as close as pixels can" or "Pick a pixel brush". Same for importing.

What happens today, checked in the app: picking a vector brush on a pixel layer fills `ui.brush` and changes nothing the pixel layer uses; picking a pixel brush on a vector layer switches the tool to Pixel brush on a layer that cannot take it.

## Work list, in the order I would build it

| # | Piece | Size | Risk | Depends on | What it gives |
|---|---|---|---|---|---|
| 1 | **The parity test, with a list of known gaps.** | small | low | none | A test that fails when a brush or control is on one side only and not on the list, and when the list holds something that is no longer one sided. Starts with today's 36 + 27 brushes and 16 + 37 controls on the list; every later piece shortens it. See the shape below. |
| 2 | **Name every control** (`data-control` ids on `Slider`, `Toggle`, `Choice` and the buttons, optional and unseen) | small | low | none | Stable ids so the test reads ids, not words. Words can change; the ids cannot. |
| 3 | **The 20 missing pixel presets, and the three media.** Mechanical pencil, Colour pencil, Gel pen, Ballpoint, Brush pen, Dip pen, Fine marker, Block marker, Brush marker, Tapered brush, Round brush, Dry brush, Charcoal, Oil pastel (as a preset), Leaves, Falling leaves, Paw prints, Dashed line, Broad nib, Round nib and the Sketch pencil medium as a saved brush. | small to medium | low | none | 20 of the 36 vector only brushes now exist as pixel brushes. Picture tips need three small drawings (leaf, paw, dash). Help and A/B shots as usual. |
| 4 | **Shared panel, pixel side comes up to the vector panel's skeleton.** Preview, titled Brush picker, a Tip picker (Round, Square, Picture, then the engine tips as they arrive), a Stick picker (the Medium row), Paper group, Size, then Save and Share, in the vector order. Pixel only folds (Shape, scatter and flow; Pen, speed and fade; Dual tip; Colour changes) stay folds. | medium | medium | 2, and your two pending decisions | The panels read the same top to bottom. Covers Pixel brush, Soft paint, Chalk and charcoal. |
| 5 | **The plain Brush (B) on a pixel layer gets the same panel.** `PixelBrushOptions` goes. Its Size, Shape and Brush from selection become the Pixel brush's; Pixel perfect becomes a control in the shared panel; `pixelBrushSize`, `pixelBrushShape` and `pixelStamp` move into a `DabBrush` preset ("Pixel pencil"), with a one time migration of the saved tool settings. | medium | medium to high | 4 | Press B on a pixel layer and get the full panel and list. The risk is Pixel perfect, the stamp, Shift-click lines and the footprint cursor, which all read the old settings. |
| 6 | **A brush that stays picked and swaps mode.** One picked id, the layer decides the side, `pair` and the two translations (see above), the greyed "not drawn" line. | medium to large | medium to high | 4, 5 | Move from a pixel layer to a vector layer and the brush follows. |
| 7 | **Imports reach both sides.** Photoshop, Krita, Procreate and GIMP files produce a pixel brush as now; with 6 they appear in the one list and draw as vectors on a vector layer through `toVector`, with the greyed line for what is lost. | small | low | 6 | The Add from a file button on the vector panel stops being a trap. |
| 8 | **A vector brush keeps its own paper.** `BrushTip.paper?: PaperKind`, optional. `vectorStroke.ts` writes it into the tooth effect instead of the sheet's when set. The Paper group on the vector side passes `own` and `onOwn`, as the pixel side does, with the same one time question (`PAPER_PINNED_CHOICE`). Saved brushes keep it; old files have none and follow the sheet. | small | low | none (it can go anywhere after 1) | Closes the known model problem and makes the Paper group identical on both sides. |
| 9 | **Cheap crossings, both ways, that the model already has room for.** To vectors: Opacity (a shape already has one) and Hardness as a soft edge (the shape blur effect). To pixels: Matte finish (the same colour adjust and film grain, on the layer). | medium | low | 6 | Three controls close, and Ink bleed, Colouring pen, Soft round and Soft pixel brush come close on vectors. |
| 10 | **Pen sensors on a vector point.** `StrokePoint` is `{x, y, p}`. Add optional `tilt`, `twist` and a time, kept only when the pen sends them (a mouse and old files are unchanged). Then **dynamics on the width**: Size follows pressure, tilt, speed and fade for vectors. | large | high | 9 | Dynamics for vectors: Size follows, Scatter follows and the Amount, Other way round and Shape of the response controls with them. Format change: optional fields, read and validate and tests updated. The risk is file size (a stroke with five numbers a point), undo, SVG and Godot export. |
| 11 | **Flow, colour changes and blend on a vector stroke.** A stroke becomes runs: a short chain of segments, each with its own alpha and colour (Hue, Lightness and Colourfulness wobble, Mix toward fill, Flow follows). Blend mode per shape (`StrokeShape.blend?`, optional) through the single renderer. | large | high | 10 | Flow, Flow follows, Hue, Lightness and Colourfulness wobble, Colour mixes toward the fill colour, and How the paint joins what is there. SVG and Godot export must write the runs as plain shapes. |
| 12 | **Dual tip on a vector stroke.** A second tip as a mask on the outline, applied as a shape effect in the way Paper tooth is (a picture that stays a picture; the line stays editable). | medium to large | medium | 9 | Dual tip, Dry ink, Cracked paint and the like on vectors. |
| 13 | **Vector tips on a pixel layer by drawing them as shapes, then as pixels.** Take a vector brush's geometry (`src/geometry/tip.ts`), draw it into the pixel layer's session the way the pixel stroke does (edge sharp or smooth by the Edges choice, palette lock honoured). | large | medium to high | 6 | In one go it covers the 15 brushes the engine lacks: Watercolour (4), bristles (5), Along the line and Edged (5), Copperplate. Matte and Gap variety follow. Live drawing has to stay quick, so the stroke is redrawn on lift like the pixel taper end is. |
| 14 | **Native engine additions where drawing as shapes is not good enough.** Gap variety (spacing varies), pressure on Roundness, a Watercolour rim after the stroke, real bristles as sub dabs. | medium each | medium | 13 | Only the ones 13 turns out to do badly. Decide after looking at 13's pictures. |
| 15 | **Wet paint on vectors.** Needs the pixels under the stroke, which a vector stroke does not have. Recommend leaving it **pixel only**, greyed with its reason, unless you want a "bake this stroke to pixels" brush. Not built in this plan. | not planned | n/a | | The one honest exception. |
| 16 | **Help, palette commands, menus, A/B looks.** Each piece above carries its own, per the project rules (`registerHelp` with `-dark` and `-light` pictures, commands, a choice where there are two answers). | spread over the pieces | low | each | Nothing ships without it. |

Pieces 1 to 3 and 8 do not depend on your answers and can start at once. 4 and 5 wait for the two pending decisions. 6 is the heart of it. 10 to 13 are the long tail, and the table says which brushes each one frees.

## The shape of the parity test

A test in `test/brushes/parity.test.tsx`, in jsdom like `optionsOrder.test.tsx` (it already mounts `BrushOptions` against a store with a document).

1. **Controls.** Mount the shared panel on a vector layer and on a pixel layer, for each variant that changes what shows (plain, every tip, Catch on paper on and off, each pixel engine: Pixel brush, Soft paint kinds, each dry medium). For each mount, collect the `data-control` ids in order, and whether each is greyed.
2. **The rule.** For every id: it is on both sides (enabled or greyed with a reason), or it is in `ONE_SIDED` in `src/brushes/parity.ts` with a one line reason. The test fails if:
   - an id appears on one side only and is not listed;
   - a listed id now appears on both (so the list has to shrink);
   - the shared ids are in a different order on the two sides;
   - the two panels do not have the same sections (preview, Brush, Tip, Stick, Paper, Size, Save and Share).
3. **Brushes.** Every preset in the one list has both halves, given or translated. Fails when a starter has neither, when a `pair` points at nothing, or when a brush is on one side's list and not the other's unless listed in `ONE_SIDED_BRUSHES`. The two lists are the same list: `brushesOnSide('vector')` and `brushesOnSide('pixel')` return the same ids on a layer of either kind.
4. **The swap.** Pick a brush on a vector layer, move to a pixel layer: the picked id is the same, the tool is the pixel engine, and `currentSpec()` is the translated half. Move back: the vector half is exactly what it was (deep equal).
5. **The importers.** A fixture from each of `test/fixtures/brushes/` lands in the one list and shows on both layers.
6. **The starting state.** Day one, `ONE_SIDED` holds the 16 vector only and 37 pixel only controls and the 36 and 27 brushes from `table.md`. It only gets shorter. The end state is two empty lists apart from the ones that are one sided by nature (Merge shapes together, Hold to tidy, Sharp pixels, Pixel perfect, Wet paint if piece 15 stays out), each with its reason.

A harness with the same checks in the real app belongs in `scripts/docs/ab-brush-parity/` (already there for the pictures): it dumps the panel's controls on a vector and a pixel layer and diffs them, for the days when jsdom cannot tell (layout, folds, popovers).
