# Brush library, round two: a dropdown picker

You turned down the four round-one layouts and asked for a visual picker, probably a dropdown, with two Photoshop
pictures as the brief. This is that: one button in the Brush options that drops a panel with the live controls on top,
a search box, groups with counts, and every brush as a row with a stroke sample across it. Card: `brush-library-scale`.
Round one is untouched in `brand/ab/brush-library/`.

Every picture is a crop of the real Frameling window (1400 x 900, dark and light), shot with the scratch component in
`src/brushes/mock/Picker.tsx`, loaded only with `?debug`. It uses the real controls (the Size and Smoothing sliders and
the Save as, Update and Revert buttons from `src/canvas/controls.tsx`), the real stroke drawing (`buildStroke` and
`drawShape`, the same as the brush preview) and the real theme tokens. The library is made up: the four real starters
plus 150 pretend brushes in 12 groups. Nothing is saved. The only thing drawn outside the app is the caption strip and
the gaps in each sheet (`scripts/ab/brush-library-v2-sheets.py`); the raw single shots are in `raw/`.

How they were made: `npx vite build --outDir <scratch>`, then `SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx
electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-picker --renderer <scratch> --out brand/ab/brush-library-v2/raw`.
The entries (`scripts/docs/ab-brush-picker/mockups.cjs`) open a blank vector document, pick the Brush tool, set the
mock through `__brushMock.set(...)`, click the button, type into the search box or drag the grip, and take the shot.

## What is in the panel

Top to bottom: the live controls (a round tip preview, Size and Smoothing, so you can nudge a brush while you look at
the list), a search box with three small buttons (fold or open every group, change how the rows look, save the brush
you are using), then the list, then a Row size slider. The list starts with Favourites and Recent, then a small
"All brushes 154" label, then the groups (My brushes first, then Starters, then the rest), each with a count and a dot
on the one your brush is in. Typing in the search box swaps the list for a flat "17 found" list with each brush's group
beside its name. The brush you are using has the yellow row and its sample follows the sliders live. With 8 brushes or
fewer there is no search box and no groups, only the rows. The panel closes when you pick, press Escape or click away.

## Pictures

- `1-picker.png`. **The dropdown picker**, five states, dark above light. Four brushes: the controls and four rows,
  nothing to walk through. 154 brushes: one group open (your brush's group, open by default), Recent open, every group
  folded (the whole library's shape in one glance, 13 groups), and typing "pen". Raw: `raw/main-small-open-*`,
  `main-large-open-*`, `main-large-recent-*`, `main-large-folded-*`, `main-large-typing-*`.
- `2-rows.png`. **Three rows to choose between**, the same 154 brushes and the same group open in each, so only the
  row differs. This is the real decision. Raw: `raw/row-sample-*`, `row-tip-*`, `row-two-*`.
  - **R1, stroke only.** One wide sample per row, no name; the name of the brush under the mouse (or the one in use)
    shows on a line under the list. The densest single column and the purest "pick by what it draws", but you cannot
    read a name you want without hovering, and nothing else on the row to tell two similar brushes apart.
  - **R2, tip, stroke and name.** Closest to your reference: a round tip with its size under it on the left, the stroke
    sample across the row, the name under the sample, a star on favourites. Each row is about 60px, so about five rows
    show at the default panel height. Names are readable at a glance and the tip column is where a textured or shaped
    tip from `fn-brush-tips-textures` will show itself.
  - **R3, two columns.** A smaller sample with the name and size under it, two to a row: twelve brushes on screen
    against five. Names get half the width (long ones are cut short), and the strokes are shorter, so it suits a
    wide panel and a big library.
- `3-resized.png`. **Dragged bigger.** The grip in the bottom-left corner stretches the panel left and down (it hangs
  off the right-hand dock, so left is the way it has room), here to about 560 x 760 with the two-column rows. Raw:
  `raw/main-large-wide-*`. The Row size slider along the bottom makes every sample taller or shorter.
- `4-button-at-rest.png`. **The button when the panel is shut**, which is what sits in the Brush options all the time.
  It replaces the chip row. It shows a small stroke of the brush you are using (drawn live, so it follows the Size
  slider), the brush's name in bold, and under it the group and how many brushes there are ("Inking · 154 brushes", or
  just "4 brushes" for a small library). A small arrow on the right says it opens. When you have changed a brush since
  you picked it, a dot appears beside the name, and Update and Revert join Save as underneath, exactly as the chips do
  today. Raw: `raw/rest-small-*`, `rest-large-*`, `rest-large-changed-*`.

## Recommendation

**The dropdown, with R2 (tip, stroke and name) as the default row, and the two-column look a button away in the
toolbar** (the middle icon cycles the three rows, and the choice would be remembered). Why: you want to pick by
seeing what a brush draws, and R2 puts a big live sample on every row while keeping the name readable, which R1 cannot.
R3 is the better use of a very big panel, so it earns a place as a choice, not as the default. Two details I would
keep: folding every group so 154 brushes are 13 lines, and Favourites then Recent above the groups so the brush from a
minute ago is one tap down. I would use the same dropdown for four brushes as for 400, instead of the chip row for
small libraries: the button already shows what the brush draws, and a four-row panel is no walk at all.

## Not decided here, and honest limits

- The dial is only a tip-size preview; Frameling brushes have no angle or hardness yet, so those two Photoshop controls
  are not copied. Smoothing stands in for the second slider.
- The made-up brushes differ in size, pressure and pointy ends only. Textured or spattered samples, like your second
  reference, wait on `fn-brush-tips-textures`; the sample is drawn by the same stroke code, so they will show up.
- Keyboard (arrows through the rows, Enter to pick, a key to focus search) and drawing only the open groups' rows
  (so 400 brushes stay quick) are build work, not mocked.
- The old round-one mocks are still in `src/brushes/mock/` (layouts A to D) and were extended, not replaced: the new
  picker is layout `P` there. They all come out when the real picker is built.
