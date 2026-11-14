// Blend modes, effects, clipping, masks and folders as commands: the palette, the Effects menu and shortcuts.
import { registerChoice, withChoice } from '../core/choices';
import { findLayer } from '../core/doc';
import type { Layer } from '../core/format';
import { registerCommands, type Command } from '../core/registry';
import type { State } from '../core/store';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { showPanel } from '../ui/dock';
import { BLEND_MODES, EFFECTS } from './model';
import { maskPartner } from './masks';
import * as ops from './ops';

export type MaskScope = 'below' | 'all';

registerChoice<MaskScope>({
  id: 'effects.maskScope',
  title: 'Using a layer as a mask',
  question: 'This layer is going to be a mask: what is drawn on it shows the layers under it, and the rest is hidden. Which layers should it mask?',
  options: [
    { value: 'below', label: 'Just the layer under it', detail: 'The mask and that one layer go into a folder together. Drag more layers into the folder to mask them too.' },
    { value: 'all', label: 'Every layer under it', detail: 'The mask and every layer under it go into a folder together.' },
  ],
  default: 'below',
  category: 'Layers',
  help: 'masks',
});

export type MaskStart = 'show' | 'hide';

registerChoice<MaskStart>({
  id: 'effects.maskStart',
  title: 'A new mask starts as',
  question: 'You are adding a mask to this layer. What should it start as?',
  options: [
    { value: 'show', label: 'Paint where it shows', detail: 'The mask starts empty, so the layer is hidden until you paint on the mask. What you paint is what you see.', did: 'Added a mask that shows where you paint.' },
    { value: 'hide', label: 'Paint where it hides', detail: 'The layer shows in full, and what you paint on the mask is hidden. Like rubbing out, but you can change your mind later.', did: 'Added a mask that hides where you paint.' },
  ],
  default: 'show',
  category: 'Layers',
  help: 'masks',
});

export type MaskLeaves = 'keep' | 'plain';

registerChoice<MaskLeaves>({
  id: 'effects.maskLeavesFolder',
  title: 'A mask that leaves its folder',
  question: 'That mask is out of its folder now, so it reaches every layer under it. What should happen to it?',
  options: [
    { value: 'keep', label: 'Keep it a mask', detail: 'It now shows or hides every layer under it, not just the ones in its folder.', did: 'Kept it as a mask.' },
    { value: 'plain', label: 'Make it a plain layer again', detail: 'It stops being a mask and shows its drawing like any layer. Nothing is lost.', did: 'Made it a plain layer.' },
  ],
  default: 'keep',
  category: 'Layers',
  help: 'masks',
});

const active = (s: State): Layer | undefined => findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
const activeNow = () => active(store().get());

function openPanel(): void {
  showPanel('effects');
}

/** Toggles a layer being a mask, asking the first time how far a new mask should reach. */
export function toggleMask(layer: Layer | undefined = activeNow(), mode: 'show' | 'hide' = 'show'): void {
  if (!layer) return;
  if (layer.mask) {
    ops.setMask(layer.id, null);
    return;
  }
  if (layer.folder) {
    ops.setMask(layer.id, mode);
    return;
  }
  if (store().get().doc.layers[0]?.id === layer.id) {
    toast('A mask shows the layers under it, and this one is at the bottom. Put a layer under it first.');
    return;
  }
  withChoice<MaskScope>('effects.maskScope', (scope) => void ops.useAsMask(layer.id, scope, mode));
}

/** Adds a new mask above the layer (asking the first time what it starts as) and picks it, ready to paint on. */
export function addMask(layer: Layer | undefined = activeNow()): void {
  if (!layer) return;
  if (layer.kind === 'camera') {
    toast('The camera has nothing to mask. Pick a drawing layer.');
    return;
  }
  if (layer.mask) {
    toast('This layer is a mask already. Paint on it, or pick the layer you want to mask.');
    return;
  }
  withChoice<MaskStart>('effects.maskStart', (mode) => void ops.addMask(layer.id, mode));
}

/** Jumps between a mask and the layer it masks, so the next stroke goes on the other one. */
export function switchMaskAndLayer(): void {
  const s = store().get();
  const l = active(s);
  if (!l) return;
  const other = maskPartner(s.doc, l.id);
  if (!other) {
    toast(l.mask ? 'This mask has no layer under it to switch to.' : 'No mask on this layer yet. Add one first.');
    return;
  }
  store().setUi({ activeLayerId: other.id });
}

export function toggleClip(layer: Layer | undefined = activeNow()): void {
  if (!layer) return;
  if (!layer.clipToBelow && store().get().doc.layers[0]?.id === layer.id) {
    toast('This layer is at the bottom, so there is nothing under it to clip to.');
    return;
  }
  ops.setClip(layer.id, !layer.clipToBelow);
}

const effectCommands: Command[] = EFFECTS.map((e) => ({
  id: `effects.add.${e.kind}`,
  label: `Add ${e.label.toLowerCase()} (${e.term})`,
  category: 'Effects',
  description: e.description,
  help: 'effects',
  keywords: ['effect', 'fx', e.term.toLowerCase(), e.label.toLowerCase()],
  enabled: (s) => !!active(s),
  run: () => {
    const t = ops.activeTarget();
    if (t) ops.addEffect(t, e.kind);
    openPanel();
  },
}));

const blendCommands: Command[] = BLEND_MODES.map((b) => ({
  id: `effects.blend.${b.mode}`,
  label: `Blend mode: ${b.label}${b.term !== b.label ? ` (${b.term})` : ''}`,
  category: 'Blend',
  description: b.description,
  help: 'blend-modes',
  keywords: ['blend', 'mode', 'mix', b.term.toLowerCase()],
  checked: (s) => (active(s)?.blend ?? 'normal') === b.mode,
  run: () => {
    const t = ops.activeTarget();
    if (t) ops.setBlend(t, b.mode);
  },
}));

registerCommands([
  ...effectCommands,
  ...blendCommands,
  {
    id: 'effects.reset',
    label: 'Reset blend and effects',
    category: 'Effects',
    description: 'Put this layer back to plain: Normal blend and no effects.',
    help: 'effects',
    keywords: ['clear effects', 'remove effects', 'normal'],
    enabled: (s) => !!active(s)?.effects?.length || (active(s)?.blend ?? 'normal') !== 'normal',
    run: () => {
      const t = ops.activeTarget();
      if (t) ops.resetLook(t);
    },
  },
  {
    id: 'layers.clipToBelow',
    label: 'Clip to the layer below',
    category: 'Effects',
    keys: ['Mod+Alt+G'],
    description: 'Only show this layer where the layer under it has drawing. Great for shading inside lines. Also called a clipping mask.',
    help: 'masks',
    keywords: ['clipping mask', 'clip', 'inside', 'shade inside'],
    checked: (s) => !!active(s)?.clipToBelow,
    run: () => toggleClip(),
  },
  {
    id: 'layers.useAsMask',
    label: 'Use layer as a mask',
    category: 'Effects',
    description: 'This layer is not shown itself. What you draw on it shows the layers under it, and the rest is hidden. Also called a layer mask.',
    help: 'masks',
    keywords: ['mask', 'reveal', 'cut out', 'layer mask', 'stencil'],
    checked: (s) => !!active(s)?.mask,
    run: () => toggleMask(),
  },
  {
    id: 'layers.addMask',
    label: 'Add a mask to this layer',
    category: 'Effects',
    keys: ['Mod+Alt+Shift+M'],
    description: 'Adds a mask layer just above this one and picks it, so you paint where this layer shows. Paint with any tool.',
    help: 'masks',
    keywords: ['mask', 'layer mask', 'reveal', 'hide part', 'add mask', 'new mask', 'stencil'],
    enabled: (s) => !!active(s) && active(s)!.kind !== 'camera' && !active(s)!.mask,
    run: () => addMask(),
  },
  {
    id: 'layers.maskSwitch',
    label: 'Switch between the mask and its layer',
    category: 'Effects',
    keys: ['Mod+Alt+J'],
    description: 'On a mask, picks the layer it masks. On a masked layer, picks its mask. The next stroke goes on the one you picked.',
    help: 'masks',
    keywords: ['mask', 'paint the mask', 'paint the layer', 'jump', 'switch'],
    enabled: (s) => {
      const l = active(s);
      return !!l && !!maskPartner(s.doc, l.id);
    },
    run: () => switchMaskAndLayer(),
  },
  {
    id: 'layers.maskOnOff',
    label: 'Turn this mask on or off',
    category: 'Effects',
    description: 'Switches the mask off for a moment to see the layers without it. The mask and its drawing are kept, and it still exports as a mask.',
    help: 'masks',
    keywords: ['mask', 'disable mask', 'enable mask', 'switch off', 'peek'],
    enabled: (s) => !!active(s)?.mask,
    checked: (s) => !!active(s)?.mask && active(s)!.visible,
    run: () => {
      const l = activeNow();
      if (l?.mask) ops.setMaskOn(l.id, !l.visible);
    },
  },
  {
    id: 'layers.flipMask',
    label: 'Flip the mask (show or hide where it is painted)',
    category: 'Effects',
    description: 'Swaps what the mask does: where you painted shows the layer, or where you painted hides it. The drawing stays as it is.',
    help: 'masks',
    keywords: ['mask', 'invert mask', 'reverse', 'flip'],
    enabled: (s) => !!active(s)?.mask,
    run: () => {
      const l = activeNow();
      if (l?.mask) ops.flipMask(l.id);
    },
  },
  {
    id: 'layers.removeMask',
    label: 'Take the mask off for good',
    category: 'Effects',
    description: 'The layer stops being a mask and becomes a plain layer that shows its drawing. To get rid of the drawing too, delete the layer.',
    help: 'masks',
    keywords: ['mask', 'remove mask', 'delete mask', 'unmask'],
    enabled: (s) => !!active(s)?.mask,
    run: () => {
      const l = activeNow();
      if (l?.mask) ops.setMask(l.id, null);
    },
  },
  {
    id: 'layers.newFolder',
    label: 'Put layer in a new folder',
    category: 'Effects',
    description: 'Group layers in a folder, so they fade, blend and get masked together. Drag more layers into it. On a layer already in a folder, it makes a folder inside that folder.',
    help: 'layer-folders',
    keywords: ['group', 'folder', 'layer group'],
    enabled: (s) => !!active(s),
    run: () => {
      const l = activeNow();
      if (l) ops.makeFolder([l.id]);
    },
  },
  {
    id: 'layers.ungroupFolder',
    label: 'Take layers out of this folder',
    category: 'Effects',
    description: 'Removes the folder. Its layers stay where they are.',
    help: 'layer-folders',
    keywords: ['ungroup', 'remove folder'],
    enabled: (s) => !!active(s)?.folder,
    run: () => {
      const l = activeNow();
      if (l?.folder) ops.ungroupFolder(l.folder);
    },
  },
  {
    id: 'layers.intoFolder',
    label: 'Put layer in the folder next to it',
    category: 'Effects',
    description: 'Moves the layer into the folder just above it (or just below, if there is none above). It stays where it is in the picture. Alt+Right arrow while a layer is selected in the list.',
    help: 'layer-folders',
    keywords: ['nest', 'indent', 'into folder', 'group'],
    enabled: (s) => !!active(s),
    run: () => {
      const l = activeNow();
      if (l && !ops.nestNode({ layer: l.id })) toast('There is no folder next to this layer to put it in.');
    },
  },
  {
    id: 'layers.outOfFolder',
    label: 'Take layer out of its folder',
    category: 'Effects',
    description: 'Moves the layer out of its folder, to just above the folder (one level out when folders are inside folders). Alt+Left arrow while a layer is selected in the list.',
    help: 'layer-folders',
    keywords: ['unnest', 'outdent', 'out of folder'],
    enabled: (s) => !!active(s)?.folder,
    run: () => {
      const l = activeNow();
      if (l) ops.outdentNode({ layer: l.id });
    },
  },
  {
    id: 'layers.folderIntoFolder',
    label: 'Put this folder in the folder next to it',
    category: 'Effects',
    description: 'Makes the active layer\'s folder a folder inside the one just above it (or below). The folders can go up to 8 levels deep.',
    help: 'layer-folders',
    keywords: ['nest folder', 'folder in folder', 'subfolder'],
    enabled: (s) => !!active(s)?.folder,
    run: () => {
      const l = activeNow();
      if (l?.folder && !ops.nestNode({ folder: l.folder })) toast('There is no folder next to this one to put it in, or that would go too deep.');
    },
  },
  {
    id: 'layers.folderOutOfFolder',
    label: 'Take this folder out of its folder',
    category: 'Effects',
    description: 'Moves the active layer\'s folder out of the folder it is in, to just above that folder.',
    help: 'layer-folders',
    keywords: ['unnest folder', 'subfolder out'],
    enabled: (s) => {
      const f = active(s)?.folder;
      return !!f && !!s.doc.folders?.[f]?.parent;
    },
    run: () => {
      const l = activeNow();
      if (l?.folder) ops.outdentNode({ folder: l.folder });
    },
  },
]);
