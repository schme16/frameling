# The brush picker as built

The finished dropdown picker (card `brush-library-scale`) shot in the real app, in the same states as the round-two
mockup in `brand/ab/brush-library-v2/`, so the two can be set side by side. R2 rows are the default, two columns one
click away on the icon beside the search box. The library is made up: the four real starters plus 144 pretend brushes in
12 groups (`scripts/docs/help/_library.cjs`), with Fine liner in use, three brushes starred and four used lately.

- `1-picker-built.png`: four brushes, 148 with one group open, Recent open, every group folded, typing "pen". Dark above, light below.
- `2-favourites-and-two-columns.png`: Favourites open, and two columns with the panel dragged bigger.
- `3-button-at-rest.png`: the button shut with 4 brushes, with 148, and with the changed dot.
- `raw/`: each single shot.

Made with `scripts/docs/ab-brush-picker-built/built.cjs` and laid out by `scripts/ab/brush-picker-built-sheets.sh`.
