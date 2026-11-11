# Right side: three ways to keep panels findable

Problem: 15 panels on the right, and at the default width 13 of them hid behind an unlabelled "+13". Research in
`docs/right-panel-research.md` (Interactives, Illustrator, Figma, Linearity Curve, Affinity, Krita).

- **A. Properties + labelled rail (recommended, built as the default).** One Properties view with the settings for what
  you're doing now as folding sections in one scroll (Tool options, Colours, Symbol and motion, Effects, Text,
  Particles, Camera, Rig, Palette and Tileset when they apply). Selected things lead. Sections that don't apply yet wait
  under "Also here" with what brings them up. The rarer panels (Library, Clip flow, Lip sync, Quests, Help, plugins)
  sit on a labelled rail at the far right edge. "Panels" at the bottom of the rail lists every panel with a sentence
  and a search.
- **B. Labelled rail, one panel at a time.** Every panel is on the rail with its name, grouped; no merging. Clear, but
  at 1280x800 the rail itself overflows (Quests and Help scroll off), and you still have to know Effects is a panel.
- **C. Tabs plus a Panels list.** Today's tabs and "+13", with a Panels button that lists every panel with a sentence
  and a search. Smallest change, but the tab bar still hides almost everything.

Why A: a beginner never has to know panel names. Select a symbol and its settings are right there; pick the Text tool
and Text appears. Everything else is named on the rail, nothing hides behind a count. It's the pattern Interactives,
Illustrator's Properties panel and Figma all landed on.

Files: `compare-<size>-<theme>.png` (A, B and C side by side, brush picked and a symbol with effects selected, at
1400x900 and 1280x800), `full/` (every whole-window shot), `a-properties.mp4`, `b-rail.mp4`, `c-tabs.mp4` (H.264 clips
of using each). B and C stay behind a debug switch for these pictures only: `__frameling.rightStyle('rail' | 'tabs')`
with `?debug`.
