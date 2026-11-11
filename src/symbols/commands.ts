// Symbol and tween commands: palette, menus (Draw and Animate) and keys.
import { lazyPanel } from '../core/lazy';
import { getCommand, registerCommands, registerPanel } from '../core/registry';
import { celAt, findLayer } from '../core/doc';
import { store, type State } from '../core/store';
import { EASE_PRESETS } from '../core/ease';
import { toast } from '../ui/toast';
import { clearShapeHints, hintTarget, makeShapeTween, makeTweenAsking, setTweenKind, currentKey, deleteUnused, editInstance, leaveSymbol, makeSymbolFromSelection, makeTween, pathFromSelection, removeTween, resetTransform, selectedInstance, setEase } from './ops';

registerPanel({ id: 'library', title: 'Library', icon: 'symbol', component: lazyPanel(() => import('./LibraryPanel').then((m) => m.LibraryPanel)), zone: 'right', order: 30, help: 'symbols' });
registerPanel({ id: 'symbol-props', title: 'Symbol and motion', icon: 'tween', component: lazyPanel(() => import('./PropertiesPanel').then((m) => m.PropertiesPanel)), zone: 'right', order: 35, help: 'symbol-properties' });

const inside = (s: State) => !!s.doc.editing?.length;
const tweenHere = (s: State) => {
  const l = findLayer(s.doc, s.ui.activeLayerId);
  return !!(l && celAt(l, s.ui.frame)?.tween);
};
const cameraKeyHere = (s: State) => {
  const l = findLayer(s.doc, s.ui.activeLayerId);
  return l?.kind === 'camera' && !!celAt(l, s.ui.frame);
};
const showPanel = (id: string) => void getCommand(`view.panel.${id}`)?.run();

registerCommands([
  {
    id: 'symbols.make',
    label: 'Make a reusable symbol',
    category: 'Draw',
    keys: ['F8'],
    description: 'Turns the selection (or the whole drawing) into a symbol you can place again and again.',
    keywords: ['convert to symbol', 'symbol', 'component', 'movie clip', 'graphic', 'reuse', 'library', 'group'],
    help: 'symbols',
    run: () => void makeSymbolFromSelection(),
  },
  {
    id: 'symbols.edit',
    label: 'Draw inside the symbol',
    category: 'Draw',
    keys: ['F9'],
    description: 'Opens the selected symbol so you can change its drawing. Every copy changes with it.',
    keywords: ['edit symbol', 'edit in place', 'enter', 'open symbol', 'double-click'],
    help: 'symbols-editing',
    enabled: () => !!selectedInstance(),
    run: () => void editInstance(),
  },
  {
    id: 'symbols.exit',
    label: 'Back out of the symbol',
    category: 'Draw',
    keys: ['Shift+F9'],
    description: 'Closes the symbol you are drawing inside and goes back one level.',
    keywords: ['exit symbol', 'leave', 'up', 'scene', 'breadcrumb', 'done'],
    help: 'symbols-editing',
    enabled: inside,
    run: () => void leaveSymbol(),
  },
  {
    id: 'symbols.exitAll',
    label: 'Back to the scene',
    category: 'Draw',
    description: 'Closes every open symbol and goes back to the main stage.',
    keywords: ['exit symbol', 'main timeline', 'stage', 'scene'],
    help: 'symbols-editing',
    enabled: inside,
    run: () => void leaveSymbol(Infinity),
  },
  {
    id: 'symbols.swap',
    label: 'Swap symbol...',
    category: 'Draw',
    description: 'Puts a different symbol in the selected one\'s place, keeping its position, size and turn.',
    keywords: ['swap', 'replace', 'change symbol', 'mouth', 'pose'],
    help: 'symbol-properties',
    enabled: () => !!selectedInstance(),
    run: () => showPanel('symbol-props'),
  },
  {
    id: 'symbols.resetTransform',
    label: 'Reset symbol size and turn',
    category: 'Draw',
    keywords: ['reset transform', 'scale', 'rotation', 'undo resize'],
    help: 'symbol-properties',
    enabled: () => !!selectedInstance(),
    run: () => void resetTransform(),
  },
  {
    id: 'symbols.deleteUnused',
    label: 'Delete unused symbols',
    category: 'Draw',
    description: 'Removes symbols that nothing uses, to tidy the Library.',
    keywords: ['clean up', 'library', 'purge', 'unused'],
    help: 'symbols',
    enabled: (s) => !!Object.keys(s.doc.symbols ?? {}).length,
    run: () => {
      const n = deleteUnused();
      toast(n ? `Deleted ${n} unused symbol${n === 1 ? '' : 's'}.` : 'Every symbol is in use, so nothing was deleted.', n ? { action: { label: 'Undo', run: () => store().undo() } } : {});
    },
  },
  {
    id: 'tween.make',
    label: 'Make in-betweens (tween)',
    category: 'Animate',
    keys: ['Mod+Shift+T'],
    description: 'Makes the drawing glide, grow, turn or fade from this key to the next. Frameling draws the frames between.',
    keywords: ['tween', 'classic tween', 'motion tween', 'inbetween', 'in-between', 'interpolate', 'move', 'animate'],
    help: 'tweens',
    enabled: (s) => (!!currentKey() || cameraKeyHere(s)) && !tweenHere(s),
    run: () => makeTweenAsking(),
  },
  {
    id: 'tween.morph',
    label: 'Morph between shapes (shape tween)',
    category: 'Animate',
    keys: ['Mod+Shift+M'],
    description: "Melts this key's outlines and colours into the next key's drawing. Draw a square here and a circle there, and it morphs.",
    keywords: ['shape tween', 'morph', 'blend shapes', 'transform shape', 'inbetween', 'tween'],
    help: 'shape-tweens',
    enabled: (s) => !!currentKey() && !(findLayer(s.doc, s.ui.activeLayerId) && celAt(findLayer(s.doc, s.ui.activeLayerId)!, s.ui.frame)?.tween?.kind === 'shape'),
    run: () => {
      if (tweenHere(store().get())) void setTweenKind('shape');
      else void makeShapeTween();
    },
  },
  {
    id: 'tween.hints',
    label: 'Add shape hints',
    category: 'Animate',
    description: 'Pin a point of the first drawing to a point of the last one, so a morph that twists comes out right.',
    keywords: ['shape hint', 'hints', 'morph', 'twist', 'shape tween', 'match points'],
    help: 'shape-hints',
    enabled: () => !!hintTarget(),
    run: () => store().setUi({ tool: 'shape-hints' }),
  },
  {
    id: 'tween.hints.clear',
    label: 'Remove all shape hints',
    category: 'Animate',
    keywords: ['shape hint', 'clear hints', 'morph'],
    help: 'shape-hints',
    enabled: () => !!hintTarget()?.cel.tween?.hints?.length,
    run: () => void clearShapeHints(),
  },
  {
    id: 'tween.remove',
    label: 'Remove in-betweens',
    category: 'Animate',
    keywords: ['remove tween', 'delete tween', 'stop tween'],
    help: 'tweens',
    enabled: tweenHere,
    run: () => void removeTween(),
  },
  {
    id: 'tween.drawPath',
    label: 'Draw a path to follow',
    category: 'Animate',
    description: 'Draw the line the in-betweens travel along, instead of a straight line.',
    keywords: ['motion path', 'guide', 'curve', 'follow path', 'orient'],
    help: 'motion-paths',
    enabled: (s) => !!findLayer(s.doc, s.ui.activeLayerId) && !!currentKey(),
    run: () => store().setUi({ tool: 'motion-path' }),
  },
  {
    id: 'tween.pathFromSelection',
    label: 'Follow the selected line',
    category: 'Animate',
    description: 'Uses a line you drew (and selected) as the path for the in-betweens here.',
    keywords: ['motion path', 'guide layer', 'follow path'],
    help: 'motion-paths',
    enabled: (s) => s.ui.selection.length > 0,
    run: () => void pathFromSelection(),
  },
  ...EASE_PRESETS.map((p) => ({
    id: `tween.ease.${p.id}`,
    label: `Easing: ${p.label}`,
    category: 'Animate',
    description: `${p.description} (${p.term})`,
    keywords: ['ease', 'easing', 'tween', p.term],
    help: 'easing',
    enabled: tweenHere,
    run: () => void setEase(p.id),
  })),
]);
