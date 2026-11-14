# Toolbar customising: the shapes, side by side

Every picture is the tool rail cropped from the real app (Draw workspace, Bouncing ball), dark and light. Only the first set
is the app as it is. The rest are **mock-ups**: the real rail with the extra bits painted on by `make-mockups.cjs` in this
folder, because none of it exists yet. Nothing here is product code.

## Today (real, no mock-up)

- `0-today-rail-dark.png`, `0-today-rail-light.png`: **Shapes** has been renamed **Blocking** and the Star has been moved to
  a group of its own. Look at the rail: you can't tell. The names live only in a tooltip on the thin line and in the move
  menu, so a rename you make is invisible.
- `0-today-menu-dark.png`, `0-today-menu-light.png`: the menu on a tool. It already moves a tool to any group or a new one,
  and renames the group. It also says **Move to Group 7** for a group nobody named, and **Reset tools to default** twice
  (once in the tool part, once in the Tools part).

## A: Names and dividers (the smallest honest version)

`A-names-and-dividers-dark.png`, `A-names-and-dividers-light.png` (mock-up). Every group shows its name above it, so a
rename shows. A group you make and don't name is just a divider line, with no heading and no "Group 7". The tool menu gets
**Start a new group here** (a divider before this tool) and **Join the group above** (take the divider away). Long usual
names are cut short in the picture ("Colour an..."): they want shorter ones, which the `tool-groups` card already plans.
The headings cost about 100 px of height: the Star falls off the bottom of a 900 px window.

## B: Tidy (recommended: A, then these two)

`B-tidy-dark.png`, `B-tidy-light.png` (mock-up). A, plus **Hide this tool** (a quiet "3 hidden" chip at the foot of the
rail brings them back) and **Fold this group into one button** (the Select group is folded here: one button with a dot,
press and hold for the rest, the way the stacked style already works, but for one group instead of all of them). One
**Put the tools back** undoes the lot.

## C: Builder (the full thing, not recommended)

`C-builder-dark.png`, `C-builder-light.png` (mock-up). An edit mode with a tray: a "put away" shelf, a row of things to add
(divider, heading, gap, group), button size, show or hide names, rail style, Done. It can do everything on the card. It is
also a settings screen sitting on top of the canvas, and a tool in two places breaks things the rail relies on (a tool id is
unique in the page, in the arrangement, in the drag, in the front-tool memory and in the quests that point at tools).
