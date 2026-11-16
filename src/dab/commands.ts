// Palette commands for the Pixel brush: the tip, edges, turning with the line, scatter, spacing and the picture tip.
import { registerCommands, type Command } from '../core/registry';
import { pickKindReason } from '../core/reasons';
import { toast } from '../ui/toast';
import { toolEnabled } from '../ui/dynamic';
import { pickTool } from '../tools/pick';
import { showPanel } from '../ui/dock';
import { TIP_SHAPES, type TipShape } from './maths';
import { getDab, setDab } from './settings';
import { pictureFromSelection } from './Options';
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
  picture: { label: 'picture', hint: 'A little picture of your own, stamped along the line.', keywords: ['stamp', 'custom', 'image', 'sprite'] },
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
    if (t === 'picture' && !getDab().picture) void pictureFromSelection();
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
]);
