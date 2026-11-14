// The words of the help topic in mirror-help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'mirror-drawing': `Press **Shift+M** to turn it on. Press it again to change direction: **left and right**, **top and bottom**, **both** (four ways at once), then off. You can also pick it in the tool options.

A dashed line on the page shows where the mirror is. Draw on one side and the other side follows as you go.

## On a vector layer

The [brush](help:tool-brush), [pencil](help:tool-pencil), [pen](help:tool-pen), [rectangle, ellipse and line](help:tool-rect), [polygon and star](help:tool-polygon-star) and the [eraser](help:tool-eraser) all copy across the line. Each copy is a shape of its own, so you can move, recolour or delete one side later. The copies are made in the same undo step as what you drew, so one Undo takes both away.

The **paint bucket** fills only where you click. Frameling tells you when you use it with the mirror on, so click the other side too.

## On a pixel layer

Every pixel tool copies across the line, and the bucket fills the mirrored spot too. See [Mirror drawing on pixel layers](help:pixel-mirror).

## Moving the line

In the tool options, drag **Mirror line across** or **Mirror line down**. On a vector layer it moves in page pixels, on a pixel layer in half pixel steps. **Back to the middle** puts it back. The pixel line and the vector line are kept apart, because a pixel layer counts in its own big pixels.

Good to know: mirror drawing starts off every time you open Frameling, so a mirror you left on yesterday never doubles a stroke today by surprise. Where the lines sit is remembered.

The usual name for this is *symmetry*.`,
};
