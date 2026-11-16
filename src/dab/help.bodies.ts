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

**Further folds, each with its own help:** [Pen, speed and fade](help:pixel-brush-dynamics) lets the pen, your speed or a fade-out change each dab, and **Colour changes** lets the colour wander or smear. [Grain and dual tip](help:pixel-brush-texture) gives the brush a paper to catch on, or a second tip of dots.

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
- **Wet paint:** the brush picks up colour from the paint it crosses and carries it along, so strokes smear into each other like a mixing brush.

**Pixel art stays pixel art.** A [locked palette](help:palette-lock) is always kept: every colour here lands on the nearest palette colour, so no wobble or smear invents one. With sharp pixels nothing is see-through either.

**Brushes from other programs:** Photoshop's Control menus, Krita's sensors and Procreate's pressure curves are all this same idea, one source moving one setting, so they map straight onto these rows.

Try the ready-made ones in the picker under **Pen and speed** and **Colour**. See also [saved brushes](help:brush-presets).`,
  'pixel-brush-texture': `**Grain** and a **dual tip** are the two ways to make a brush speckled, rough or bristly instead of smooth. Open **Grain and dual tip** in the [Pixel brush](help:pixel-brush) options.

**Paper grain:** the paint catches on the high points of a paper, so light strokes break into specks and pressing harder fills the dips in. It uses the same five papers as [chalk and charcoal](help:chalk-charcoal), so a stroke here and a stroke there meet the same bumps.
- **Paper:** smooth, fine, medium, laid or rough.
- **How much it catches:** at the top the paint only lands on the high points. Lower the **Flow** to see it best.
- **Grain size:** makes each bump a block of pixels, for a chunkier paper.
- **A new patch of paper for every dab:** off, the paper is fixed to the page and two strokes over each other catch on the same bumps. On, every dab finds new paper, so overlapping dabs fill each other in, like a sponge.

**Dual tip:** a second tip of little dots. The brush only paints where its dots are. It is most of what makes a Photoshop spatter or bristle brush look the way it does.
- **Dot shape, Dot size** and **How many dots** set the dots. Every stroke gets its own scatter of them.
- **Cut holes instead:** the dots become holes in the brush, so it paints everywhere except them.

**Flow and opacity, in plain words:** **Flow** is how much paint one dab lays down, so it builds up as dabs overlap. **Opacity** is the most any pixel can get in one stroke, however many dabs cross it. Grain and dots work on the paint of each dab, so a low flow is where they show.

**Pixel art stays pixel art.** With sharp pixels the grain makes whole pixels, on or off, so nothing is see-through and a [locked palette](help:palette-lock) keeps its colours.

Try the ready-made ones in the picker under **Grain and texture**. See also [saved brushes](help:brush-presets).`,
};
