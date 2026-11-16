# Brush library at scale: mockups

Four layouts for the saved brushes, each shot with a small library (the 4 real starters) and a large one (154 made-up
brushes in 13 groups), in both themes. Card: `brush-library-scale`.

## Pictures

One sheet per layout (dark above, light below), and the single shots they are made from in `raw/` as
`<layout>-<small|large>[-open|-typing]-<dark|light>.png`.

- `a-chips-and-drawer.png`. **A, chip row with a drawer.** Four brushes: today's row exactly, nothing new on screen. 154: favourites and recent as chips plus an "All 154 brushes" chip that opens a drawer with search, group pills and the group's chips. Gets right: the small case is untouched and the big case is one tap from the thing you used a minute ago. Costs: the drawer pushes the sliders down while open, and chips tell you nothing about what a brush does.
- `b-brushes-panel.png`. **B, a Brushes panel with folders, list and search.** Stroke samples in a list, folders with counts, search on top, docked under Tool options. Gets right: the most room, the best browsing, the natural home for rename, move and delete. Costs: a whole panel for four brushes (the small picture shows how empty it feels), the options column loses height, and picking is a trip to another panel.
- `c-popover.png`. **C, pop-over on the brush button.** One button with a stroke sample, name and count; it opens a grid of stroke cards with a search box and Recent / Favourites / group tabs. Gets right: no permanent screen space, and the stroke cards are the easiest to choose from by eye. Costs: every pick is two taps, even with four brushes (see "Small: 4, open"), and nothing is visible at rest except the current brush.
- `d-find-and-recent.png`. **D, find box plus recent chips (my own).** No drawer and no groups: a search box and one short line of favourites and recent; typing swaps the line for matches. Gets right: the smallest change, fastest for someone who knows the name, keyboard friendly. Costs: it cannot be browsed, so a new pack's brushes stay unseen until you search for them.

## Protects the small library best

A, and D (which falls back to A's row for 8 brushes or fewer). Both show the plain chip row with no extra click.
C is the worst for it: it hides four brushes behind a button.

## Recommendation

Build A, and give its drawer D's search box (it already has one) so typing works without opening groups first. Show the
whole row when there are 8 brushes or fewer; above that, favourites and recent plus the drawer. Offer C's stroke-card
grid later as a view switch inside the drawer, and B only if brush packs grow into folders of their own.

## How the pictures were made

All shots are the real built app (Electron under xvfb, `?debug`), light and dark themes of the real UI, cropped
(`scripts/docs/help-media.cjs`, entries in `scripts/docs/ab-brush-library/mockups.cjs`). The layouts do not exist in the
app: they are scratch components in `src/brushes/mock/`, only reachable with `?debug` through `window.__brushMock`
(`src/brushes/debug.ts`), swapped in for the real row by a small slot in `BrushPresetRow`. They use the real chip
styles, real controls, real stroke drawing and the real dock (B's panel is a real dock panel). The library is invented
(`src/brushes/mock/library.ts`); with 4 it is the real starters. Nothing is saved and nothing was drawn in an image
editor. The only things added afterwards are the title and caption strips and the gaps between shots, laid by
`scripts/ab/brush-library-sheets.py`. To redo: `npm run build`, then
`SHOT_SHOW=1 xvfb-run -a -s "-screen 0 1600x1000x24" npx electron scripts/docs/help-media.cjs --entries scripts/docs/ab-brush-library --out brand/ab/brush-library/raw`
and `python3 scripts/ab/brush-library-sheets.py brand/ab/brush-library`.

## Research notes

What others do, and how sure I am.

- **Procreate.** Brush Library is two panels: sets on the left, the chosen set's brushes on the right. Recents (up to
  eight) and pinned favourites at the top, custom sets you make and drag brushes between; default sets can be copied but
  not changed; the newer Dreams app adds search over brushes, sets and libraries. Sure (official handbook). Common
  complaint, from my own knowledge and not checked: imported packs pile up as sets and need hand sorting.
- **Photoshop.** The Brushes panel has groups and sub-groups, a search box, and thumbnail sizes from list to large.
  Sure about groups, search and views (Adobe community posts, which also show years of requests for better folders and
  tags first). Unsure how far search reaches into sub-groups.
- **Krita.** Brush presets docker with a tag drop-down, a search filter that matches names and tags, and several tags
  per brush. Sure (official docs). KDE wiki notes say large collections need better tag management and type-to-search
  on the tag list. The usual complaint is that tags are fiddly to assign, so people live in "All" and scroll.
- **Illustrator.** Brush libraries open as separate panels per pack, with a menu to switch and a Brushes panel with
  list or thumbnail views. From my own knowledge, not searched: no search in the Brushes panel for a long time, and
  hundreds of brushes in one panel is a known pain. Unsure of the current state.
- **Clip Studio Paint.** Sub tools are grouped under a tool and categories, with a tool-property palette and
  downloadable materials. From my own knowledge, not confirmed by my searches: sub-tool groups act as folders, search
  is limited. Treat this one as unverified.

Ground rules that come out of all of them:

1. Few things should look like few things. Do not show structure (folders, tabs) until the count earns it; around 8 is
   about where one row stops working.
2. Search is not optional past a few dozen, and it must match words anywhere in the name and across groups.
3. Recent and favourites are where most picks come from, so they sit first and need no digging (Procreate's eight).
4. Groups beat a flat list; a brush in one group at a time, with counts so empty or huge groups are visible.
5. Show what a brush does, not only its name: a stroke sample beats a dot. Cheap to draw, costly in space, so a size
   switch (list, grid) helps.
6. Keep the pick and the manage jobs apart. Choosing must be fast; rename, move and delete can live one step away.
7. Never move things under the person's hand: the favourites line should not reshuffle as they work (recent excepted,
   and then only by what they picked).
8. Keyboard: type to search, arrows to move, Enter to pick; the existing step-brush commands keep working.
