# First hour review

A brand-new person's first hour with Frameling, driven in the real built app (real main process, a fresh user-data
folder each time, real mouse and keyboard events) through five sessions. Every screenshot was looked at. Before and
after pictures are in `brand/ab/first-hour/` (A is before, B is after).

Bugs that would have stopped a beginner cold are marked **(blocker)**.

## 1. First launch, a bouncing ball, a GIF

Onboarding with each interest, then a ball drawn from scratch, animated frame by frame, exported as a GIF.

What got in the way:

- **(blocker)** Picking "Copy" (D) after clicking ahead on the timeline said "There is no drawing on this frame". The
  drawing on frame 1 only lasts one frame, so frame 4 is empty and the ball disappears. People expect Copy to carry
  on from where they were.
- **(blocker)** Export said "24 frames" for a 4-frame animation, so the GIF would have 20 blank frames at the end. The
  person never asked for 24 frames; the blank document is 2 seconds long.
- The paint bucket inside a fresh circle said "That area is already this colour." The default fill is white on white
  paper, and the message didn't say what to do.
- Example cards: the Vector/Pixel badge squeezed the names into two or three lines ("Game / hero / sprite set").
- In the Draw layout (what you get after skipping onboarding) the timeline showed half a layer row. In Pixel it showed
  no layer rows at all.
- Export cards: tags broke over two lines ("SVG drawing This / frame", "Moving SVG Animated / SVG").
- The markers and clips lanes under the ruler are an unexplained blank band.
- Skipping onboarding opens the welcome sheet, which says "Hello!" again. Fine, but a little repetitive.
- The timeline toolbar wraps at the default 1400 x 900 window, leaving the onion controls alone on a second row.

Fixed:

- Copy on an empty frame now copies the last drawing to that frame and stays there (`copyEarlierKey`, tested; help and
  command text updated).
- Export notices when nothing is drawn after frame N: "Nothing is drawn after frame 4, so frames 5 to 24 would come
  out empty. Make the animation 4 frames long" (one click, undoable). `drawnFrames()` tested.
  `05-export-empty-end.png`.
- Bucket "same colour" hint now says what to do next.
- Badges sit on the picture's corner, names get the whole width (built-in and Yours). `01-example-badges.png`.
- Draw and Pixel layouts start with a 260 px timeline (two layer rows visible). `02-draw-timeline-height.png`.
- Export tags never break in the middle.
- Empty lanes say what they're for: "Markers: double-click to name a moment", "Clips: drag across frames to make
  one, like idle or run". `14-empty-lanes-say-what-for.png`.

The GIF came out right: 4 frames, 1280 x 720.

## 2. Game sprites: pixel character, idle and run clips, palette, Godot

What got in the way:

- **(blocker)** "Game sprites and pixel art", then "Just a blank page" gave a 1280 x 720 *vector* page. The Palette
  panel then said its tools only work on pixel layers.
- **(blocker)** Pick a palette colour, pick the bucket, click: "That area is already this colour." Swatches change the
  box in front (stroke), but the bucket pours the fill box, which stays white. The palette didn't even show an F mark
  because white isn't in the palette.
- **(blocker)** Choosing Godot asks "Pixel art size for game engines", but that question opened *behind* the Export
  dialog (z-index 100 under 900), so the export ran at 2x and the question popped up afterwards.
- The question dialogs had no side padding: text and option cards ran into the dialog's edges.

Fixed:

- Pixel people get a 32 x 32 pixel grid for a blank page ("Just a blank pixel grid"). `03-sprite-blank-is-pixel.png`.
- Picking a tool brings its colour box forward: the bucket brings Fill, brush/pencil/line/shade/dither bring Stroke.
  So the swatch you click next is what you paint with, in vector and pixel alike (`src/tools/pick.ts`, tested; the
  Fill and stroke help says so). `04-bucket-uses-picked-colour.png`.
- Ask-the-first-time questions sit above other dialogs, with proper padding. `06-choice-dialog-on-top.png`.

Clips were easy once the lane said what it was for. The Godot export wrote `.png`, `.json` and `.tres`.

## 3. Tiles: a tileset and a small level

What got in the way:

- **(blocker)** The blank page for a tiles person was the 32 x 32 sprite grid, where one 16 x 16 tile covers a quarter
  of the canvas: a 2 x 2 level.
- The Tileset panel was a tab in the overflow menu, so the tiles person had to find it.
- **(blocker)** The "Done" button on the tile banner over the canvas did nothing. The canvas captured the pointer on
  press, so the release and click went to the canvas (and the press also drew a pixel under the button). Any button
  laid over the canvas had this problem.

Fixed:

- New "Blank level" template: 320 x 192, an empty 20 x 12 tilemap layer, a 16 x 16 tileset. Tiles people get it from
  "Just a blank level", and it shows in the welcome sheet's blank row as "20 x 12 tiles". `07-tiles-blank-level.png`.
- Tiles people land with the Tileset panel in front.
- Presses on buttons and links over the canvas go to them, not the tools (`pressesControl`, tested).

"Make my first tile", drawing it with the repeat preview, Done and painting a row of ground then all worked.

## 4. Explainer: text animation, a tween, a camera move, MP4

What got in the way:

- The Text tool's options said nothing about making text move. Text animations live in the Text panel, which is in
  the overflow menu.
- The Text, Clip flow, Camera, Particles, Rig and Library panels had no padding: words touched the panel edge and the
  Text panel's fields ran off the right side.
- **(blocker)** Draw a circle, Make in-betweens: "Hold this drawing for a few frames first (drag its end in the
  timeline)". Every first drawing is one frame long, so the first tween always failed.
- Choosing a command that can't run in the command palette did nothing at all, silently.

Fixed:

- The Text tool's options say how to animate text and have an "Open the Text panel" button.
  `15-text-tool-points-at-animations.png`.
- Those six panels have the same padding as the rest. `11-panel-padding.png`.
- A lone one-frame drawing is held for about a second (the frame rate, up to 48 frames) before the tween, so it just
  works. The test that expected the refusal now expects this, and the tween help says so.
  `08-tween-one-frame.png`. This is a behaviour change: before, it refused.
- Picking a command that can't run says so, with "Read about it" when it has help. `12-disabled-command-says-why.png`.

The camera ("Add a camera") and MP4 export were smooth (H.264, 1280 x 720, 24 frames).

## 5. Coming back: recent files, crash recovery, theme, command palette, help

What got in the way:

- "Pick up where you left off" was at the very bottom of the welcome sheet, under about 15 example cards.
- After a crash, Restore loaded the work *behind* the welcome sheet, which stayed open, so it looked like nothing
  happened.
- Typing "theme" in the command palette and pressing Enter opened the Themes help page, not a theme command.
- "make it loop" found nothing useful: every word had to match, filler words included.

Fixed:

- Recent files come first on the welcome sheet. `13-welcome-recent-first.png`.
- Restore closes the welcome sheet. `09-restore-after-crash.png`.
- Commands with a word starting with the query outrank a help page whose title starts with it ("doing beats
  reading"), and filler words (it, the, how, do, make...) are skipped when there's something else. Both tested.
  `10-palette-theme.png`.

Help search ("onion") found the right topics straight away.

## Bigger recommendations, by impact

1. **New drawings should hold.** The root of three blockers above (Copy, the empty GIF tail, the tween) is that a
   drawing lasts one frame on a 24-frame page. I patched each place. Better at the root: a new key holds until the next
   key or the end, or blank documents start with the animation length shrinking to fit the drawings. It's a design
   choice for the A/B board.
2. **Ghost the last drawing on an empty frame.** Clicking ahead on the timeline makes the drawing vanish. A faint
   copy of the last drawing (even with onion skin off), or onion skin on by default in the Animate layout, would
   explain what happened.
3. **Make the default fill a colour, or no fill.** A white fill on white paper looks like no fill, and the bucket's
   first click does nothing visible. A soft colour (or "none" for shapes with the bucket using the stroke colour
   until a fill is picked) would make the first bucket click delightful. Needs an A/B.
4. **Shorten the Export choice.** 15 format cards in one grid. Show the four people want most (GIF, MP4, PNG, sprite
   sheet) and put the rest under "More formats". In the File menu, put the eight Export entries (several sit after
   Import sound) into one Export submenu.
5. **Show Colours as a named tab.** In Draw and Animate, Colours is an unlabelled icon next to "+13". A beginner looks
   for colours first.
6. **Offer recovery on the welcome sheet itself.** Unsaved work found after a crash could be the first card ("Your
   unsaved work from 22:50: Restore") instead of a toast at the bottom that times out.
7. **Stop the timeline toolbar wrapping** at the default window size (fold "Hold for" into a menu, or put zoom on the
   first row), and keep toasts from covering the layer rows.
8. **"Show me how" for sprites and tiles people** is the 60-second first animation for everyone. A pixel or tiles
   version of the first quest would suit them better.

## Notes

- Driven with a scratch driver modelled on `scripts/e2e/export.cjs` (real main process, `FRAMELING_AUTOMATION_DIR`,
  throwaway user data) plus the `scripts/shoot.cjs` input steps, with steps for clicking by text or selector, typing,
  reading text and "crashing" (exit without closing).
- Synthetic clicks on dock tabs (they're `draggable`) didn't always switch tabs in the off-screen window. That looked
  like a test-harness quirk, not a bug, and isn't counted above.
