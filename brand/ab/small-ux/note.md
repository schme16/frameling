# small-ux: three small findings from the ease of use review

Each pair is before (development as it was) and after (wip/small-ux), cropped, in `dark` and `light`.

## 1. The Draw menu ("Tools and layers") said Select, Lasso and Polygon select twice
- `before-*-menu-vector-layer.png`, `before-*-menu-pixel-layer.png`: every name twice, one of each pair greyed, with the same keys.
- `after-*-menu-vector-layer.png`, `after-*-menu-pixel-layer.png`: each name once, and only the tools that work on the layer you are on (Magic wand, Tile brush and the other pixel tools show on a pixel layer only).
- Why it doubled: each way of picking is a tool for vector layers and another for pixel layers with the same name and key, and the menu listed every tool, greyed or not. On top of that, four older "pick the way" commands (select.box, select.lasso, select.magnetic, select.wand) were still registered in the Tools category with the same names, so they landed in the menu and the palette as a second Lasso, Magnetic lasso and Magic wand.

## 2. New pixel art: "pick An animation" with nothing picked
- `before-*-pixel-start.png`: nothing picked, Start greyed, Aseprite as the only description.
- `after-*-pixel-start.png`: An animation already picked (32 x 32 was), Start ready so Enter makes a sprite, the card says what it does first (frames on the timeline, one after another) and Aseprite second, and Quill says it was picked for you until you pick a card yourself.

## 3. A click beside a dialog asked a question
- `before-*-stray-click-untouched.png`, `before-*-stray-click-typed.png`: the question at the moment of the mis-click.
- `after-*-stray-click-untouched-dialog-closed.png`: nothing typed, so the click just closes the dialog (the app is behind it).
- `after-*-stray-click-typed-stays-open.png`: a size typed in, so the same click leaves the dialog open and loses nothing.
