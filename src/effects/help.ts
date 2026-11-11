import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'effects',
    title: 'Effects: glow, shadow, blur and more',
    section: 'Effects',
    media: 'effects.mp4',
    summary: 'Give a layer a glow, a shadow, a soft blur, an outline, new colours or big pixels. Open the Effects panel and pick one.',
    keywords: ['effect', 'fx', 'glow', 'shadow', 'drop shadow', 'blur', 'outline', 'stroke', 'pixelate', 'mosaic', 'hue', 'saturation', 'brightness', 'contrast', 'colour adjust', 'animate effect'],
    body: `Effects change how a whole layer looks, without touching your drawing. Take them off again any time and the drawing is just as it was.

## Add one

1. Pick the layer in the timeline.
2. Open the **Effects** panel (View > Effects, or the Effects menu).
3. Click an effect. It shows on the canvas straight away. Move the sliders until it looks right.

| Effect | Also called | What it does |
|---|---|---|
| **Soften** | Blur | Makes the layer soft and out of focus. |
| **Glow** | Outer glow | A soft light around the drawing. |
| **Shadow** | Drop shadow | A shadow behind the drawing, as if it floats. |
| **Colour adjust** | Hue / saturation / brightness / contrast | Shifts the colours, makes them stronger or greyer, lighter or darker. |
| **Outline** | Stroke | A solid line all the way round. Great for stickers and game sprites. |
| **Pixelate** | Mosaic | Big squares, like a censored photo or a retro game. |

Sizes are in stage pixels, so a 4 px blur looks the same at any zoom and in every export.

## More than one

Effects run from the top of the list to the bottom. An outline then a glow puts the glow round the outline; a glow then an outline outlines the glow. Use **⋯ > Move up** or **Move down** to change the order.

- The **eye** turns an effect off for a moment.
- **⋯ > Reset** puts its settings back, **Remove** takes it away.
- **Reset all** at the bottom takes every effect off and sets the blend back to Normal.

## Animate an effect

Press the **key** button on an effect. Now moving a slider sets a **key** on the frame you are on. Go to another frame and move it again: in between, the setting changes smoothly from one key to the next. A glow can pulse, a blur can pull focus, a colour can fade.

- A filled diamond means there is a key on this frame. **Remove key** takes it away.
- Press the key button again to stop animating. The settings on the current frame stay.
- Colours don't animate; they keep one colour for the whole animation.

## Folders

When a layer is in a [folder](help:layer-folders), the panel has **Layer** and **Folder** at the top. Pick **Folder** to put the effect on everything in the folder together, for example one shadow under a whole character.

## Good to know

- Every export (video, GIF, PNG, sprite sheets) shows effects exactly like the canvas. SVG files keep [blend modes](help:blend-modes) but not effects yet.
- Effects are worked out once per drawing and remembered, so playback stays smooth.
- Inside a [symbol](help:symbols), layers keep only their see-through setting: their effects, blend modes, masks and clipping show while you're drawing inside it, but not where the symbol is placed. To give a symbol a glow or a shadow, put the effect on the layer the symbol sits on.`,
  },
  {
    id: 'blend-modes',
    title: 'Blend modes: how a layer mixes',
    section: 'Effects',
    media: 'blend-modes.png',
    summary: 'Make a layer darken like ink, lighten like light, glow, or only colour what is under it. Set it at the top of the Effects panel.',
    keywords: ['blend', 'blend mode', 'multiply', 'screen', 'overlay', 'add', 'lighter', 'soft light', 'hard light', 'difference', 'colour', 'color', 'hue', 'luminosity', 'mix'],
    body: `Normally a layer covers what is under it, like paint. A **blend mode** makes it mix instead.

Pick the layer, open the **Effects** panel and click **Blend**. Each mode says what it does. The ones you'll use most:

- **Darken like ink** (Multiply): white vanishes, everything else darkens what's under it. Paint shadows on their own layer with this, in a soft purple or blue.
- **Lighten like light** (Screen): black vanishes, everything else lightens. Mist, highlights, light beams.
- **Glow brighter** (Add): colours add up towards white. Fire, sparks, magic, lasers.
- **Boost contrast** (Overlay): darks darker, lights lighter. Texture and mood.
- **Colour only** (Colour): paints its colour onto the shading underneath. Tint a grey drawing.

A blend mode mixes with **everything under the layer**, including the stage colour. In a [folder](help:layer-folders) that has its own blend mode or see-through, layers only mix with the folder's other layers.

Also in the command palette (Ctrl+K): type "blend".`,
  },
  {
    id: 'masks',
    title: 'Masks and clipping',
    section: 'Effects',
    media: 'masks.png',
    summary: 'Show a layer only inside the one below it (clip), or use a drawing to show or hide the layers under it (mask).',
    keywords: ['mask', 'clipping mask', 'clip', 'clip to below', 'reveal', 'stencil', 'cut out', 'inside the lines', 'layer mask'],
    body: `## Clip to the layer below

**Clip to the layer below** (a clipping mask) shows a layer only where the layer under it has drawing. Perfect for shading: draw the character's colours on one layer, put a shading layer above it, clip it, and scribble shadows without ever going over the edge.

- Pick the layer, then **Effects menu > Clip to the layer below** (Ctrl+Alt+G), or the switch in the Effects panel.
- Several clipped layers in a row all clip to the same layer under them.
- A clipped layer shows a little bent arrow in the timeline. Hide the layer it clips to and it hides too.

## Masks

A **mask layer** (layer mask) is never shown itself. What you draw on it decides what shows of the layers under it:

- **Show inside**: the layers under it only show where the mask has drawing. A reveal: a circle that grows, a window you look through.
- **Hide inside**: the layers under it are hidden where the mask has drawing. A hole, a bite, an eraser you can animate.

Make one with **Effects menu > Use layer as a mask**, or **Mask** in the Effects panel. The first time, Frameling asks whether it should mask just the layer under it or every layer under it, and puts them in a [folder](help:layer-folders) together. Drag more layers into the folder to mask them too.

A mask only reaches the layers under it in its own folder, so it never cuts into the rest of your picture. While a mask layer is picked, its drawing shows faintly in purple on the canvas so you can see what you're drawing. Masks animate like any layer: draw a different mask on each key, and soft edges come from a [Soften effect](help:effects) on the mask.`,
  },
  {
    id: 'layer-folders',
    title: 'Layer folders',
    section: 'Effects',
    media: 'layer-folders.png',
    summary: 'Put layers in a folder to fade, blend, mask and add effects to them together. Fold it shut to tidy the timeline.',
    keywords: ['folder', 'group', 'layer group', 'collapse', 'tidy'],
    body: `A **folder** (layer group) holds layers that belong together, like the parts of a character.

- **Make one:** pick a layer, then **Effects menu > Put layer in a new folder**.
- **Add layers:** drag a layer onto a layer inside the folder, or use **Move layer up** / **Move layer down** to step it in at the folder's edge. Drag it onto a layer outside, or step it past the folder's edge, to take it out.
- **Fold it:** click the arrow on the folder's row to hide its layers in the timeline. They still show on the canvas.
- **Hide it:** the eye on the folder's row hides every layer in it.
- **Remove it:** **Effects menu > Take layers out of this folder**. The layers stay where they are.

In the Effects panel, pick **Folder** at the top to set a see-through amount, a [blend mode](help:blend-modes) or [effects](help:effects) for the whole folder at once. A folder that fades fades as one picture, so overlapping parts don't show through each other.

Masks in a folder only mask that folder's layers (see [Masks and clipping](help:masks)). Folders can't hold other folders yet.`,
  },
]);
