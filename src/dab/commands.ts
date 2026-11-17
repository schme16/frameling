// Palette commands for the Pixel brush: the tip, edges, turning with the line, scatter, spacing and the picture tip.
import { registerCommands, type Command } from '../core/registry';
import { pickKindReason } from '../core/reasons';
import { toast } from '../ui/toast';
import { toolEnabled } from '../ui/dynamic';
import { pickTool } from '../tools/pick';
import { showPanel } from '../ui/dock';
import { TIP_SHAPES, type TipShape } from './maths';
import { getDab, setDab } from './settings';
import { routeFor, withRoute } from './dynamics';
import { FEELS, feelOf } from './curve';
import { stepBlend } from './blend';
import { blendInfo } from '../effects/model';
import { DEFAULT_DUAL, DEFAULT_GRAIN } from './texture';
import { dualFromPicture, editPictureTip, grainFromPicture, pictureTipFromFile } from './pictureTip';
import { PIXEL_BRUSH_TOOL } from './live';

const onPixel = () => toolEnabled(['pixel']);
const reason = pickKindReason(['pixel'], 'The pixel brush');
const base = { category: 'Pixel', layers: ['pixel' as const], enabled: onPixel, reason, help: 'pixel-brush' };
const open = (): void => {
  pickTool(PIXEL_BRUSH_TOOL);
  showPanel('tool-options');
};

const TIP_WORDS: Record<TipShape, { label: string; hint: string; keywords: string[] }> = {
  round: { label: 'round', hint: 'A round dab. Hardness sets how firm the edge is.', keywords: ['circle', 'dot', 'disc'] },
  square: { label: 'square', hint: 'A square dab with corners. Turn it with Angle for a diamond or a chisel.', keywords: ['box', 'block', 'chisel', 'diamond'] },
  picture: { label: 'picture', hint: 'A little picture of your own, stamped along the line. With none yet, the editor opens so you can draw one.', keywords: ['stamp', 'custom', 'image', 'sprite'] },
};

/** The spacings the closer and wider commands step through, as shares of the size. */
export const SPACING_STEPS = [0.1, 0.25, 0.5, 1, 1.5, 2.5];

/** The next spacing in the list above (or the one before), staying at the ends. */
export function stepSpacing(now: number, by: 1 | -1): number {
  if (by === 1) return SPACING_STEPS.find((s) => s > now + 1e-9) ?? SPACING_STEPS[SPACING_STEPS.length - 1];
  return [...SPACING_STEPS].reverse().find((s) => s < now - 1e-9) ?? SPACING_STEPS[0];
}

const tipCommands: Command[] = TIP_SHAPES.map((t) => ({
  ...base,
  id: `pixelbrush.tip.${t}`,
  label: `Pixel brush tip: ${TIP_WORDS[t].label}`,
  description: TIP_WORDS[t].hint,
  keywords: ['pixel brush', 'tip', 'dab', ...TIP_WORDS[t].keywords],
  checked: (s) => s.ui.tool === PIXEL_BRUSH_TOOL && getDab().tip === t,
  run: () => {
    open();
    if (t === 'picture' && !getDab().picture) editPictureTip();
    else setDab({ tip: t });
  },
}));

registerCommands([
  ...tipCommands,
  {
    ...base,
    id: 'pixelbrush.smooth',
    label: 'Pixel brush: smooth edges on or off',
    description: 'Switch the pixel brush between sharp pixels (no anti-aliasing, the pixel art way) and a smooth see-through edge.',
    keywords: ['pixel brush', 'anti-aliasing', 'antialiasing', 'aliased', 'smooth', 'sharp', 'jaggies', 'crisp', 'edges'],
    checked: (s) => s.ui.tool === PIXEL_BRUSH_TOOL && !getDab().aliased,
    run: () => {
      open();
      const aliased = !getDab().aliased;
      setDab({ aliased });
      toast(aliased ? 'Sharp pixels: every pixel is all or nothing.' : 'Smooth edges: the edge fades with see-through pixels.', { duration: 1600 });
    },
  },
  {
    ...base,
    id: 'pixelbrush.follow',
    label: 'Pixel brush: turn with the line on or off',
    description: 'The tip points along the way you draw, like a pen nib kept flat to the page.',
    keywords: ['pixel brush', 'follow', 'direction', 'rotate', 'turn', 'angle', 'nib'],
    checked: (s) => s.ui.tool === PIXEL_BRUSH_TOOL && getDab().follow,
    run: () => {
      open();
      setDab({ follow: !getDab().follow });
    },
  },
  {
    ...base,
    id: 'pixelbrush.scatter',
    label: 'Pixel brush: scatter on or off',
    description: 'Let each dab land a little away from the line, for speckle, grass and spray. Set how far with the Scatter slider.',
    keywords: ['pixel brush', 'scatter', 'jitter', 'spray', 'speckle', 'random'],
    checked: (s) => s.ui.tool === PIXEL_BRUSH_TOOL && getDab().scatter > 0,
    run: () => {
      open();
      setDab({ scatter: getDab().scatter > 0 ? 0 : 0.5 });
    },
  },
  {
    ...base,
    id: 'pixelbrush.spacing.closer',
    label: 'Pixel brush: dabs closer together',
    description: 'A step tighter: from dots with gaps toward a smooth, solid line.',
    keywords: ['pixel brush', 'spacing', 'closer', 'tighter', 'smoother', 'dabs'],
    run: () => {
      open();
      const s = stepSpacing(getDab().spacing, -1);
      setDab({ spacing: s });
      toast(`Spacing ${Math.round(s * 100)}%`, { duration: 1200 });
    },
  },
  {
    ...base,
    id: 'pixelbrush.spacing.wider',
    label: 'Pixel brush: dabs further apart',
    description: 'A step wider: from a smooth line toward beads, then dots with gaps.',
    keywords: ['pixel brush', 'spacing', 'wider', 'further', 'dotted', 'dabs', 'gaps'],
    run: () => {
      open();
      const s = stepSpacing(getDab().spacing, 1);
      setDab({ spacing: s });
      toast(`Spacing ${Math.round(s * 100)}%`, { duration: 1200 });
    },
  },
  {
    ...base,
    id: 'pixelbrush.pen',
    label: 'Pixel brush: pen pressure changes size on or off',
    description: 'Press harder for a bigger mark and lighter for a smaller one. A mouse counts as full pressure. Set how much under Pen, speed and fade.',
    keywords: ['pixel brush', 'pressure', 'pen', 'tablet', 'size', 'dynamics', 'wacom', 'control'],
    checked: (s) => s.ui.tool === PIXEL_BRUSH_TOOL && routeFor(getDab().dynamics, 'size')?.from === 'pressure',
    run: () => {
      open();
      const on = routeFor(getDab().dynamics, 'size')?.from === 'pressure';
      setDab({ dynamics: withRoute(getDab().dynamics, 'size', on ? null : { from: 'pressure' }) });
      toast(on ? 'Pressure no longer changes the size.' : 'Press harder for a bigger mark. A mouse paints at full size.', { duration: 1800 });
    },
  },
  {
    ...base,
    id: 'pixelbrush.feel',
    help: 'pixel-brush-curves',
    label: 'Pixel brush: change how the pen feels (next response curve)',
    description: 'Steps the pen pressure through the ready-made feels: even, light touch, firm hand, soft ends, ignore the lightest. Bend your own under Pen, speed and fade.',
    keywords: ['pixel brush', 'pressure', 'curve', 'pen', 'tablet', 'feel', 'response', 'sensitivity', 'light', 'firm', 'soft', 'wacom', 'procreate'],
    run: () => {
      open();
      const routes = getDab().dynamics;
      const mine = routes.filter((r) => r.from === 'pressure');
      if (mine.length === 0) {
        setDab({ dynamics: withRoute(routes, 'size', { from: 'pressure', curve: FEELS[1].curve }) });
        toast('Pen pressure now changes the size, with a light touch.', { duration: 1800 });
        return;
      }
      const now = feelOf(mine[0].curve);
      const next = FEELS[((now ? FEELS.indexOf(now) : -1) + 1) % FEELS.length];
      setDab({ dynamics: routes.map((r) => (r.from === 'pressure' ? { ...r, curve: next.id === 'straight' ? undefined : next.curve } : r)) });
      toast(`Pen feel: ${next.label}. ${next.hint}`, { duration: 2400 });
    },
  },
  {
    ...base,
    id: 'pixelbrush.blend',
    help: 'pixel-brush-blend',
    label: 'Pixel brush: next paint mode (Multiply, Screen, Overlay...)',
    description: 'Changes how the brush joins what is on the layer, one step at a time: paint over it, darken, lighten, tint and the rest of the layer blend modes. Pick one by name under Colour changes.',
    keywords: ['pixel brush', 'blend', 'blend mode', 'mode', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'dodge', 'burn', 'colour', 'tint', 'shade', 'photoshop', 'krita'],
    run: () => {
      open();
      const next = stepBlend(getDab().blend, 1);
      setDab({ blend: next });
      toast(next === 'normal' ? 'Paint mode: paint over what is there.' : `Paint mode: ${blendInfo(next).label} (${blendInfo(next).term}).`, { duration: 1800 });
    },
  },
  {
    ...base,
    id: 'pixelbrush.fade',
    label: 'Pixel brush: taper the end of the stroke on or off',
    description: 'The line starts at full size and thins to a point as it goes. Set how far under Pen, speed and fade.',
    keywords: ['pixel brush', 'fade', 'taper', 'thin', 'point', 'dynamics', 'fade out'],
    checked: (s) => s.ui.tool === PIXEL_BRUSH_TOOL && routeFor(getDab().dynamics, 'size')?.from === 'fade',
    run: () => {
      open();
      const on = routeFor(getDab().dynamics, 'size')?.from === 'fade';
      setDab({ dynamics: withRoute(getDab().dynamics, 'size', on ? null : { from: 'fade', amount: 1 }) });
      toast(on ? 'Strokes stay one size.' : 'Strokes now thin to a point.', { duration: 1600 });
    },
  },
  {
    ...base,
    id: 'pixelbrush.grain',
    label: 'Pixel brush: paper grain on or off',
    description: 'Paint catches on the high points of paper, so light strokes break into specks. The same papers as chalk and charcoal.',
    keywords: ['pixel brush', 'grain', 'texture', 'paper', 'tooth', 'chalk', 'rough', 'speckle'],
    checked: (s) => s.ui.tool === PIXEL_BRUSH_TOOL && !!getDab().grain,
    run: () => {
      open();
      setDab({ grain: getDab().grain ? null : DEFAULT_GRAIN });
    },
  },
  {
    ...base,
    id: 'pixelbrush.dual',
    label: 'Pixel brush: dual tip on or off',
    description: 'A second tip of little dots: the brush only paints where its dots are, for spatter and bristle looks.',
    keywords: ['pixel brush', 'dual', 'dual brush', 'second tip', 'texture', 'spatter', 'bristle', 'dots', 'photoshop'],
    checked: (s) => s.ui.tool === PIXEL_BRUSH_TOOL && !!getDab().dual,
    run: () => {
      open();
      setDab({ dual: getDab().dual ? null : DEFAULT_DUAL });
    },
  },
  {
    ...base,
    id: 'pixelbrush.picture.edit',
    help: 'pixel-brush-picture',
    label: 'Pixel brush: draw or edit the picture tip',
    description: 'Opens a little grid to draw the tip on, or to change the one you have: paint, rub out, fill, flip, turn, and see the brush as you go. Up to 32 by 32.',
    keywords: ['pixel brush', 'picture tip', 'tip editor', 'draw a brush', 'make a brush', 'custom brush', 'stamp', 'sprite', 'edit brush', 'image brush'],
    run: () => {
      open();
      editPictureTip();
    },
  },
  {
    ...base,
    id: 'pixelbrush.picture.file',
    help: 'pixel-brush-picture',
    label: 'Pixel brush: picture tip from an image file',
    description: 'Pick a picture file (PNG, GIF, JPEG, WebP or BMP) and make a tip from it. It is shrunk to fit 32 by 32 and opens in the editor so you can tidy it first.',
    keywords: ['pixel brush', 'picture tip', 'image', 'import', 'png', 'jpeg', 'load a brush', 'brush from image', 'custom brush', 'photoshop', 'stamp'],
    run: () => {
      open();
      void pictureTipFromFile();
    },
  },
  {
    ...base,
    id: 'pixelbrush.grain.picture',
    help: 'pixel-brush-texture',
    label: 'Pixel brush: grain from a picture',
    description: 'Pick a picture file and the brush catches on it instead of paper: it catches on the light parts. Switches grain on if it was off.',
    keywords: ['pixel brush', 'grain', 'texture', 'picture', 'image', 'pattern', 'canvas', 'weave', 'custom texture', 'photoshop', 'krita'],
    run: () => {
      open();
      void grainFromPicture();
    },
  },
  {
    ...base,
    id: 'pixelbrush.dual.picture',
    help: 'pixel-brush-texture',
    label: 'Pixel brush: dual tip from a picture',
    description: 'Pick a picture file and use it for the dual tip: the brush only paints where the darkest parts of the picture are. Switches the dual tip on if it was off.',
    keywords: ['pixel brush', 'dual', 'dual brush', 'second tip', 'picture', 'image', 'texture', 'bristle', 'pattern', 'photoshop'],
    run: () => {
      open();
      void dualFromPicture();
    },
  },
  {
    ...base,
    id: 'pixelbrush.wobble',
    label: 'Pixel brush: colour wobble on or off',
    description: 'Each dab shifts a little in hue and lightness, so a stroke wanders through nearby colours.',
    keywords: ['pixel brush', 'colour', 'color', 'jitter', 'wobble', 'hue', 'lightness', 'variation', 'dynamics'],
    checked: (s) => s.ui.tool === PIXEL_BRUSH_TOOL && !!routeFor(getDab().dynamics, 'hue'),
    run: () => {
      open();
      const on = !!routeFor(getDab().dynamics, 'hue');
      let r = withRoute(getDab().dynamics, 'hue', on ? null : { from: 'random', amount: 0.1 });
      r = withRoute(r, 'lightness', on ? null : { from: 'random', amount: 0.25 });
      setDab({ dynamics: r });
    },
  },
  {
    ...base,
    id: 'pixelbrush.wet',
    label: 'Pixel brush: wet paint on or off',
    description: 'The brush picks up colour from the paint it crosses and carries it along, so strokes smear into each other.',
    keywords: ['pixel brush', 'wet', 'mix', 'mixing', 'smear', 'blend', 'smudge', 'oil', 'mixer brush'],
    checked: (s) => s.ui.tool === PIXEL_BRUSH_TOOL && getDab().wet > 0,
    run: () => {
      open();
      setDab({ wet: getDab().wet > 0 ? 0 : 0.7 });
    },
  },
]);
