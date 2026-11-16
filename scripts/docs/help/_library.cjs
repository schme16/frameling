// A made-up brush pack for shooting the brush picker against: twelve groups of twelve brushes, as the text of a brushes
// file (src/brushes/model.ts), added through __brushes.addFromText (src/brushes/debug.ts, ?debug only).
const GROUPS = {
  Inking: ['Fine liner', 'Technical pen', 'Brush pen', 'Dip pen', 'Gel pen', 'Cel ink', 'Ink wash', 'Crow quill', 'Rollerball', 'Felt tip', 'Reed pen', 'Bold liner'],
  Sketching: ['Pencil HB', 'Pencil 2B', 'Soft pencil', 'Mechanical pencil', 'Charcoal stick', 'Blue pencil', 'Rough sketch', 'Lead holder', 'Hatching', 'Scribble', 'Contour', 'Thumbnail'],
  Painting: ['Round brush', 'Flat brush', 'Filbert', 'Dry brush', 'Wet blend', 'Gouache', 'Oil bristle', 'Palette knife', 'Glaze', 'Fan brush', 'Wash', 'Splatter'],
  Markers: ['Chisel marker', 'Bullet marker', 'Highlighter', 'Alcohol marker', 'Brush marker', 'Felt marker', 'Poster marker', 'Chunky marker', 'Whiteboard', 'Paint pen', 'Dual tip', 'Pastel marker'],
  Calligraphy: ['Broad nib', 'Pointed nib', 'Italic nib', 'Copperplate', 'Gothic', 'Brush script', 'Uncial', 'Flourish', 'Chancery', 'Bamboo pen', 'Quill', 'Sumi'],
  'Texture and grain': ['Chalk', 'Charcoal', 'Crayon', 'Pastel', 'Sandpaper', 'Stipple', 'Grain', 'Canvas', 'Rough edge', 'Speckle', 'Torn paper', 'Dry pastel'],
  Cartoon: ['Bouncy line', 'Wobbly line', 'Cartoon outline', 'Thick and thin', 'Tapered ink', 'Pop line', 'Squiggle', 'Comic bold', 'Doodle', 'Toon shade', 'Bubble', 'Sticker edge'],
  Comics: ['Panel border', 'Screentone', 'Speed lines', 'Sound effect', 'Inker', 'Spotter', 'Hatch fine', 'Hatch bold', 'Lineart', 'Flat colour', 'Gutter', 'Balloon'],
  'Pixel friendly': ['Pixel pen 1', 'Pixel pen 2', 'Pixel pen 3', 'Dither dot', 'Hard edge', 'Sprite outline', 'Tiny dot', 'Chunky pixel', 'Clean line', 'Fill pen', 'Border pen', 'Shade pen'],
  Effects: ['Sparkle trail', 'Smoke wisp', 'Glow line', 'Lightning', 'Rain streak', 'Snow flake', 'Fire lick', 'Magic dust', 'Water ripple', 'Steam', 'Neon', 'Shine'],
  Lettering: ['Title letters', 'Small caps', 'Handwritten', 'Block letters', 'Bubble letters', 'Signpost', 'Chalkboard', 'Stencil', 'Label', 'Caption pen', 'Outline letters', 'Shadow letters'],
  Backgrounds: ['Grass blades', 'Leaf clusters', 'Cloud puff', 'Brick', 'Wood grain', 'Stone', 'Wave', 'Hills', 'Stars', 'Fence', 'Roof tiles', 'Foam'],
};
const SIZES = [3, 5, 2, 8, 4, 12, 6, 16, 3, 22, 7, 30];
const THIN = [0.5, 0, 0.3, 0.7, 0.25, 0, 0.6, 0.4];

/** The brushes-file text for the pack. `groups` limits it to the first n groups. */
function libraryText(groups = Infinity) {
  const presets = [];
  let i = 0;
  for (const [group, names] of Object.entries(GROUPS).slice(0, groups)) {
    for (const name of names) {
      const size = SIZES[i % SIZES.length];
      const thinning = THIN[i % THIN.length];
      presets.push({
        name,
        tool: 'brush',
        group,
        brush: { size, thinning, smoothing: 0.3 + (i % 5) * 0.1, streamline: 0.3 + (i % 5) * 0.1, taperStart: thinning > 0.4 ? 30 : 0, taperEnd: thinning > 0.4 ? 50 : 0 },
      });
      i++;
    }
  }
  return JSON.stringify({ format: 'frameling-brushes', version: 1, presets });
}

module.exports = { libraryText, GROUPS };
