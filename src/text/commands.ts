// Text commands: convert to shapes, and one per animation for the palette.
import type { Shape } from '../core/format';
import { uid } from '../core/doc';
import { poseAt } from '../core/symbols';
import type { Command } from '../core/registry';
import { store } from '../core/store';
import { currentKey } from '../symbols/ops';
import { toast } from '../ui/toast';
import { showPanel } from '../ui/dock';
import { TEXT_ANIMS } from './model';
import { addAnimator, selectedTexts } from './ops';
import { textToFill } from './convert';
import { putTextOnCurve, takeTextOffCurve, whyNoTextOffPath, whyNoTextOnPath } from './onPathOps';

/** Turns the selected text into filled shapes, as it looks on this frame. */
export function convertSelectedText(): void {
  const k = currentKey();
  const texts = selectedTexts();
  if (!k || !texts.length) return void toast('Select some text first.');
  if (k.layer.locked) return void toast('This layer is locked. Unlock it in the timeline first.');
  const { doc, ui } = store().get();
  const posed = poseAt(doc, k.layer, ui.frame);
  const fills = new Map<string, Shape>();
  for (const t of texts) {
    const shown = posed?.kind === 'vector' ? posed.shapes.find((s) => s.id === t.id) : undefined;
    const f = textToFill(shown?.type === 'text' ? shown : t, uid('sh'));
    if (f) fills.set(t.id, f);
  }
  if (!fills.size) return void toast('There was nothing to turn into shapes (the text is empty or hidden).');
  store().update(fills.size === 1 ? 'Convert text to shapes' : `Convert ${fills.size} texts to shapes`, (d) => {
    const dr = d.drawings[k.drawing.id];
    if (dr.kind === 'vector') dr.shapes = dr.shapes.map((s) => (fills.get(s.id) as never) ?? s);
  });
  store().setUi({ selection: [...fills.values()].map((s) => s.id) });
}

const hasText = () => selectedTexts().length > 0;

export const textCommands: Command[] = [
  {
    id: 'text.swapFonts',
    label: 'Swap fonts',
    category: 'Edit',
    description: 'Lists the fonts the drawing uses and where, says which are not on this computer, and swaps them for others in one undo step (replace fonts, missing fonts).',
    help: 'text-swap-fonts',
    keywords: ['replace font', 'replace fonts', 'missing font', 'missing fonts', 'change font', 'find font', 'font substitution', 'typeface', 'stand-in'],
    run: () => void import('./FontSwapDialog').then((m) => m.openFontSwap()),
  },
  {
    id: 'text.onPath',
    label: 'Put text on a curve (text on a path)',
    category: 'Draw',
    description: 'Runs words along a line or round a shape: a name round a badge, a title along a wave. The words stay editable, and move with the curve. Pick the text and the curve, or just the curve and it adds words.',
    help: 'text-on-path',
    keywords: ['text on a path', 'text on path', 'curved text', 'circular text', 'round a circle', 'round a badge', 'arc text', 'wavy text', 'wave', 'bend text', 'warp text', 'text along', 'follow a curve', 'badge', 'stamp', 'ring', 'logo'],
    keys: ['Mod+Alt+O'],
    enabled: () => !whyNoTextOnPath(),
    reason: () => whyNoTextOnPath(),
    run: putTextOnCurve,
  },
  {
    id: 'text.offPath',
    label: 'Take text off the curve',
    category: 'Draw',
    description: 'Puts words that run along a curve back on a straight line, where they are now.',
    help: 'text-on-path',
    keywords: ['text off path', 'straighten text', 'release text', 'detach text', 'unbend text', 'remove from path'],
    enabled: () => !whyNoTextOffPath(),
    reason: () => whyNoTextOffPath(),
    run: takeTextOffCurve,
  },
  {
    id: 'text.toShapes',
    label: 'Convert text to shapes',
    category: 'Draw',
    description: 'Turns the selected text into filled shapes you can reshape (outlines).',
    help: 'text',
    keywords: ['outline', 'outlines', 'create outlines', 'text to path', 'vectorise', 'convert'],
    keys: ['Mod+Shift+O'],
    enabled: hasText,
    run: convertSelectedText,
  },
  ...TEXT_ANIMS.map(
    (a): Command => ({
      id: `text.animate.${a.kind}`,
      label: `Animate text: ${a.label}`,
      category: 'Animate',
      description: a.description,
      help: 'text-animators',
      keywords: ['text animator', 'kinetic type', 'per letter', a.term.toLowerCase()],
      enabled: hasText,
      run: () => {
        addAnimator(a.kind);
        showPanel('text');
      },
    }),
  ),
];
