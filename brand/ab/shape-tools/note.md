# Shape tools: combining shapes, dashes and arrows, hold to tidy

Every picture is in both themes (`-dark`, `-light`). Clips are H.264, yuv420p, even sizes. Made with the real built app, inside xvfb.

## Combining shapes (fn-boolean-shapes)

Every still is a before and after in one picture: on the left two shapes with different colours and outlines (a red round one with a dark outline underneath, a blue boxy one with a navy outline on top), on the right the same pair after the command. The words under each say what happened to the colours.

- `boolean-join-*.png`: **Join**. One shape, in the bottom shape's red and dark outline. The blue and navy are gone.
- `boolean-cut-*.png`: **Cut out**. The top shape punched its outline out of the one below and went; the one below keeps its red and its outline (the outline runs round the new edge too).
- `boolean-overlap-*.png`: **Keep the overlap**. Only where they crossed, in the bottom shape's colours.
- `boolean-punch-*.png`: **Punch a hole**. Everything except where they crossed (the hole has the outline too).
- `boolean-cut-three-*.png`: Cut out with a white oval over three coloured bars. Every bar keeps its own colour and outline; shapes under the cutter are cut one by one, not merged.
- `boolean-join-top-colours-*.png`: the same Join, with the remembered answer "The top shape" (Preferences > Behaviour > Colours when shapes are combined): the result wears the blue and navy instead.

## Dashes, arrows and tapered lines (fn-stroke-dashes-arrows)

- `strokes-screen-and-files-*.png`: the same nine lines and shapes on screen, then what each export makes of them, drawn by something that isn't Frameling: the PNG export, the SVG (rsvg-convert), the PDF (pdftoppm) and the Lottie (lottie-web). All five agree: dashed, dotted, dash and dot, a triangle arrow, a dot and open arrow, a line that swells, a line that tapers to a point, a dotted ellipse and a dashed box.
- `exported-dark-drawing.svg|pdf|json|png` (and `-light`): the exported files themselves, to open and check.

What each format does (all of it is tested in `test/export/line-style.test.ts`):

| Format | Dashes | Arrow heads | Changing width |
|---|---|---|---|
| PNG, video (MP4, WebM, ProRes), GIF, APNG, PNG sequence, sprite sheet, PSD layers, playable | drawn exactly (the canvas dashes) | drawn exactly | drawn exactly |
| SVG and moving SVG | real `stroke-dasharray` and `stroke-dashoffset` | little shapes of their own | the filled outline of the line (no stroke left) |
| PDF | real PDF dash (`[a b] phase d`); a dashed gradient line is cut into dashes inside its outline, since PDF can only shade areas | little shapes | the filled outline |
| Lottie and dotLottie | real dashes (a dash, a gap, an offset; Lottie holds one pattern for the whole line) | little shapes of their own, one slot each, so frames with and without an arrow pair up and the arrow fades where it isn't | the filled outline |
| Illustrator (.ai) | real dashes (`[a b] p d` in the Illustrator data) | little shapes | the filled outline |

Nothing is left out or turned into a picture. Where there is no native way (a changing width), the line becomes its filled outline, so it looks the same but its width can't be changed in the other program.

Found by playing the Lottie in lottie-web: it draws nothing at all when two dash entries share a name, so a dash and dot pattern now names every entry (Dash, Gap, Dash 2, Gap 2, Offset).

Not drawn by a real viewer here: the Illustrator file (no Illustrator on this machine; its dash operator is checked in the file's data), and Lottie in players other than lottie-web.

## Hold to tidy (fn-quickshape)

- `quickshape-snap-*.mp4`: draw a rough circle with the brush and keep the pen still: it snaps to a circle with its name beside the pen ("A circle"). Still holding, drag out: it grows. Lift: it stays. Then a rough box (held, snaps to a rectangle) and a rough line (held, a straight level line).
- `quickshape-slow-*.mp4`: a circle drawn carefully (about 80 pixels a second, with a thinking pause half way round) is NOT tidied, and neither is a squiggle held still for two seconds. The line stays exactly as drawn.
- `quickshape-undo-*.mp4`: tidied, then Ctrl+Z once: your own rough line comes back (the tidy is its own step after the stroke). A second Ctrl+Z removes it.

What was chosen, and why:

- **Hold for 600 ms** (setting: Hold time, 300 to 1200 ms). Pauses while drawing are a quarter of a second or less; a deliberate hold is a good half second.
- **Still means within 3 screen pixels** for the whole hold. A resting pen and a mouse shake by a pixel or two. It also keeps careful drawing safe: to stay inside 3 pixels for 600 ms you would have to move under 5 pixels a second, and careful drawing is 15 to 100.
- **Only a tight fit snaps**: line, circle or ellipse, rectangle or square (also tilted), triangle and other plain polygons up to six corners. Arcs, hooks, waves, squiggles, spirals, lumpy loops and anything under 48 screen pixels long are left alone. Over many wobbly strokes with fixed seeds, 97 or more in 100 circles and lines and 90 or more triangles are recognised, and 3 in 100 or fewer of the lumpy loops and waves are touched.
- **Starts off, and asks once**: the first time the pen holds on a clear shape, the line stays as drawn and a small message (after the stroke, never during it) says Hold to tidy exists, with a **Change** button. The answer is remembered; it's in Preferences > Behaviour and under **More brush options**, and in the palette as **Hold to tidy lines into shapes**.
- **Easy to refuse**: lift before the hold and nothing happens; **Esc** while the shape is showing drops the stroke as it always did; after lifting, **Keep my line** on the message or Ctrl+Z gives your own line back in one step.
- Also **Tidy into a shape** (palette, Arrange): does the same to brush lines you already drew and picked.
- Not on Merge shapes layers, and not with mirror drawing on.

## Not done

- Variable width is by stops and presets (six look-alikes); there is no on-canvas width handle to drag.
- Variable width and dashes are not turned into editable curves of the line: they are drawn from the line, and exported as its filled outline.
- Erasing part of a dashed or tapered line, and merge drawing, treat the line as solid and full width (the eraser has always worked from the line's plain outline).
- Symbols, text and particles can't be combined (a message says so); a group counts as one shape.
