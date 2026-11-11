# Frameling, round 3: brief and exploration

Round 1 (flipbook page with a face, onion-skin blob, frame caterpillar) and round 2 (five caterpillars) are both
rejected, and the note was "back to square one" and "make them look human designed, not ai". So round 3 starts from
zero: no caterpillars, no pages with faces, no blobs, none of the old shapes.

## What the mark has to say

- **Frames.** Frame-by-frame animation is the core idea. A frame, a strip of frames or a grid of frames should be part
  of the creature's body, not a prop stuck on beside it.
- **Motion.** The pose implies movement (leap, dash, flap, scuttle). Nothing sits centred and static.
- **Drawing.** Something in the picture is being drawn, or is made of drawing tools or drawings.
- **Pixel and vector.** The app does both, so at least some concepts should wear that duality openly.
- **Friendly and easy to learn.** Warm, a bit whimsical, never corporate. A character with an attitude, not a smiley.
- **Ownable.** Not another generic mascot. The frame idea should be the reason the animal is that animal.
- **Works small.** It has to survive as an app icon at 16 px, on dark and light.

Palette is limited to sunny `#ffc94a`, peach `#ff9e6d`, rose `#ff6f91`, grape `#9b7bff`, sky `#5ab8ff`, mint `#4fd1a5`,
ink `#1d1b26` and paper `#fffaf0`. No gradients, no gloss highlights.

## 16 directions (see `thumbnails.png`)

1. **Hatchling.** A chick-ish creature bursting out of one cell of a sprite sheet.
2. **Banded roller.** Armadillo whose shell bands are film frames.
3. **Trailing firefly.** A firefly that leaves a trail of fading frames behind it.
4. **Film-tail fox.** Fox whose tail is a strip of film.
5. **Reel owl.** Owl with film-reel eyes.
6. **Tiny animator.** A small beret-wearing animator carrying a giant pencil.
7. **Half-pixel cat.** Cat that is smooth vector in front and stepped pixels behind.
8. **Walking pencil.** A pencil on legs, mid-stride.
9. **Inkwell critter.** An ink pot with a quill for a tail and little feet.
10. **Zoetrope.** The spinning slit drum as a character.
11. **Between-frame imp.** A gremlin that lives in the gap between two frame corners.
12. **Hopper frog.** A frog caught mid-hop across three ghost frames.
13. **Frame-shell crab.** Hermit crab that carries a picture frame as its shell.
14. **Pencil hedgehog.** Hedgehog whose quills are coloured pencils.
15. **Pixel-edge moth.** Moth with one smooth wing and one wing dissolving into pixels.
16. **Triple-wing bird.** Hummingbird with its wings shown as three onion-skin frames.

## Silhouette review

Drawn as solid black at thumbnail size. What survived and what did not:

- **Crab (13), hedgehog (14), moth (15), armadillo (2), fox (4)** read instantly, are different species and have
  different outlines (frame on a back, spiky fan, two-tone wings, dome, big curling strip).
- **Owl (5)** reads well but is the most generic animal on the sheet, and film-reel eyes are a one-note joke. Cut.
- **Tiny animator (6), pencil (8), inkwell (9), zoetrope (10), imp (11)** are all readable but object-characters and
  tiny people tend to turn into clip-art, and none of them says "frames" without a label. Cut.
- **Cat (7)** is a good idea but the silhouette is just a cat with stairs. Folded into the moth, which does the
  pixel/smooth split better.
- **Frog (12), firefly (3), bird (16), hatchling (1)** go to mush in silhouette, and the ghost-frame hop is too close
  to round 1's onion skin. Cut.

### The five picked

| # | Name | Why it is strong |
|---|------|------------------|
| 1 | **Rollo** (armadillo) | The dome silhouette is unmistakable, and an armadillo's bands are already a row of cells, so the frame idea is built in. A sun rising across the windows shows the animation, and the last window is still empty. |
| 2 | **Foxtrot** (fox) | The biggest, simplest shape on the sheet: a curling film-strip tail you can read from across a room. Leaping gives motion for free. |
| 3 | **Quill** (hedgehog) | Quills being coloured pencils is the cleanest "drawing" idea, and the fan shape is a great app-icon silhouette. Most approachable of the five. |
| 4 | **Flit** (moth) | The only one that says "vector and pixel" in a single body. One wing is smooth, the other crumbles into squares. |
| 5 | **Tuck** (hermit crab) | The best "frame" metaphor: the creature carries a picture frame home like a shell, with a tiny vector-plus-pixel picture inside. The most ownable silhouette. |

## Craft rules used on all five

- Beziers for every body part, not primitives. Line weight varies on purpose: heavy 8 to 9 outer outlines, 5 to 6 on
  details and 3 to 4 on hatching and veins.
- Deliberate asymmetry: eyes of different sizes with different lids (one half-closed on Tuck, Flit and Foxtrot's brow
  raised), mismatched pencil lengths, a right wing that is not the mirror of the left, tails that curl one way.
- Flat fills only. Depth comes from a single ink overlay at 14 to 18 percent opacity under the body.
- Poses are anticipation, action and settle, made by moving rigid parts (legs, claws, wings, head, tail curve) and
  squashing the body, not by redrawing.
- Pixel versions are 32x32, hand-placed in small blocks with an outline pass, and use only palette colours.
- Icons: each concept has its own bright squircle (rose, grape, sun, sky, mint) so nothing sinks into the dark
  `#17151f` background, plus a chunkier `-icon16.svg` with the detail removed, used at 32 and 16 px.

Generator scripts are in `src/` (Python, standalone) if any of the five needs to be re-posed.
