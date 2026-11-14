// The words of the help topics in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  effects: `Effects change how a whole layer looks, without touching your drawing. Take them off any time.

## Add one

1. Pick the layer in the timeline.
2. Open the **Effects** panel (**View > Panels > Effects**, or the **Effects** menu).
3. Click an effect, then move the sliders until it looks right.

| Effect | Also called | What it does |
|---|---|---|
| **Soften** | Blur | Makes the layer soft and out of focus. |
| **Glow** | Outer glow | A soft light around the drawing. |
| **Shadow** | Drop shadow | A shadow behind the drawing, as if it floats. |
| **Colour adjust** | Hue / saturation / brightness / contrast | Shifts the colours, makes them stronger or greyer, lighter or darker. |
| **Outline** | Stroke | A solid line all the way round. Great for stickers and game sprites. |
| **Pixelate** | Mosaic | Big squares, like a censored photo or a retro game. |

Sizes are in stage pixels, so a blur looks the same at any zoom.

## More than one

Effects run from the top of the list down: an outline then a glow puts the glow round the outline. Use **⋯ > Move up** or **Move down** to change the order.

- The **eye** turns an effect off for a moment. **⋯ > Remove** takes it away.
- **Reset all** takes every effect off and sets the blend back to Normal.

## Animate an effect

Press the **key** button on an effect. Now moving a slider sets a **key** on this frame. Set another on a later frame and the setting changes smoothly in between: a glow can pulse, a blur can pull focus.

- A filled diamond means there is a key on this frame. **Remove key** takes it away.
- Press the key button again to stop animating.
- Colours don't animate; they keep one colour for the whole animation.

## Folders

For a layer in a [folder](help:layer-folders), pick **Folder** at the top of the panel to put the effect on the whole folder, like one shadow under a whole character.

## Good to know

- Every export (video, GIF, PNG, sprite sheets) shows effects exactly like the canvas. SVG and Lottie keep most of them too: the Export window says what each format keeps.
- Effects are remembered per drawing, so playback stays smooth.
- Inside a [symbol](help:symbols), effects, blend modes, masks and clipping work just like on the stage, and every copy of the symbol shows them. For one look on the whole symbol (one shadow under all of it), put the effect on the layer it sits on.`,
  'blend-modes': `Normally a layer covers what is under it, like paint. A **blend mode** makes it mix instead.

Pick the layer, open the **Effects** panel and click **Blend**. Each mode says what it does. The ones you'll use most:

- **Darken like ink** (Multiply): white vanishes, everything else darkens what's under it. Paint shadows on their own layer with this, in a soft purple or blue.
- **Lighten like light** (Screen): black vanishes, everything else lightens. Mist, highlights, light beams.
- **Glow brighter** (Add): colours add up towards white. Fire, sparks, magic, lasers.
- **Boost contrast** (Overlay): darks darker, lights lighter. Texture and mood.
- **Colour only** (Colour): paints its colour onto the shading underneath. Tint a grey drawing.
- **Glow brighter, plain** (Linear dodge), **Take away** (Subtract) and **Brighten by dividing** (Divide): what Aseprite's Addition, Subtract and Divide import as, mixed exactly as it does. SVG, Lottie and PDF show Subtract and Divide as Normal.

A blend mode mixes with **everything under the layer**, including the stage colour. In a [folder](help:layer-folders) that has its own blend mode or see-through, layers only mix with the folder's other layers.

Also in the command palette (Ctrl+K): type "blend".`,
  masks: `## Clip to the layer below

**Clip to the layer below** (a clipping mask) shows a layer only where the layer under it has drawing. Perfect for shading: draw the character's colours on one layer, put a shading layer above it, clip it, and scribble shadows without ever going over the edge.

- Pick the layer, then **Effects > Clip to the layer below** (Ctrl+Alt+G), or the switch in the Effects panel.
- Several clipped layers in a row all clip to the same layer under them.
- A clipped layer shows a little bent arrow in the timeline. Hide the layer it clips to and it hides too.

## Masks

A **mask layer** (layer mask) is never shown itself. What you draw on it decides what shows of the layers under it:

- **Show inside**: the layers under it only show where the mask has drawing. A reveal: a circle that grows, a window you look through.
- **Hide inside**: the layers under it are hidden where the mask has drawing. A hole, a bite, an eraser you can animate.

Make one with **Effects > Use layer as a mask**, or **Mask** in the Effects panel. The first time, Frameling asks whether it should mask just the layer under it or every layer under it, and puts them in a [folder](help:layer-folders) together. Drag more layers into the folder to mask them too.

A mask only reaches the layers under it in its own folder, so it never cuts into the rest of your picture. While a mask layer is picked, its drawing shows faintly in purple on the canvas so you can see what you're drawing. Masks animate like any layer: draw a different mask on each key, and soft edges come from a [Soften effect](help:effects) on the mask.`,
  'layer-folders': `A **folder** (layer group) holds layers that belong together, like the parts of a character. Folders can hold other folders, up to 8 levels deep: a **Scene** folder can hold a **Character** folder, which holds an **Arm** folder.

- **Make one:** pick a layer, then **Effects > Put layer in a new folder**. On a layer that is already in a folder, this makes a folder inside that folder.
- **Add layers:** drag a layer onto a layer inside the folder, or onto the folder's row to put it at the top. You can also use **Move layer up** / **Move layer down** to step it in at the folder's edge.
- **Take layers out:** drag a layer onto a layer outside, or step it past the folder's edge. **Effects > Take layer out of its folder** moves it just above the folder.
- **Folder in a folder:** drag the folder's row onto another folder's row (the middle of the row puts it inside; the top edge puts it above). Dragging a folder moves everything in it. **Put this folder in the folder next to it** does the same from the keyboard or the command palette.
- **Fold it:** click the arrow on the folder's row to hide what is in it in the timeline. It still shows on the canvas.
- **Hide it:** the eye on the folder's row hides everything in it, folders inside it too.
- **Remove it:** **Effects > Take layers out of this folder**. Its layers and folders move up a level and stay where they are.

**Keyboard:** with a layer or folder row picked in the list, the up and down arrows walk the rows, left folds a folder (or jumps to the folder it is in) and right unfolds it. Hold **Alt** and press an arrow to move the row itself: up and down step it through the list (into and out of folders as they come), left takes it out of its folder, right puts it into the folder next to it.

In the Effects panel, pick a **Folder** at the top (any folder around the layer) to set a see-through amount, a [blend mode](help:blend-modes) or [effects](help:effects) for the whole folder at once. A folder that fades fades as one picture, so overlapping parts don't show through each other. Inside a faded folder, a folder with its own fade is faded first and then fades with the rest, so the amounts multiply.

Masks in a folder only mask that folder's layers, folders inside it included (see [Masks and clipping](help:masks)). Layered exports keep the folders nested: Photoshop groups and Illustrator layers inside each other, and the same in PDF layers. Game exports that have no folders fold each folder's fade into its layers.`,
};
