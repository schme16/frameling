// Palette and menu commands for the retouch brushes. The tools themselves get a command (and a key) from the tool list; these
// are the clone stamp's source and its two answers, which have a button on the options too.
import { registerCommands, type Command } from '../core/registry';
import { currentChoice, setChoice } from '../core/choices';
import { pickKindReason } from '../core/reasons';
import { getHover } from '../canvas/controller';
import { activeLayer } from '../tools/edit';
import { pickTool } from '../tools/pick';
import { showPanel } from '../ui/dock';
import { toolEnabled } from '../ui/dynamic';
import { toast } from '../ui/toast';
import { cloneAim, resetCloneAim, setCloneSource } from './aim';
import { CLONE_ALIGN_CHOICE, type CloneAlign } from './choices';
import { retouchStore, type CloneSample } from './settings';
import { CLONE_TOOL } from './tools';

const onPixel = () => toolEnabled(['pixel']);
const reason = pickKindReason(['pixel'], 'The clone stamp');
const base = { category: 'Pixel', layers: ['pixel' as const], enabled: onPixel, reason, help: 'clone-stamp' };
const open = (): void => {
  pickTool(CLONE_TOOL);
  showPanel('tool-options');
};

const SAMPLE_WORDS: Record<CloneSample, { label: string; description: string; did: string }> = {
  layer: { label: 'only this layer', description: 'The clone stamp copies only what is on the layer you paint on, so it never brings in the colours of the layer under your line art.', did: 'The clone stamp copies from this layer only.' },
  visible: { label: 'everything you see', description: 'The clone stamp copies the picture as it looks, every layer together, and paints the copy onto this layer.', did: 'The clone stamp copies from everything you can see.' },
};
const ALIGN_WORDS: Record<CloneAlign, { label: string; description: string }> = {
  aligned: { label: 'carry on after you lift', description: 'The copy keeps the same gap from your hand, so the next stroke carries on in step with the last one.' },
  restart: { label: 'start again after you lift', description: 'Every stroke begins by copying the spot you chose, so you can stamp the same patch again and again.' },
};

const sample = (s: CloneSample): Command => ({
  ...base,
  id: `clone.sample.${s}`,
  label: `Clone stamp: copy from ${SAMPLE_WORDS[s].label}`,
  description: SAMPLE_WORDS[s].description,
  keywords: ['clone stamp', 'clone', 'sample', 'source', 'layer', 'visible', 'all layers', 'sample all layers', 'current layer'],
  checked: () => retouchStore('clone').get().sample === s,
  run: () => {
    open();
    retouchStore('clone').set({ sample: s });
    toast(SAMPLE_WORDS[s].did, { duration: 1800 });
  },
});

const align = (a: CloneAlign): Command => ({
  ...base,
  id: `clone.align.${a}`,
  label: `Clone stamp: ${ALIGN_WORDS[a].label}`,
  description: ALIGN_WORDS[a].description,
  keywords: ['clone stamp', 'clone', 'aligned', 'align', 'non-aligned', 'restart', 'lift', 'source', 'offset'],
  checked: () => currentChoice<CloneAlign>(CLONE_ALIGN_CHOICE) === a,
  run: () => {
    open();
    setChoice(CLONE_ALIGN_CHOICE, a);
    toast(a === 'aligned' ? 'Cloning carries on in step after you lift the pen.' : 'Cloning starts from the source again after you lift the pen.', { duration: 1800 });
  },
});

registerCommands([
  {
    ...base,
    id: 'clone.source.here',
    label: 'Clone stamp: copy from the spot under the pointer',
    description: 'Chooses where the clone stamp copies from, without Alt. Hold the pointer over the part of the picture you want to copy, then use this.',
    keywords: ['clone stamp', 'clone', 'source', 'set source', 'choose source', 'copy from', 'alt click'],
    run: () => {
      open();
      const h = getHover();
      const { layer } = activeLayer();
      if (!h || !layer || layer.kind !== 'pixel') {
        toast('Hold the pointer over the picture first, then use this.', { duration: 2200 });
        return;
      }
      setCloneSource({ x: h.x / layer.pixelSize, y: h.y / layer.pixelSize });
      toast('Copying from here. Now paint where you want the copy.', { duration: 2200 });
    },
  },
  {
    ...base,
    id: 'clone.forget',
    label: 'Clone stamp: choose a new source',
    description: 'Forgets the spot the clone stamp copies from, so your next click chooses a new one.',
    keywords: ['clone stamp', 'clone', 'source', 'forget', 'reset', 'new source'],
    enabled: () => onPixel() && !!cloneAim().source,
    reason: (s) => (onPixel() ? 'No source chosen yet. Alt-click the part of the picture to copy.' : reason(s)),
    run: () => {
      resetCloneAim();
      toast('Source forgotten. Click to choose a new one.', { duration: 1800 });
    },
  },
  sample('layer'),
  sample('visible'),
  align('aligned'),
  align('restart'),
]);
