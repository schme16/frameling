# First hour review, round 2

Six journeys through the features that landed today (workspaces, snapping, the pixel rebuild, variations, nested folders,
clip direction and repeat, Features, plugins v2, the new exports), walked as a brand new person in the real built app:
the real main process, a fresh profile per journey, real mouse and keyboard events, everything inside xvfb. Every
screenshot was looked at. Pictures are in this folder (`brand/first-hour-2/`), named `jN-NN-what.png`.

Severity: **blocker** (a beginner is stopped or gets a wrong result without knowing), **high**, **medium**, **low**.
Effort: S (under half a day), M (a day or two), L (more).

What I could not drive: native dialogs (Open, Save, "unsaved changes") do not show in the window capture under xvfb.
Saves and exports used the test save folder, and I opened the Aseprite file through the same path a double-click takes
(File > Open Aseprite was seen in the menu but not clicked). Mid-drag states (drop targets) were not captured.

## Ranked fixes

| # | Fix | Severity | Effort |
|---|-----|----------|--------|
| 1 | View menu is about 3000 px tall with no scrolling, so Workspaces, Save layout, Manage workspaces and Reset layout cannot be reached from it | blocker | S (cap and scroll), M (split it) |
| 2 | An Aseprite sprite exported to Godot comes out at 8x (7 frames of 28 x 24 become 224 x 192 each, a 672 x 384 sheet) with no question asked | high | S |
| 3 | "Recolour the whole animation" inside a variation changed nothing visible, with no message; and a hand fill in a variation only changes the one frame you click | high | M |
| 4 | A new pixel sprite starts with no tool highlighted (the active Brush is hidden from the pixel tool rail) | medium | S |
| 5 | After "New pixel art" (a deliberate choice) the app asks again "Switch to the Pixel workspace?" | medium | S |
| 6 | The Welcome sheet stays on top of a file that was opened while it was showing (double-click, Open Recent) | medium | S |
| 7 | A selected export card goes dark with faint text while the mouse is over it, so it looks disabled | medium | S |
| 8 | The 60-second lesson card covers the timeline controls it is pointing at | medium | S |
| 9 | "Your first animation in 60 seconds" is at the very bottom of a 22-card welcome sheet | medium | S |
| 10 | Clip direction and repeat only live in a right-click on a 12 px chip, whose name shortens to "b…" | medium | S |
| 11 | Workspaces are sticky across documents: a vector example opened in the Pixel workspace shows the Palette first, "Paint and Back" wording and a misplaced canvas | medium | S |
| 12 | Variation "Differences" speak in internals ("Drawing at frame 1: shapes in a different order and 1 shape added") | medium | S |
| 13 | The first tap of Space in the lesson stops for a "Tapping Space" question just as the lesson says "Press play" | low-medium | S |
| 14 | File menu lists "Open a picture or sprite sheet" and "Open Aseprite file" twice (bottom group and Import), and Export is a 10 item submenu with the Godot add-on tucked at its foot | low-medium | S |
| 15 | After opening a document or "Fit all" the canvas is left at an odd zoom or offset (22 % with tiny boards; page not centred) | low | M |
| 16 | Small text and wording: Sounds says "Off unless you turn them on" with the switch on; Artboards panel says the same thing twice; "Back and forth (ping-pong)" vs "Back and forth, from the end"; rail groups called "TOP" and "BOTTOM"; Enter does not save a workspace name | low | S |

## Journey 1: first launch to a first drawing

1. First launch opens straight on the Welcome sheet ("Hiya! What are we cooking up today?"), no interests question
   any more. `j1-01-first-launch.png`. Clear and friendly; the mascot and four starter cards read well.
2. The sheet runs to 22 cards. The first-animation lesson is the last thing on it. `j1-02-welcome-bottom.png`
   - **Friction (medium):** a person who wants to be led has to scroll past everything. **Fix (S):** on the very first
     launch, put the lesson as a strip at the top ("New here? Show me, 60 seconds"), and keep the bottom row for later.
3. "Show me" starts the lesson. `j1-03-show-me.png`. The lesson card sits bottom left and covers the timeline's frame
   controls and part of the tool rail.
   - **Friction (medium):** the card sits on top of what step 2 and 3 point at (the Copy button is lit, but half
     hidden). **Fix (S):** anchor the card to the side of the screen opposite the highlighted control, or above the
     canvas.
4. Draw, press D, change it, press play. `j1-04-first-stroke.png`, `j1-05-copy-frame.png`, `j1-06-second-drawing.png`.
   Works well: "Lovely", "There it is", the lesson trims the 24 frame default to the drawings and says so.
5. Press Space: a "Tapping Space" question appears. `j1-07-playing.png`.
   - **Friction (low-medium):** the lesson says "Press play" and the first thing a person sees is a settings
     question with a blurred app behind it. **Fix (S):** during a quest take the default silently and ask later, or
     show the question after the lesson.
6. "You earned Flipbooker". `j1-08-after-space-choice.png`. Delight, but the toast lands on top of the drawing while
   it plays.

Delight: the lesson copy, the ghost of the last drawing, the earned badge, and the auto-trim to the drawn frames.

## Journey 2: a pixel sprite, from Aseprite habits to a Godot sheet

1. Pixel art card opens Quill's chooser: One picture, An animation (marked "Like Aseprite"), Frames on boards,
   Sprites on a sheet, and a size row. `j2-01-pixel-art-chooser.png`. Delight: pictures of what each way means, and
   "Not sure? Pick An animation".
   - **Friction (low):** nothing is chosen when it opens, so Start is greyed until you click. **Fix (S):** pre-select
     An animation, which the hint already recommends.
2. Start, and the app asks "Opening pixel art. Switch to the Pixel workspace?" `j2-03-switch-to-pixel-ask.png`.
   - **Friction (medium):** the person just said "New pixel art". Asking again is noise. **Fix (S):** switch without
     asking when the document came from the pixel chooser; keep the ask for opening files.
3. The Pixel workspace: palette on the left, big canvas, real-size Preview on the right, the mode chip, Size 1 to 8,
   Pixel perfect, an idle clip already made. `j2-04-pixel-workspace.png`. Delight.
   - **Friction (medium):** no tool in the rail is highlighted. The active tool is the vector Brush, which this rail
     does not show. Pressing B drew fine, but a person cannot tell what they are holding. Pressing P lit the Pencil
     (`j2-07-p-pencil.png`). **Fix (S):** a pixel document starts on the Pencil.
   - **Friction (low):** the left panel carries Add colour, Add ramp, Starter palettes, Load, Save as, From drawing,
     From a picture, Lock layer and Reduce frame at once. **Fix (S):** fold the rare ones under "More".
4. Aseprite habits. The keys live in Preferences > Keyboard > Shortcut set > "Aseprite keys", with a good summary
   ("B pencil, U rectangle, M and Q select, X swaps colours ..."). `j2-09-prefs-keyboard.png`,
   `j2-10-aseprite-keys.png`. I checked E, G, I, B and Alt+arrows: they all work.
   - **Friction (medium):** nothing on the pixel screen points at it. The "Like Aseprite" badge in the chooser only
     describes how frames are stored. I did not see a "Coming from Aseprite" ask in this run. **Fix (S):** add a small
     "Used Aseprite? Use its keys" link in the Pixel workspace hint line and in the chooser.
5. Aseprite file in: layers, tags as clips (squash, jump), palette and speed all came across. `j2-16-aseprite-sprite.png`.
   Delight.
   - **Friction (medium):** I opened it while the Welcome sheet was showing; the sheet stayed on top of the sprite
     (`j2-15-aseprite-in-pixel.png`) until Escape. **Fix (S):** any successful open closes the Welcome sheet.
   - **Friction (low-medium):** File > Open Aseprite file and Open a picture or sprite sheet are in the bottom group
     and again under Import. `j2-12-file-menu.png`, `j2-13-import-submenu.png`.
6. Export > Sprite sheet > Godot. `j2-18-export-dialog.png`, `j2-19-sheet-options.png`, `j2-20-godot-picked.png`.
   - **Problem (high):** the size is 8x. The Godot export wrote `slime-bounce.png` at 672 x 384 with frames of
     224 x 192 for a 28 x 24 sprite. The "Pixel art size for game engines" question did not appear, because the file
     from Aseprite has no art pixel size above 1, so the code that asks never runs. A new Pixel art document does
     give the right answer: 4 frames of 32 x 32 (`j2c-03-godot-new-pixel.png`). **Fix (S):** for any document with
     pixel layers, choosing a game engine sets the scale to 1x (and says "Real size" in the note); in the export
     dialog keep 8x only for video and GIF.
   - The .tres lists the clips by name with speed and loop, and the JSON atlas is right. `j2-21-after-export-click.png`.
7. "Show in folder" toast works and names the file.

## Journey 3: a clip that plays back and forth, as GIF and Lottie

1. Doodle, three drawings with D. `j3-02-three-poses.png`. Copy (D) carries the old drawing along, so the second
   ball is added next to the first, not moved. That is the lesson's design, but people drawing a moving ball hit it.
   - **Friction (medium):** nothing says "to move it, select it and drag". **Fix (S):** after D, a one-line hint on
     the status bar or a toast: "Copied. Select the drawing and drag it to move it along."
2. Drag across the clips lane: a clip appears already in rename. Typed a name, Enter. `j3-03-clip-created.png`.
   Delight.
3. Right-click the clip: Plays (Forward, Backward, Back and forth (ping-pong), Back and forth from the end) and
   Repeat (Forever, Once, N times). `j3-04-clip-menu.png`, `j3-05-clip-pingpong.png`.
   - **Friction (medium):** there is no sign on the chip that a menu exists; the chip is 12 px tall and shows
     "b… ⇄ ↻". **Fix (S):** double-click or a small caret opens the same menu; show the full name on hover.
   - **Friction (low):** "ping-pong" and "from the end" are not told apart. **Fix (S):** "Back and forth (end frames
     show once)" and "Back and forth (end frames show twice)", or whatever the real difference is.
4. Export > GIF > "A clip" > bounce. `j3-07-export-gif-clip.png`. The dialog says "4 frames" for a clip of 3 that goes
   back and forth, and notes "Loop forever. Set by the clip". The file has 4 frames at 1280 x 720. Delight.
   - **Friction (medium):** after a click, the selected card turns dark with faint text while the mouse is on it
     (see the Lottie card in `j3-10-lottie-options.png`); it looks disabled. **Fix (S):** hover must not override
     the selected look.
   - **Friction (low):** the dialog changes height with every option and re-centres, so click targets move under
     the mouse. **Fix (S):** pin it to the top, or give it a fixed height.
5. Lottie: More formats (10) > Lottie. `j3-09-more-formats.png`, `j3-10-lottie-options.png`. "No size to pick:
   shapes stay shapes" is a good sentence. The JSON has the clip's four frames as a precomp. `j3-11-lottie-done.png`.
   - **Friction (low):** the card tags are uneven (SVG drawing and Moving SVG put the tag on its own line).
   - Nothing lets you see the result before or after; "Show in folder" is the only way. A preview of the exported
     GIF or Lottie would close the loop (L).

## Journey 4: rearranging the workspace and saving it

1. View menu. `j4-01-view-menu.png`, `j4-02-view-menu-scrolled.png`.
   - **Problem (blocker):** the View menu has 97 entries and is about 3000 px tall. It runs off the bottom of the
     window and does not scroll (wheel did nothing). Draw, Animate and Pixel workspace, Save layout as a workspace,
     Manage workspaces, Reset layout, and Features are below the fold and cannot be reached. It is the catch-all for
     every "View" and "Artboards" command (Snap to ..., Joined shots ..., Delete artboard). Even the toast after
     saving a workspace says "Find it in the View menu". **Fix (S):** cap the menu height and scroll. **Fix (M):**
     give Artboards its own menu, fold the snap and grid items under submenus, and keep Workspaces near the top.
2. The Panels button and the right rail context menu work well. `j4-03-panels-button.png` (Find a panel),
   `j4-04-rail-context.png` (Move to the left side, bottom, top, a new group above or below, its own window).
   Delight: every move is a plain sentence.
3. "Move to its own window" floats Preview over the middle of the canvas. `j4-05-floating-preview.png`.
   - **Friction (low):** it opens covering the drawing. **Fix (S):** open it beside the canvas, near where it was.
4. Dragging the window down onto the timeline made it a tab there, hiding the timeline. `j4-06-float-moved.png`.
   Possibly intended, but there was no way to see it coming. I did not capture a mid-drag drop hint.
   **Fix (S):** confirm the drop zones show an outline and a label ("Add to Timeline tabs").
5. Tab context menu: "Move to a new group to the left/right", "Move to the left side". `j4-07-tab-context.png`,
   `j4-08-preview-left.png`. Works, a stacked group appears and the canvas resizes.
6. Preferences > Workspaces. `j4-09-prefs-workspaces.png`, `j4-10-workspace-saved.png`, `j4-11-workspace-saved.png`.
   Draw, Animate and Pixel plus "Yours 0 of 12", save, rename, update, reorder, share as file or text. Delight.
   - **Friction (low):** Enter in the name field did nothing; only the Save button works. **Fix (S).**
   - **Friction (low):** after rearranging, Draw still says "In use" even though it no longer matches. A small "changed"
     mark and "Update" next to it would help (S).
7. Switching to Pixel on a vector drawing is instant. `j4-12-pixel-workspace-on-vector.png`. It leaves the Palette
   (which says "work on pixel layers") in front and the Brush lit.
   - **Friction (medium):** workspaces do not follow the document. Opening a vector example afterwards kept the Pixel
     layout, "Paint (front) and Back" wording and an off-centre canvas (`j6-05-explosion-template.png`). **Fix (S):**
     when a document of the other kind opens, offer the matching workspace once, remembered.
8. Snapping: Preferences > Snapping is a clear grid of vector and pixel columns, with "Hold Ctrl while dragging to
   skip it". `j4-13-prefs-snapping.png`. Delight. The status bar "Snap on" opens the same choices.

## Journey 5: a colourway variation, exported with the original

1. Artboards panel. `j5-01-artboards-panel.png`. "Make a variation" is clear. The panel says the same sentence twice
   at the top ("Several canvases in one file ..." and "Artboards are separate canvases in one file ...").
2. Variation made, with a toast "It follows Artboard 1: change things here and only those things differ".
   `j5-02-variation-made.png`. Delight: the toast and the "Differences" list. The command palette also finds it by
   typing "colourway". 
3. Colouring it. With the ball selected nothing on screen offers a fill colour: the Properties panel shows Effects and
   Tool options, the Colours tab shows the Stroke picker, and clicking a swatch with the ball selected did not recolour
   it. `j5-06-colours-tab.png`.
   - **Friction (medium):** the path to "make the ball blue" is not visible. **Fix (S):** with a shape selected,
     show its Fill and Stroke at the top of Properties.
4. "Recolour the whole animation" has a fine before and after picture and "Changes 33 colours in shapes and swatches".
   `j5-07-recolour.png`. I applied it from inside the variation.
   - **Problem (high, needs a closer look):** afterwards both balls were still pink, "Differences" said "Nothing
     differs yet", the Redo button was lit, and the only message was a toast "Swatches are shared with the original.
     Change them there, or detach this variation." `j5-08-after-recolour.png`. Either it was rejected with the wrong
     message or it was undone. **Fix (M):** the dialog should say where it applies ("In this variation only" or "In
     the original and all variations") and the result should be one of those.
5. The paint bucket worked in the variation, and the Differences list shows it. `j5-10-bucket-in-variation.png`.
   - **Friction (medium):** it changed frame 1 only; the ball stays pink for the other 15 frames of the bounce, and the
     list reads "Drawing at frame 1: shapes in a different order and 1 shape added". **Fix (S):** plain words ("Ball,
     frame 1: recoloured"); **Fix (M):** a "Recolour this variation" that applies a colour change across all frames
     but only inside the variation (this is the colourway promise).
   - The bucket on a line gives a good hint ("You clicked right on a line. Click inside the area you want to fill").
     At the 22 % zoom that Fit all leaves, though, the targets are tiny.
6. Export all variations. `j5-11-export-variations.png`. "This artboard and its variations (2)", "Each as its own
   file". It asked "Into a folder or One zip" (choice dialog, remembered) and wrote a zip with two Lotties,
   `Artboard 1.json` and `Artboard 1, variation 1.json`. `j5-12-variations-exported.png`.
   - **Friction (low):** the file names are the generic board names, not "Bouncing ball". **Fix (S):** `<drawing> -
     <board>.json`, with a place to type an export name (the Export as field exists, but is empty).
   - The format is whatever you exported last (Lottie here). Worth a visible "Format: Lottie" line next to the button.

## Journey 6: turning a feature off, then opening a file that needs it

1. Preferences > Features. `j6-01-prefs-features.png`. Plain descriptions, and Audio is dimmed with "Lip sync needs
   this. Turn off Lip sync first". Delight. Turning Particles off gave no feedback (`j6-02-particles-off.png`).
   - **Friction (low):** nothing says what disappeared (a panel, three commands). **Fix (S):** a toast "Particles is
     off. Its panel and commands are hidden. Your drawings keep their data."
2. The Welcome sheet then hides the examples that use it: the Explosion and smoke card was gone.
   `j6-04-welcome-scrolled.png`. Sensible.
3. Opening a drawing that uses Particles asks "A feature is turned off ... Turn on / Not now", with the reassurance
   "nothing is lost". `j6-06-open-needs-particles.png`. Delight, and "Not now" leaves the drawing on screen and keeps
   its data. `j6-07-not-now.png`.
   - **Friction (low):** with it off, the particles are drawn but their layers carry no mark that they are particles,
     so it is not clear why they cannot be edited. **Fix (S):** a small "Particles (off)" tag on those layers.
4. Plugins menu: "Manage plugins" and "Install a plugin" only. `j6-08-plugins-menu.png`. A newcomer finds no examples
   to try. **Fix (M):** list two or three bundled sample plugins in Manage plugins. I did not install one.

## Looks broken

- View menu cannot scroll (fix 1).
- Selected plus hovered export card goes dark with faint text (fix 7).
- Welcome sheet stays over a file opened while it is showing (fix 6).
- Recolour inside a variation, see journey 5, step 4 (fix 3).
- Canvas offset after opening a document in a stale layout (`j6-07-not-now.png`: the page is cut at the right with the
  canvas background showing past it), and zoom 22 % after Fit all (`j5-08-after-recolour.png`).
- Preferences does not close on Escape when focus is on a button (it did from other states); the close X works.
- The "unsaved changes" and quit questions are native dialogs; under xvfb they cannot be seen and quit never finishes
  while a drawing is unsaved. Not a product bug, but worth knowing for the screenshot scripts.

## Delight worth keeping

- Quill's pixel chooser with a picture per way, and "Not sure? Pick An animation".
- Aseprite import: layers, tags as clips, palette, speed, all in one open.
- Aseprite keys with a plain summary, and the keys really work.
- The clip menu (direction and repeat) and the GIF/Lottie playing the clip back and forth, with "Loop forever. Set by
  the clip".
- Panel context menus in plain sentences, Find a panel, saved workspaces you can share as text.
- Snapping preferences as a grid, "Hold Ctrl to skip".
- Variations: the made-a-variation toast, the Differences list with Reset, "colourway" finding it in the palette.
- Recolour the whole animation with before and after.
- Features: a feature off means hidden, never lost, and the question when opening.
- Choices that ask once and remember (Space, art size, several artboards).

## Open choices

1. **View menu:** cap and scroll only, or split it. Recommend both: cap and scroll now (S), then move Artboards to its
   own menu and snapping to a submenu (M).
2. **Game engine export size for pixel art:** always 1x when an engine is chosen, or ask each time. Recommend 1x with
   no question (the note says "Real size, one art pixel is one pixel"), and ask only for non-game targets.
3. **Pixel workspace after "New pixel art":** switch silently, or keep asking. Recommend switch silently for new
   pixel documents; keep the ask for opened files.
4. **First-run lesson:** pinned strip at the top of the Welcome sheet on first launch only, or keep at the bottom.
   Recommend the pinned strip, gone after the first drawing is made.
5. **Variation colourway:** a "Recolour this variation" button across all frames, or leave it to the paint bucket.
   Recommend the button; it is what the word colourway promises.
6. **Workspace following the document:** offer once per document kind, or never. Recommend offer once and remember.
