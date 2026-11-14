# Pixel workspace review: powerful, easy, delightful

Board task `pixel-workspace-delight`. Phase 1: review, plan and A/B mock-ups. No product code was changed.

How this was done: the built app driven under xvfb with real mouse and key events (`scripts/docs/record.cjs`), every step screenshotted and looked at; Aseprite 1.3.18.6 run under xvfb with a throwaway home folder (its settings untouched) and its own `data/gui.xml` read for the key map; Frameling's source read for what is and isn't there. Pixelorama, LibreSprite, Piskel and Pro Motion are from knowledge only (not run).

Screenshot paths below are relative to this folder. Mock-ups are in `../ab/pixel-*/` (each has `NOTE.md`, `A-/B-/ab-` in dark and light).

## 1. The short version

- The bones are strong: pixel layers, pixel-perfect strokes, mirror, shade and dither inks, palette ramps, palette lock, RotSprite-style rotate, outline, tile mode and tilemaps, onion skin, a real-size Preview, Aseprite import (frames, tags, linked cels, palettes, tilemaps), artboards, and a sprite sheet export for Godot, Unity, Phaser, PixiJS, CSS and JSON.
- What is missing is **the story**. Nothing says "here are the four ways to make a sprite", the two rows in Export that decide the way are separate and confusing, and one of the four ways (artboards as frames of one sprite) cannot be exported as a sheet at all.
- Five things will trip up an Aseprite person in the first ten minutes: the bucket pours a different colour from the one you picked, no Alt eyedropper, no right-click colour, no brush-size keys, and a timeline that talks about "keys" and "holds".
- Delight is concentrated in onboarding and quests; the pixel flow itself is quiet. Quill can do much more here (section 7).

## 2. The walk: friction and unclear spots

Order followed: new pixel file, draw, animate, sheet, export. Severity: **B** blocks or surprises, **M** slows, **S** polish.

### New pixel file
1. **B** The New sheet offers "Game sprite" (64 x 64) and "Tiny sprite" (32 x 32) and that is all. Nothing says what you can make, nothing mentions artboards, frames, or sheets. `shots/01-new-sheet-today.png`
2. **M** Picking Tiny sprite lands you in the Draw layout with a greyed canvas and a modal asking whether to switch to Pixel. Fine once (it is remembered), but the first thing a new pixel person sees is a question about workspaces. `shots/02-pixel-switch-question.png`
3. **M** Starting lengths disagree: Tiny sprite is a 24-frame document, "Just a blank pixel grid" is 8 frames, the Doodle is 24. A single picture that is "frame 1 of 24" with a Preview "playing" 24 blank frames reads as broken (`shots/03-tiny-sprite-pixel-workspace.png`: Preview says "frame 17 of 24" over an empty picture).
4. **S** The status bar says "512 x 512 (32 x 32 pixels)" and zoom "69%". Pixel people think in art pixels and zoom like 800%. Aseprite's bar shows 32 32 and 100%/800% as screen pixels per art pixel.

### Draw
5. **B** **Colour model.** A swatch click sets Stroke; pressing G swaps to the Fill well, which is still the default yellow. I picked green, pressed G, clicked inside the ring, and got yellow. `shots/04-bucket-used-yellow-not-green.png` (an earlier first-hour fix brings the right well forward when you pick a tool, but only when the order is tool first, then swatch). Aseprite has one Foreground and one Background colour and every tool uses them.
6. **B** No temporary eyedropper: Alt while drawing does nothing in the pencil or brush (the code only uses Alt inside the Eyedropper tool, to pick from the active layer). Aseprite users press Alt a hundred times an hour.
7. **B** No right-click colour: the canvas ignores buttons other than the left (`engine.ts`). In Aseprite, right-click paints with the Background colour.
8. **M** No brush size keys at all (Aseprite: `+`/`-` size, `[`/`]` previous and next palette colour; Photoshop habit: `[`/`]` size). Size is the 1 to 8 buttons on the pixel bar.
9. **M** Pencil (P) and Brush (B) are two tools on a pixel layer that differ only in size. Picking size 3 on the pixel bar silently switches the pencil to the brush (`PixelBar.tsx`). In Aseprite there is one Pencil on B. In Frameling B is the brush and P the pencil, so the "Aseprite-like" set that puts the pencil on B makes the size buttons bounce you to another tool.
10. **M** Shift-click straight lines work, pixel perfect is on by default, mirror (Shift+M cycles off, left-right, up-down, both) works with a dashed axis. All good and not discoverable: the mirror button is a 4-icon cluster with no label.
11. **S** Palette panel is generous (ramps, starter palettes, lock to palette, reduce to palette) but is one of two competing "colour places" (Palette and Colours tabs). New people ask where the colour picker is.

### Animate
12. **B** The Pixel timeline speaks animator: diamonds are "keys", the pop-up is "Hold 24", and "Add a frame (hold one longer)" versus "New drawing here (new key)" versus "Copy this drawing to the next frame (duplicate key)". For a pixel artist a frame is a cell with a number. `shots/06-hero-sprite-timeline.png`
13. **B** At the default 1400 px width the add-frame buttons are not on the toolbar; they are in the overflow menu with long names. `shots/05-frame-buttons-hidden-in-menu.png`
14. **M** Clips are Aseprite tags and carry across from `.aseprite` files, but the lane is unlabeled at first, names clip ("dle"), and a clip has only a loop on/off: no reverse or ping-pong per tag (ping-pong is one global menu toggle).
15. **S** Onion skin exists (Shift+O) and is on the pixel bar; the bar wraps to two rows at 1400 px so it hides behind the second row.

### Sheet and export
16. **B** With more than one artboard the Export dialog shows **two** stacked rows for the way: "Which artboards" (This artboard / Each as its own file / All in order, as one / Packed onto one sheet) and, lower, "What's on it" (An animation / Separate sprites). Four by two combinations, and the plain-words question "what do I have?" is not asked. `shots/08-export-two-rows-for-artboards.png`
17. **B** "Artboards as frames of one sprite" cannot be a sheet. `All in order, as one` is disabled for Sprite sheet (`modeOff` in `src/artboards/export.ts`) and `Packed onto one sheet` makes each artboard its own animation. So way (b) works only as a GIF or video.
18. **M** The footer still describes the open artboard ("4 frames, 32 x 32 px") when exporting three boards; known and listed in `docs/artboards.md`.
19. **M** Artboards panel and "W / H" fields show 128 x 128 for a 32 x 32 sprite (document pixels, not art pixels). `shots/07-artboards-panel-128x128.png`
20. **S** In the light theme the board name above each artboard ("Idle") is pale orange on cream and nearly unreadable. `shots/10-light-theme-board-label.png`
21. **M** The Export dialog does start on Sprite sheet at Art size in the Pixel workspace (good, `pixelExportStart`), and the engine cards (Godot, Unity, Phaser, PixiJS) and the JSON/CSS options are clear. What is not clear is the frame-by-frame source of the sheet (above).
22. **M** There is no way in: Open takes `.frameling`, `.aseprite`, `.ase` only. Dropping a PNG, a GIF or an existing sprite sheet does nothing useful (PNG is only a palette source). Aseprite's Ctrl+I imports a sheet and slices it by grid.
23. No `.aseprite` export, so a team that shares with Aseprite users cannot go back.

## 3. Comparison with Aseprite and the others

Aseprite keys come from its `data/gui.xml` (1.3.18). "Ours" is Frameling's default today. The "Aseprite-like" set already in `src/ui/keymapSets.ts` (id `pixel`) covers about a third of this and mislabels itself.

| Habit | Aseprite | Frameling today | Verdict |
|---|---|---|---|
| Pencil | B | P (B is the brush) | Merge on pixel layers; B in the Aseprite set |
| Eraser, Bucket, Eyedropper, Line | E, G, I, L | same | Match |
| Rectangle / Ellipse | U / Shift+U | R / O (U is Polygon, Shift+U Star) | Remap in set |
| Marquee, Lasso, Wand, Move | M, Q, W, V | V select, Shift+L lasso, W wand; M free | Remap M, Q; Shift+M clash with Mirror |
| Contour, Polygon, Curve, Spray, Gradient | D, Shift+D, Shift+L, Shift+B, Shift+G | no contour, no spray; Dither is on Shift+B | Add Contour and Spray (low) |
| Swap colours | X | Shift+X swaps; X toggles Fill/Stroke well | Single Paint/Back model, X swaps |
| Temp eyedropper | hold Alt | missing | Add (blocker) |
| Right-click colour | Back colour | missing | Add (blocker) |
| Brush size | `+` `-`; `[` `]` change palette colour | no keys | Add both habits |
| Pan, zoom | Space drag; 1 to 6 zoom presets; Ctrl+0 fit | Space drag; Ctrl+1 actual, Ctrl+0 fit; no number keys | Add 1 to 6 in the set |
| Hide UI | Tab (timeline), Ctrl+H extras | Ctrl+Backslash hides panels | Add Tab in the set |
| Frames | Left/Right step, Alt+N new, Alt+B empty, Alt+M linked, Alt+D copy, Alt+C remove, Enter play, F3 onion | `,` `.` step, N / D / `=` / `-`; Enter play; Shift+O onion | Map in set; the `pixel` set has Alt+N, Alt+C, F3 only |
| Tags | one dialog, forward/reverse/ping-pong | clips, loop on/off | Add direction |
| Cel linking | linked cels (Alt+M) | a hold is a link; imported linked cels stay holds | Show it (striped cells) |
| Onion skin | F3, many frames either side | yes, with controls | Match |
| Pixel perfect | pencil option | on by default | Match |
| Symmetry | axis guides, drag the axis | 4 modes, centred only | Fine for now |
| Shading ink | Shading ink with palette ramp | Shade tool S along the palette ramp | Match; no Lock Alpha ink |
| Indexed palette | true indexed mode, ramps, sort | RGBA remapped: edit a swatch and the drawing recolours; lock to palette; Add ramp | Good enough, plain words are better than "indexed" |
| Rotate | RotSprite | Scale2x then nearest turn (RotSprite idea) | Match |
| Tiles | tilemap layers, Space+Tab tiles mode | tile mode, tilemap layers, tileset panel | Match |
| Slices | rect slices, 9-slice, pivots | none | Add (medium; engines use them) |
| Export sheet dialog | Layout, Sprite, Borders, Output tabs: rows/cols/packed, padding, trim, tags, JSON hash/array, split layers | engine cards, tidy/packed, padding, trim, extrude, dedupe, JSON, Godot scene | Frameling's is friendlier; lacks split layers/tags-as-files |
| Sprite sheet import | Ctrl+I | none | Add (high) |
| Preview window | F7, Shift+Enter plays, Fullscreen F8 | Preview panel, 1x/2x/3x/Fit, All frames or This clip | Good |
| New file | size, colour mode, background, Advanced | cards: Game/Tiny sprite, Custom | Needs the chooser |

Aseprite's own New Sprite and Export Sprite Sheet dialogs, for reference: `shots/aseprite-01-new-sprite.png`, `shots/aseprite-02-export-sheet.png`. Note Aseprite asks only size, colour mode and background, then trusts you: one sprite, frames on the timeline. That is way (d). It has no artboards, which is exactly why Frameling needs to explain (b) and (c).

**Others, briefly.** *Pixelorama* (Godot's pixel editor) keeps the timeline, tags and cel linking and shows cel thumbnails; its onion skin and palettes are the closest match to what we have. *LibreSprite* is the old Aseprite and keeps its keys. *Piskel* is the simplest: one canvas, a frame strip on the left (frames as numbered thumbnails, a big "+ Add new frame"), preview top right, export as sprite sheet or GIF. It is the best model for "frames you can see at a glance". *Pro Motion* is the one with multiple canvases and big palette tooling, closest to our artboards idea; it shows how a sheet is "assembled" from separate canvases. None of them tell you which way to work either, which is a chance for Frameling.

## 4. The four ways

Plain words first, the industry term second.

| | Plain name | Industry term | What it is | How to export |
|---|---|---|---|---|
| a | **One picture** | single-image sprite | One board, one frame: an icon, an item, a tile | PNG picture |
| d | **An animation** | timeline frames | One sprite, frames on the timeline, clips (tags) name the moves | Sprite sheet, a clip per animation |
| b | **Frames on boards** | artboards as frames | One board per frame, side by side, all play in order | Sprite sheet, one frame per board (missing today) |
| c | **Sprites on a sheet** | artboards as separate sprites | One board per sprite (hero, bat, coin), each may have its own frames and clips | Packed sheet, an animation per board |

Why four and not a mode switch: they are four honest answers to "what am I making?", and the file already supports a, c and d. It needs (1) a name for each, (2) a place to say which it is, (3) a way to move between them, and (4) the missing sheet export for b.

### 4.1 New-file entry points and the chooser
- Replace the two sprite cards with one **Pixel art** card that opens the Quill question. Mock A: `../ab/pixel-chooser/ab-dark.png` (light: `ab-light.png`).
- Each answer builds a ready document: a = one 32 x 32 board and the timeline folded; d = one board, 4 empty frames, a first clip "idle"; b = four 32 x 32 boards named Frame 1 to 4; c = three boards named Hero, Enemy, Item. Size chips (16, 24, 32, 48, 64, own) under the cards.
- Mock B (starters in the New sheet) is the same four cards without the extra step; the recommendation is A, with B's row used when the Quill step is switched off.
- Onboarding "Game sprites and pixel art" feeds the same chooser instead of dropping straight into the hero template. The hero sprite set stays under examples.
- The chosen way is stored as an optional `sprite.way` on the document (missing = inferred: one board and one frame is a, one board with more frames is d, several boards is b or c, asked when it is not obvious).

### 4.2 How the sheet export shows the mode
`../ab/pixel-sheet-mode/ab-dark.png`. One row, "Where the sprites come from", replaces "Which artboards" and "What's on it"; it is lit to match the file; a live "Your sheet" preview and a truthful footer. Option B is a Quill sentence plus a "Change how it is built..." link. "Separate sprites" (icons and tiles: every frame is a sprite) stays as an option under a: One picture with many frames, or as a fifth small card "Frames are separate items".

### 4.3 Switching later
- Command **Sprite > Change how this sprite is built...** (also the link in the Sprite panel and the chip menu). It names what will happen: "Turn timeline frames into boards", "Turn boards into timeline frames", "Make this one picture an animation".
- Conversions, all one undo step: d to b (each frame becomes a board in order), b to d (each board becomes a frame; sizes must match, else it says which board is different), a to d (nothing changes, the timeline appears), c is never converted to; you add boards.
- Quill notices: adding a second board to a one-picture file asks "Two boards! Are these frames of one sprite, or two different sprites?" (a registered choice, asked once then remembered); adding a second frame to a one-picture file just shows the timeline: "A second frame! Now it moves."

### 4.4 What the canvas, timeline and boards show
`../ab/pixel-ui-modes/ab-dark.png`.
- a One picture: timeline folded to a slim bar with a "Make it move" button; Preview shows 1x with Quill for scale.
- d An animation: timeline in its frames form (section 5.3), Preview playing, clip chips.
- b Frames on boards: the Artboards panel in front, boards numbered 1, 2, 3 on the canvas, board strip with thumbnails instead of the timeline, Preview plays boards in order.
- c Sprites on a sheet: boards named and labelled, each has its own timeline, a Sheet preview tab showing the packed result as it will export.
- Chip in the pixel bar always says which one it is; clicking it opens the change menu. Mock B is the Sprite panel alternative.

## 5. Other design changes (with mocks)

### 5.1 One Paint colour and a Back colour
`../ab/pixel-colours/ab-dark.png`. In the pixel workspace a single Paint (front) and Back (behind) well at the top of the Palette; swatch click sets Paint, X swaps, right-click paints Back, Alt picks. Fill and Stroke stay in Draw. Fixes friction 5 to 7 together.

### 5.2 Aseprite keys
`../ab/pixel-keys/ab-dark.png`. Today there are three sets: Frameling, Flash, "Familiar from pixel tools (Aseprite-like)". Proposal: rename the third **Aseprite** and complete it (list in section 6), keep names familiar first ("Pencil", "Eyedropper", "Swap colours", "Add frame") with ours in brackets in the shortcut list. A one-time Quill question on the first pixel file picks it (mock A) and Preferences > Keyboard shows cards (mock B). Recommend both.

### 5.3 A frames timeline for pixel
`../ab/pixel-timeline/ab-dark.png`. Numbered cells, "+ Frame" and "Copy frame" always visible, a "Tags" lane with named, coloured tags (with a loop mark and later a direction), linked cels shown striped, a tip line. Only in the Pixel workspace; Draw and Animate keep keys and holds. "Hold" becomes "Show for N frames" in plain words.

## 6. Aseprite comfort

### 6.1 The "Aseprite keys" set
Familiar names first. Everything not listed keeps our key.

| Command | Aseprite key |
|---|---|
| Pencil (one tool, with size) | B |
| Eraser, Bucket, Eyedropper, Line | E, G, I, L |
| Rectangle, Ellipse | U, Shift+U (Star and Polygon move to Shift+D and Shift+P) |
| Select box, Elliptical select, Lasso, Magic wand, Move | M, Shift+M, Q, W, V |
| Mirror drawing | Shift+Alt+M (Aseprite has no key for it; Shift+M becomes its elliptical marquee) |
| Swap Paint and Back | X |
| Previous / next palette colour | `[` `]` |
| Brush size down / up | `-` `+` |
| Temporary Eyedropper | hold Alt |
| Zoom presets | 1 to 6; Ctrl+0 fit |
| Hide panels | Tab |
| Previous / next frame | Left, Right |
| New frame, empty frame, linked frame, copy frame, remove frame | Alt+N, Alt+B, Alt+M, Alt+D, Alt+C |
| First / last frame, play | Home, End, Enter |
| Onion skin | F3 |
| Pixel grid | Ctrl+Shift+' |
| Export, repeat export | Ctrl+E, Ctrl+Shift+X |
| Canvas size, flip | C, Shift+H / Shift+V |

### 6.2 Missing tools and habits, ranked by value
1. Alt temporary eyedropper (tiny).
2. Right-click paints Back (small).
3. Brush-size keys and palette-colour keys (tiny).
4. One Pencil on pixel layers (small).
5. Import a PNG, GIF or sprite sheet, slicing by grid into frames or boards (medium; Ctrl+I, drop a file).
6. Tag direction: forward, reverse, ping-pong per clip, carried into the sheet JSON (medium).
7. Lock Alpha ink and a "colour under cursor" readout (small).
8. Slices (pivots, 9-patch) shared with Godot/Unity (medium).
9. Contour tool and Spray (small each).
10. Export back to `.aseprite` (medium, only if asked).
Not needed: indexed colour modes (the remapped palette does the job), grayscale mode.

## 7. Delight

### 7.1 Quill moments in the pixel flow
Style of `src/ui/mascot/lines.json`: short, warm, a little joke, never preachy. Each is a bubble or toast; most fire once.

| Where | Line |
|---|---|
| Chooser heading | "Pixel time! What are we making?" |
| Chooser, not sure | "Not sure? Pick An animation. You can switch any time and nothing is lost." |
| Pick One picture | "One lovely picture. Simple and sweet!" |
| Pick An animation | "Frames on a timeline, just like you know it." |
| Pick Frames on boards | "Every frame gets its own little board. Tidy!" |
| Pick Sprites on a sheet | "A whole cast on one sheet. I will hold the coin." |
| First pixel, empty grid | "Click a colour, click the grid. That is pixel art!" |
| First Alt-eyedropper | "You held Alt: that is the eyedropper. Aseprite habits welcome here!" |
| First pixel-perfect fix | "No double corners. Crisp!" |
| Second frame in a one-picture file | "A second frame! Now it moves." |
| Second board in a one-picture file | "Two boards! Are these frames of one sprite, or two different sprites?" |
| Open an `.aseprite` file | "An Aseprite file! I will be gentle. Your original is never touched." |
| Sheet exported for Godot / Unity / Phaser | "Sheet baked! Godot is going to love it." (engine name varies) |
| Sheet with 100 or more frames | "That is a lot of frames. Someone has been busy." |
| Idle in the pixel workspace for a while | Quill dozes on the Preview corner (the existing sleep animation) |
| Quest cheers | existing `quests.praise` pool plus "Chunky!", "Crisp!", "Pixel-perfect (literally)." |

### 7.2 Cute touches
- **Quill for scale**: a toggle in the Preview that stands a 48 px Quill next to your sprite at 1x so you feel the size. Hover: "I am 48 pixels tall. How tall are you?"
- Swatches wiggle when you pick them; the Paint well does a little pop when X swaps.
- Sheet export plays a one-second "baking" animation (the grid fills in cell by cell) and a pixel confetti burst on first export.
- A palette "uses N colours" line with a tiny heart at 4, 8, 16 ("a perfect little palette").
- Empty board labels read "Board 1", "Board 2" instead of "Artboard 1".
- The mode chip uses a tiny drawn icon per way (one square, a strip, boards in a row, a grid) in the brand grape.

### 7.3 Quests, one per way
Each is 3 to 4 minutes, with a badge and a "show me how", built on the existing engine (`src/quests/`).
- **One tiny picture** (a, badge "Icon Maker", mint): draw a 16 x 16 heart, add a Back colour, export as a PNG.
- **Flipbook** (d, the current Pixel pal quest, badge "Pixel Pal"): keep it, add the frames timeline and a named tag "idle".
- **Board by board** (b, badge "Storyboarder", sky): draw three frames on three boards, Play all in order, export a sheet.
- **A cast on one sheet** (c, badge "Sheet Master", sunny): make Hero and Coin boards, pack them, export for Godot.
- **Coming from Aseprite** (badge "Cross-Platform", grape): the key set, open a `.aseprite` file, spot the Alt eyedropper.

## 8. Ranked build plan

Effort: S under a day, M one to two days, L three days or more. Each piece ships alone.

| # | Piece | Fixes | Effort |
|---|---|---|---|
| 1 | One Paint / Back colour in the Pixel workspace: swatch sets Paint, G never switches wells, X swaps | 5 | M |
| 2 | Aseprite habits: Alt temporary eyedropper, right-click paints Back, `+`/`-` size, `[`/`]` palette colour, 1 to 6 zoom, Tab hides panels | 6, 7, 8 | M |
| 3 | Aseprite keys set (rename and complete the `pixel` set) plus the ask-once question | 9 | S |
| 4 | Pixel units in plain words: zoom as 800%, "32 x 32" in the Artboards panel and W/H, light-theme board label contrast | 4, 19, 20 | S |
| 5 | Defaults: one picture starts at 1 frame, animation at 4, consistent lengths, Preview hidden for one picture | 3 | S |
| 6 | Export unified "Where the sprites come from" row with sheet preview and a truthful footer | 16, 18 | M |
| 7 | Sprite sheet from boards as frames (the missing way b) | 17 | M |
| 8 | Sprite way: optional `sprite.way` field, New sheet "Pixel art" card with the Quill chooser, the four ready documents, onboarding link | 1, 2 | M |
| 9 | Frames timeline for the Pixel workspace (numbered cells, visible + Frame, Tags lane) | 12, 13, 14 | L |
| 10 | Mode chip and Sprite menu; adaptive layout per way; conversions d to b and b to d | 4.3, 4.4 | L |
| 11 | Import PNG, GIF and sprite sheets (slice into frames or boards), drop a file | 22 | M |
| 12 | One Pencil on pixel layers (merge Pencil and Brush) | 9 | S |
| 13 | Quill lines, Quill for scale, baking animation, three new quests | section 7 | M |
| 14 | Tag direction (reverse, ping-pong) in clips and sheet JSON | 14 | M |
| 15 | Lock Alpha ink, Contour, Spray, slices | section 6.2 | S to M each |

Items 1 to 5 are small, take most of the sting out, and need no format change. Items 6 to 8 are the "four ways" core. The L items are the biggest delight and clarity wins but depend on 8.

## 9. Decisions for the user (each with my recommendation)

1. **Chooser**: A (Quill step) or B (starters in the New sheet)? *Recommend A, B's row as the fallback when Quill is off.* `../ab/pixel-chooser/`
2. **Names**: One picture / An animation / Frames on boards / Sprites on a sheet? *Recommend yes, industry terms as the small second line.*
3. **Sheet export**: A (four cards in Export) or B (Quill sentence and a link)? *Recommend A, with B's sentence as the summary line.* `../ab/pixel-sheet-mode/`
4. **Mode display**: A (chip and adaptive layout) or B (Sprite panel)? *Recommend A now, the panel later if people want it.* `../ab/pixel-ui-modes/`
5. **Colours**: Paint and Back wells (B) in the Pixel workspace? *Recommend yes; Draw keeps Fill and Stroke.* `../ab/pixel-colours/`
6. **Timeline**: numbered frames in the Pixel workspace (B), keys and holds elsewhere? *Recommend yes.* `../ab/pixel-timeline/`
7. **Keys**: ask once (A), a picker card (B), or both? *Recommend both; the ask uses the existing ask-the-first-time system.* `../ab/pixel-keys/`
8. **Merge Pencil and Brush** on pixel layers into one Pencil with a size? *Recommend yes.*
9. **One picture hides the timeline** (folded, with "Make it move")? *Recommend yes.*
10. **Store the way** as an optional `sprite.way` field? *Recommend yes, inferred when missing so old files open unchanged.*
11. **Build "boards as frames" sheet export**, so way b exports as a sheet? *Recommend yes (piece 7); without it, way b is GIF and video only.*
12. **Zoom and sizes in art pixels** ("800%", "32 x 32") in the Pixel workspace? *Recommend yes.*
13. **Quill for scale** in the Preview? *Recommend yes, off by default for people who turned Quill off.*
14. **Export to `.aseprite`** to round-trip with teammates? *Recommend not now; ask again after import of PNG and sheets ships.*
15. **Aseprite spray on Shift+B** (Dither today)? *Recommend keep Dither on Shift+B in both sets and add Spray unbound.*

## 10. What is mock and what is real

Real: every screenshot under `shots/` and the full-window screens inside the A/B images (taken in the built app under xvfb). Mock: the chooser, the Export row and banner, the mode chip, the Sprite panel, the pixel timeline B, the Paint and Back wells, the key dialog and set cards. They are injected into the real page, so they use the app's CSS, fonts and tokens; they have no behaviour. Quill is the real sprite sheet (`public/mascot/mascot.png`). The throwaway scripts that made them are not committed.
