// Help for the pixel art tools and the palette. Plain words first, the usual pixel art term second.
import { registerHelpTopics } from '../core/registry';

registerHelpTopics([
  {
    id: 'pixel-art',
    order: 1,
    media: 'pixel-art.png',
    title: 'Making pixel art',
    section: 'Pixel art',
    summary: 'The tools for a game sprite made entirely of pixels, and the order most people use them in.',
    keywords: ['pixel art', 'sprite', 'game', 'retro', '8-bit', 'workflow'],
    body: `Start a **Game sprite** or **Tiny sprite** from File > New (one frame to start, add more to animate), or add a pixel layer to any page. Then switch to the [Pixel workspace](help:pixel-workspace) (View > Workspaces): only the pixel tools, the Palette right beside you, and a [Preview](help:pixel-preview) playing your sprite at real size.

A sprite usually goes like this:

1. **Pick a palette.** The [Palette](help:palette) panel has starter palettes, or load your own.
2. **Draw the outline** with the [Pencil](help:tool-pencil) (P). Turn on [Mirror drawing](help:pixel-mirror) (Shift+M) for faces and front-on characters.
3. **Fill it in** with the paint bucket (G).
4. **Shade it** with the [Shade](help:tool-shade) tool (S): each pass moves a pixel one step darker or lighter along its colour ramp.
5. **Add texture** with the [Dither](help:tool-dither) brush (Shift+B).
6. **Finish with an outline** round the whole thing: Pixel > Add outline. See [Outlines](help:pixel-outline).

Need it facing the other way, or tilted? See [Flip and turn](help:pixel-flip-rotate). Want to keep strictly to your palette? Turn on the [palette lock](help:palette-lock).`,
  },
  {
    id: 'tool-shade',
    title: 'Shade',
    section: 'Pixel art',
    media: 'pixel-shade.mp4',
    summary: 'Brush over pixels to make them one step lighter or darker along their colour ramp.',
    keywords: ['shading', 'shading ink', 'lighter', 'darker', 'ramp', 'highlight', 'shadow'],
    body: `Press **S** on a pixel layer, then brush over your drawing.

Every pixel you pass over moves **one step along its ramp** in the [Palette](help:palette): a mid green becomes the next green down (darker) or up (lighter). Let go and brush again to go another step. One stroke only ever moves a pixel one step, however many times you go over it.

- Choose **Lighter** or **Darker** in the options.
- Pixels that aren't a palette colour, and empty pixels, are left alone, so you can shade right over your outline.
- Size, Pixel perfect and Mirror drawing work as they do for the pencil.

This is sometimes called a *shading ink*. It works best with palettes laid out in ramps, dark to light.`,
  },
  {
    id: 'tool-dither',
    title: 'Dither',
    section: 'Pixel art',
    media: 'pixel-dither.png',
    summary: 'Paint a checker or stripe pattern of two colours, for soft blends and texture.',
    keywords: ['dithering', 'pattern', 'checker', 'checkerboard', 'texture', 'blend', 'gradient'],
    body: `Press **Shift+B** on a pixel layer, then paint.

The brush lays down a pattern: the pattern's dark squares take your **stroke** colour and the light squares your **fill** colour. Two colours in a checker read as a colour halfway between them, which is how pixel artists blend without adding new colours.

- Pick a **pattern** in the options: checker, light (one in four), heavy (three in four), sprinkle, stripes or a grid.
- Set the **fill to none** (press / with the fill box in front) and the light squares are left as they are. Great for scattering texture over a finished area.
- The pattern is fixed to the page, not to your stroke, so separate strokes always line up.

The usual name for this is *ordered dithering*.`,
  },
  {
    id: 'pixel-mirror',
    title: 'Mirror drawing',
    section: 'Pixel art',
    media: 'pixel-mirror.mp4',
    summary: 'Draw on one side and it appears flipped on the other side too.',
    keywords: ['symmetry', 'symmetrical', 'mirror', 'mirror mode', 'kaleidoscope', 'axis'],
    body: `Press **Shift+M** to turn it on. Press it again to change direction: **left and right**, **top and bottom**, **both** (four ways at once), then off.

A dashed line on the page shows where the mirror is. Everything the pencil, brush, eraser, shade, dither and shape tools paint on a pixel layer is copied across it, and the paint bucket fills the mirrored spot too.

**Moving the mirror line.** In the tool options, drag **Mirror line across** or **Mirror line down**. It moves in half pixel steps: on a whole number the line runs between two pixels (both sides are copied), on a half it runs through the middle of a pixel column (that column is shared, which is how you get an odd-width face with one nose). **Back to the middle** puts it back.

The usual name for this is *symmetry*.`,
  },
  {
    id: 'pixel-outline',
    title: 'Outlines',
    section: 'Pixel art',
    media: 'pixel-outline.png',
    summary: 'Draw a one pixel outline round everything on the frame, in the stroke colour.',
    keywords: ['outline', 'border', 'edge', 'sticker', 'stroke', 'inner outline'],
    body: `Pixel > **Add outline (outside)** draws a one pixel outline round everything drawn on this frame of the layer you're on. It uses the **stroke** colour and goes round holes too.

Pixel > **Add outline (inside the edge)** repaints the outer pixels of your drawing instead, so it doesn't get any bigger. Handy when a sprite has to fit a tile exactly.

Each is one undo step. Run it twice for a thicker outline, or with a different stroke colour for a two-colour edge.`,
  },
  {
    id: 'pixel-shapes',
    title: 'Pixel shapes and thick outlines',
    section: 'Pixel art',
    media: 'pixel-shapes.png',
    summary: 'Rectangles, ellipses, lines, polygons, stars and the pen on a pixel layer, with an outline as thick as you like.',
    keywords: ['thick', 'outline', 'thickness', 'line width', 'stroke width', 'rectangle', 'ellipse', 'circle', 'line', 'polygon', 'star', 'pen', 'shape', 'pixel'],
    body: `On a pixel layer the shape tools ([Rectangle](help:tool-rect), [Ellipse](help:tool-ellipse), [Line](help:tool-line), [Polygon and Star](help:tool-polygon-star)) and the [Pen](help:tool-pen) paint clean, hard pixels with no soft edges. Out of the box the outline is one pixel thick.

**Thicker outlines.** Turn on **Thicker outline** in the tool options (or in Preferences > General, where it is called *Thicker pixel outlines*). Then set **Outline thickness**, from 1 to 16 pixels. Both places change the same setting, so use whichever is closer. It stays as you left it the next time you open Frameling, and it starts off, so shapes keep the classic one pixel look until you ask.

- **A rectangle or an ellipse** keeps the size you drag. The outline grows inwards, so a 20 pixel wide box is still 20 pixels wide. If the outline is thicker than the shape can hold, the shape comes out solid in the stroke colour.
- **A line, a polygon, a star or a pen path** has its outline centred on the path, a little like a brush walking along it. The pen paints when you finish the path, and shows the thickness in its options too.
- **The fill stays the fill.** Thickness only changes the outline. With the stroke set to none there is no outline, so the fill covers the shape as before.
- It paints with the same brush shape as the pixel Brush, so pick a round brush for rounder corners.
- Everything stays crisp: whole pixels, never blended. It follows the [palette lock](help:palette-lock), [mirror drawing](help:pixel-mirror), and the perspective guides (a thick rectangle or ellipse on a perspective plane keeps the size you dragged too; see [Pixel shapes on perspective guides](help:pixel-perspective)).
- Looking through a zoomed [camera](help:camera), the thickness is what you see, like the brush: 4 pixels through a camera zoomed in 2x paints 2 (whole pixels, never less than 1).`,
  },
  {
    id: 'pixel-perspective',
    title: 'Pixel shapes on perspective guides',
    section: 'Pixel art',
    media: 'perspective-shapes-pixel.png',
    summary: 'Turn on perspective guides and a rectangle or an ellipse on a pixel layer becomes a wall, a floor or a round window, in crisp pixels.',
    keywords: ['perspective', 'vanishing point', 'wall', 'floor', 'horizon', 'guides', 'building', 'isometric', 'pixel', 'rectangle', 'ellipse', 'plane'],
    body: `The picture shows a pink wall and a blue wall drawn with the [Rectangle](help:tool-rect) on a pixel layer, each with a window on it (a box on one, an oval on the other), all with perspective guides on.

1. Turn on [perspective guides](help:grids-perspective) in View, one point or two, make sure snapping is on, and drag the vanishing points where you want them.
2. Pick **Rectangle** or **Ellipse** and drag across the wall or floor, the way you would on a plain canvas.
3. The shape follows the guides: its edges run to the vanishing points, and a window drawn inside a wall keeps the same slant. **On a plane** in the tool options picks **Floor**, **Left wall** or **Right wall**, or leave it on **Auto**.

Everything is painted as whole pixels, never blended. The shape snaps to the pixel under the pointer, so even with a turned or zoomed [camera](help:camera) it lands where you aim. It keeps to the palette when the layer's [palette lock](help:palette-lock) is on, and a thicker outline works too (see [Pixel shapes](help:pixel-shapes)).

Want a flat box on a perspective picture? Set **On a plane** to **Flat**, or hold **Ctrl** to ignore the guides for one shape.`,
  },
  {
    id: 'pixel-flip-rotate',
    title: 'Flip and turn pixel art',
    section: 'Pixel art',
    media: 'pixel-rotate.png',
    summary: 'Mirror a drawing, give it a quarter turn, or turn it by any angle without blurring it.',
    keywords: ['flip', 'rotate', 'turn', 'mirror', 'angle', 'rotsprite', 'face the other way'],
    body: `These work on the drawing on this frame of the pixel layer you're on. Find them in the **Pixel** menu or the command palette.

- **Flip drawing left to right** and **upside down** mirror it around its own middle, so it stays where it is. Perfect for a character that walks both ways.
- **Turn right**, **Turn left** and **Turn round** are exact quarter and half turns: every pixel lands on the grid, nothing changes colour.
- **Turn drawing by any angle...** opens a preview with a slider. Normally turning pixel art smears it into a mess of new in-between colours. Frameling first blows the drawing up with an edge-smoothing scale (Scale2x, three times), then turns it and picks one colour per pixel, so diagonals stay clean and every colour is one of yours. This is the idea behind the *RotSprite* method.

Anything turned off the edge of the page is cut off, so leave a little room.`,
  },
  {
    id: 'palette',
    order: 2,
    title: 'The Palette panel',
    section: 'Pixel art',
    media: 'palette-panel.png',
    summary: "Your document's colours for pixel art, in ramps. Click to paint, drag to reorder, load and save palette files.",
    keywords: ['palette', 'colours', 'colors', 'ramp', 'gpl', 'hex', 'pal', 'jasc', 'gimp', 'lospec', 'swap', 'recolour', 'colour palette', 'swatches'],
    body: `Open it from View > Palette, or switch to the **Pixel** workspace, which puts it on the left.

**Painting.** Click a colour to put it in the colour box that's in front (stroke or fill). The little **S** and **F** tags show your stroke and fill colours, and a dot shows the colours used on this frame. Right-click a colour to use it for lines or for the bucket directly.

**Ramps.** Each row is a *ramp*: shades of one colour, dark to light. [Shade](help:tool-shade) steps along them. Right-click a colour and choose **Start a new ramp here** to split a row, or **Join the ramp before** to merge it back. **+ Add ramp** adds five shades of the current colour, with cooler shadows and warmer lights.

**Changing a colour.** Double-click it (or right-click > Change colour). The first time, Frameling asks whether the pixels already painted in that colour should change too. Say yes and you can try a whole new colour scheme in seconds (this is called a *palette swap*). You can change your answer in Preferences > Behaviour.

**Arranging.** Drag a colour onto another to move it there. Right-click > Remove takes it out.

**Starter palettes.** A few to get going: *Cosy Sixteen* (a good all-rounder), *Pocket Moss* (four greens, like an old handheld game screen), *Dusk Ramps*, *Arcade Bright* and *Paper and Ink* (one-bit).

**Files.** **Load...** reads GIMP \`.gpl\`, \`.hex\` lists (as used by many palette sites) and JASC \`.pal\` files, or takes the colours from a picture. **Save as...** writes any of the three. **From drawing** makes a palette from the colours on this frame.

The palette is saved with your document. Until you change it, a new document uses Cosy Sixteen.`,
  },
  {
    id: 'palette-lock',
    media: 'palette-lock.png',
    title: 'Palette lock (indexed colour)',
    section: 'Pixel art',
    summary: 'Keep a pixel layer to palette colours only: everything you paint snaps to the nearest one.',
    keywords: ['indexed', 'indexed colour', 'palette lock', 'limit colours', 'reduce', 'quantise', 'quantize'],
    body: `Turn on **Lock this layer to the palette** in the Palette panel (or Pixel > Lock this layer to the palette).

From then on, every colour painted on that layer, by any tool, snaps to the **nearest palette colour**. The pencil, brush, shapes, bucket, dither and outline all follow it. Clearing with the eraser still clears.

**Reduce to palette** changes everything already on the frame to its nearest palette colour. Pixels that are more than half see-through become clear; the rest become solid.

**How it works.** Pixels are stored as ordinary colours, not as numbers into the palette. When you change a palette colour, Frameling finds every pixel of the old colour and changes it (if you said yes to that). So if two palette colours are ever set to the same colour, their pixels can't be told apart afterwards. Undo is your friend.`,
  },
]);
