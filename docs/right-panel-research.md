# The right side: how other editors keep panels findable

The problem (12 Nov 2026): Frameling's right zone holds 15 panels as tabs. At the default width only Tool options and
Colours show; the other 13 sit behind a "+13" button as an unlabelled list. People can't find things, and can't tell
what's there without opening the list.

## Interactives (same author)

`interactives-editor/src/panels/Inspector.tsx`, `components/ui.tsx` `Section`, `lib/prop-search.tsx`, `components/Dock.tsx`.

- **One Properties panel for the selection.** Its sections change with what's selected (a rectangle, some text, the page,
  several pages). You never go looking for "the text panel": select text and its section is there.
- **Collapsible sections, remembered.** Each section header folds; Alt-click leaves only that one open; right-click folds
  or unfolds all. Open/closed is remembered per section.
- **Sections can be reordered per selection type** (drag the header, or Alt+Up/Down), so a person's most-used section
  floats to the top.
- **Search inside the panel** (`/` or Ctrl+F): matches field labels, synonyms and tips; unmatched sections hide while
  searching and every matching section opens.
- **One-line blurb under a section** with "More about X" into the help, held to a length budget by a test.
- **Every panel has a one-line `tip`** ("The settings of the selected layers, or of the page and project") used in
  tooltips and the panel list. An "Essentials" workspace puts rarely used panels away until something asks for them.

What it does well: the right side answers "what can I change about this thing?" without the person knowing panel names.

## Adobe Illustrator

- **Properties panel** (the Essentials workspace default): context-sensitive. With nothing selected it shows document
  settings; with a path selected it shows Transform, Appearance (fill, stroke, opacity), Align; with text, Character and
  Paragraph. Each section ends in **Quick Actions** (the two or three buttons that matter for this selection) and a
  "..." that opens the full panel.
- **Collapsed panel groups as an icon strip with names.** Panels can collapse to icons, and the strip can be widened so
  each icon shows its name. Clicking one opens it as a flyout beside the strip, which closes when you click away.
- **Window menu** lists every panel with a tick; **workspaces** (Essentials, Essentials Classic, Painting, Typography...)
  pick a set. Essentials keeps few panels visible on purpose.

What it does well: a beginner lives in Properties and never sees most panels; experts still have them one click away.

## Linearity Curve (Vectornator) and Vectorcraft-style tools

- **Inspector with fixed tabs** (Style, Arrange, Path) and inside each a **single scroll of labelled sections** that
  appear only when they apply. Section headers have a fold chevron.
- Assets, layers and libraries live **outside** the inspector (left side or a separate button), so the right side is only
  "this thing's settings".

## Figma

- The right sidebar is **one scroll of sections** for the selection: Layout, Position, Fill, Stroke, Effects, Export.
  Empty sections show just a header with a **+**, so you can see that "Effects" exists even before adding one.
- No tabs to hunt through; libraries and assets are on the left.

What it does well: empty sections still show their name, so people learn what's possible.

## Affinity (Designer, Photo)

- **Studio panels** dock in groups with tabs, but a **context toolbar** across the top carries the current tool's
  options, so the panels don't have to. Studio presets save arrangements.

## Krita

- **Dockers** can be stacked in one column, each with a title bar that folds, or tabbed together. Settings, Dockers lists
  every docker with a tick. Workspaces swap the whole set.

## Patterns worth taking

1. **Answer "what can I change here?" in one place** (Interactives, Illustrator, Figma, Curve): a context inspector with
   sections for the selection and tool.
2. **Labels, not just icons** for anything rare (Illustrator's labelled strip, Figma's section names).
3. **Show that a section exists even when it's empty** (Figma's header with +), so the panel teaches what's possible.
4. **Fold, remember, never hide off-edge** (Interactives, Krita).
5. **A list of every panel with a sentence each** (Window menu, Interactives' tips) for the rare ones.
