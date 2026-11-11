// Text commands: convert to shapes, and one per animation for the palette.
import type { Shape } from '../core/format';
import { uid } from '../core/doc';
import { poseAt } from '../core/symbols';
import { registerCommands, type Command } from '../core/registry';
import { store } from '../core/store';
import { currentKey } from '../symbols/ops';
import { toast } from '../ui/toast';
import { showPanel } from '../ui/dock';
import { TEXT_ANIMS } from './model';
import { addAnimator, selectedTexts } from './ops';
import { textToFill } from './convert';

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

registerCommands([
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
]);
