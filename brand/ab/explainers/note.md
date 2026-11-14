# Fewer explainers, and the Export cards

Before = `development` as it stood (explainers on show, Export cards overlapped). After = this branch, with "Show the
explanations" off (what someone who was already here gets; a new person still starts with them on, so their view is the
"before" one). All crops are of the real app, dark and light.

- `artboards-before-*` / `artboards-after-*`: the Artboards panel. Two paragraphs and four lines before you reach a
  button, against the controls only. The words moved to the ? on the title bar and on **Variations (linked copies)**.
- `brush-before-*` / `brush-after-*`: the brush options, with More brush options open. The four lines under controls
  are now a small ? beside each name.
- `export-before-*` / `export-after-*`: the Export window. Before, the format descriptions ran under the options column.
  After, they wrap in their cards. The "what this choice means" notes sit behind the ? at the top of the options; what
  this export will do (the see-through warning, what carries over) stays on show.
- Help picture for the feature: `public/help/explanations-dark.png` and `-light.png` (the ? on Variations, tip open).

The no-wrap check now also fails on a control sitting on top of another one. Run on `development` it found the Export
cards; the Help contents cards and the Preferences keyboard rows (at 200% interface size) had the same fault, and the
section headings let their name run under the ? icon. All five passes now read 0.
