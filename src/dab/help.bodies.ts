// The words of the help topic in help.ts, kept apart so they load only when Help is opened (see src/core/helpBodies.ts).
export const bodies: Record<string, string> = {
  'pixel-brush': `The **Pixel brush** draws a line as a row of **dabs**: one small stamp after another along the way you drag. You shape the stamp (its **tip**), how far apart the stamps go (the **spacing**), and whether they wander off the line (**scatter**). It works on **pixel layers**, and it is the quickest way to a pencil, a chunky marker, a chisel, a dotted line or a trail of stars.

**Draw with it:** pick the **Pixel brush** (**Alt+Shift+N**), choose a colour and drag. Or open the [brush picker](help:brush-picker) at the top of its options and pick one that comes ready. The cursor is the real shape of the tip, turned and flattened as set.

**The things you reach for:**
- **Tip:** **Round**, **Square**, or **Picture**. A picture tip is a little drawing of your own: select some pixels (up to 32 by 32) and press **Make from the selection**.
- **Size:** how many pixels across.
- **Spacing:** how far apart the dabs go, as a share of the size. Low is a smooth solid line, 100% is side by side, more leaves gaps like a dotted line. This one setting does most of what makes a brush feel like a brush.
- **Edges:** **Sharp pixels** or **Smooth**. Sharp is the pixel art way: every pixel is all or nothing. Smooth fades the edge with see-through pixels, like a painting program.
- **Hardness:** how firm the edge is. With sharp pixels a soft edge becomes a pattern of dots.

**Under Shape, scatter and flow:** **Angle** and **Roundness** turn and flatten the tip (a flat square at an angle is a chisel), **Turn with the line** points it the way you draw, **Scatter**, **Size jitter** and **Angle jitter** vary each dab. **Flow** is how much paint one dab lays down, so it builds up as dabs overlap. **Opacity** is the most any pixel can get in one stroke. Flow is how fast it builds, opacity is where it stops.

**Further folds, each with its own help:** [Pen, speed and fade](help:pixel-brush-dynamics) lets the pen, your speed or a fade-out change each dab, and **Colour changes** lets the colour wander or smear. The **Paper** box ([paper and dual tip](help:pixel-brush-texture)) gives the brush a paper to catch on, and **Dual tip** adds a second tip of dots.

**Keep your brushes:** press **Save as...** in the picker. The same picker holds pixel brushes for the soft paint tools and chalk and charcoal. See [saved brushes](help:brush-presets).

**Pixel art stays pixel art.** With sharp pixels nothing is see-through. If the layer has its [palette locked](help:palette-lock), a smooth edge is dithered into colours you already have, and the options say so. It follows [mirror drawing](help:pixel-mirror). The Pen page's pressure makes it bigger or denser, unless the brush has its own, which then wins so it never counts twice.

For soft fades try [soft paint](help:soft-paint); for paper grain, [chalk and charcoal](help:chalk-charcoal).`,
  'pixel-brush-dynamics': `**Dynamics** are what the pen and the hand do to each dab as you draw. Open **Pen, speed and fade** in the [Pixel brush](help:pixel-brush) options. Every row is one setting and one thing that moves it.

**Pick what moves it:**
- **Pen pressure:** how hard the pen presses. A mouse counts as full pressure, so a pressure brush paints at its full size with a mouse and never goes missing.
- **Pen tilt** and **Pen twist:** how far the pen leans, and how far it is turned about its own barrel. Only pens that can tell, and a mouse leaves them out.
- **Speed:** how fast the hand moves. Works with a mouse.
- **Fading out:** runs out along the stroke, from full at the start to nothing at the end. Set how far it goes under **Fade length**.
- **Direction of the line** and **Random**: which way the line heads, and a new random number for each dab.

**What it moves:**
- **Size** and **Flow:** **How much** says how small or light it gets when the source is at its lowest. 80% goes down to a fifth. **The other way round** flips it, so a fast hand makes a thin line.
- **Angle:** turns the tip, up to a full turn.
- **Scatter:** lets dabs wander off the line.

**Colour changes** has its own fold:
- **Hue**, **lightness** and **colourfulness wobble:** every dab shifts a little, so one red wanders through orange, pink and brick.
- **Colour mixes toward the fill colour:** the paint starts as your colour and moves toward the **Fill** colour as the source rises. Fading out toward the fill colour is a quick way to a gradient stroke.
- **Wet paint:** the brush picks up colour from the paint it crosses and carries it along, so strokes smear into each other like a mixing brush. It mixes with its own paint too: dabs that overlap blend in proportion, and a loop that crosses its own earlier line picks that colour up and smears it.

**Pixel art stays pixel art.** A [locked palette](help:palette-lock) is always kept: every colour here lands on the nearest palette colour, so no wobble or smear invents one. With sharp pixels nothing is see-through either.

**Brushes from other programs:** Photoshop's Control menus and Krita's sensors are this same idea, one source moving one setting, so they map straight onto these rows. Procreate's pressure curves are [how the pen feels](help:pixel-brush-curves).

Try the ready-made ones in the picker under **Pen and speed** and **Colour**. See also [saved brushes](help:brush-presets).`,
  'pixel-brush-curves': `A **response curve** says how a pen input turns into what the brush does. Straight, twice the press is twice the effect. Bent, a light press can already do most of the work, or a firm press can be needed to do anything. It is the difference between a pen that merely responds and one that feels right under your hand.

**Shape it:** open **Pen, speed and fade** in the [Pixel brush](help:pixel-brush) options, pick a source for a setting (say **Pen pressure** for **Size follows**), and open **Shape of the response** under it. The graph runs left to right from the lightest press to the hardest, and up from the least effect to the most.

**Start from a feel:**
- **Even:** the straight line, and how every brush starts.
- **Light touch:** a gentle press already does most of the work, so a light hand still gets a full mark.
- **Firm hand:** needs a proper press to get going, so a light hand stays small and faint.
- **Soft ends:** slow to start and slow to finish, quick through the middle.
- **Ignore the lightest:** nothing happens until the press passes a fifth, which stops tiny accidental marks.

**Or draw your own:** drag a dot, click the line to add one (up to eight), double-click a dot to remove it. With the keyboard, Tab to a dot and use the arrow keys (hold **Shift** for bigger steps) or Delete. The line always passes smoothly through your dots and never wiggles past them.

**Any source can be bent**, not only pressure: speed, tilt and fading out too. **The other way round** flips the result after the curve, so the graph always reads the way you drew it.

**Good to know:**
- A mouse counts as full pressure, so a curve on pressure changes nothing for a mouse, and the brush never goes missing.
- Step through the feels from the palette with **Pixel brush: change how the pen feels**. It bends every pressure row at once.
- Curves from other programs (Photoshop's Control curves, Krita's sensor curves and Procreate's pressure curve) are this same idea.
- A locked palette is still kept: a curve changes how much, never which colours.

See also [pen, speed and fade](help:pixel-brush-dynamics) and [saved brushes](help:brush-presets).`,
  'pixel-brush-blend': `A **paint mode** (a **blend mode**) decides how the brush's paint joins what is already on the layer. **Paint over it** is the usual: the paint covers what is there. The others mix with it, so one stroke can shade, glow or recolour, and you don't need a layer for each.

**Pick one:** open **Colour changes** in the [Pixel brush](help:pixel-brush) options and choose from **How the paint joins what is there**. Or step through them from the palette with **Pixel brush: next paint mode**.

**The ones you'll use most:**
- **Darken, multiply (Multiply):** shades. Blue over yellow makes a deep green, and white changes nothing. Good for shadows.
- **Lighten, screen (Screen):** lights. Black changes nothing. Good for glows and highlights.
- **Overlay:** adds contrast: it darkens the dark parts and lightens the light ones, so the picture keeps its shape.
- **Colour only (Colour):** puts your colour on the shading that is already there. Good for tinting a grey drawing.
- **Lightness only (Luminosity)** is the other way round: your light and dark on the colours that are there.

The rest (colour dodge and burn, hard and soft light, difference, exclusion, hue, saturation, take away, divide) are the same list a layer has, and work the same way.

**Good to know:**
- It blends with the pixels on the layer you are painting on, not with the layers under it. Where the layer is empty there is nothing to blend with, so the paint lands as it is.
- Painting over the same spot twice in one stroke doesn't darken it twice. **Flow** and **Opacity** still decide how much goes on.
- With sharp pixels the paint goes on whole or not at all, and a [locked palette](help:palette-lock) still keeps its colours: a blend lands on the nearest one.
- The picture shows five strokes of the same pink across the same four blocks. From the top: paint over it, multiply, screen, overlay, colour only.

See also [layer blend modes](help:blend-modes) and [saved brushes](help:brush-presets).`,
  'pixel-brush-texture': `**Grain** and a **dual tip** are the two ways to make a brush speckled, rough or bristly instead of smooth. Grain is the **Paper** box in the [Pixel brush](help:pixel-brush) options, and the dual tip is under it.

**Catch on paper:** switch it on in the **Paper** box and the paint catches on the high points of the sheet's paper, so light strokes break into specks and pressing harder fills the dips in. It is the same paper as [chalk and charcoal](help:paper), so a stroke here and a stroke there meet the same bumps.
- **Paper:** smooth, fine, medium, laid or rough. This is the sheet's paper, so it changes for every tool that uses it. **Keep this brush on** one paper if you want this brush to stay put when the sheet changes.
- **How much it catches:** at the top the paint only lands on the high points. Lower the **Flow** to see it best.
- **Grain size:** makes each bump a block of pixels, for a chunkier paper.
- **A new patch of paper for every dab:** off, the paper is fixed to the page and two strokes over each other catch on the same bumps. On, every dab finds new paper, so overlapping dabs fill each other in, like a sponge.

**Dual tip:** open **Dual tip** under the Paper box. It is a second tip of little dots. The brush only paints where its dots are. It is most of what makes a Photoshop spatter or bristle brush look the way it does.
- **Dot shape, Dot size** and **How many dots** set the dots. Every stroke gets its own scatter of them.
- **Cut holes instead:** the dots become holes in the brush, so it paints everywhere except them.

**Flow and opacity, in plain words:** **Flow** is how much paint one dab lays down, so it builds up as dabs overlap. **Opacity** is the most any pixel can get in one stroke, however many dabs cross it. Grain and dots work on the paint of each dab, so a low flow is where they show.

**Pixel art stays pixel art.** With sharp pixels the grain makes whole pixels, on or off, so nothing is see-through and a [locked palette](help:palette-lock) keeps its colours.

Try the ready-made ones in the picker under **Grain and texture**. See also [saved brushes](help:brush-presets).`,
};
