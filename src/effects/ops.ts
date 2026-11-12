/**
 * Look edits on the app's store, each one undo step with a plain-words label. Sliders coalesce, so dragging one is a
 * single undo.
 */
import type { BlendMode, EffectKind, Id } from '../core/format';
import { store } from '../core/store';
import * as edit from './edit';
import type { Target } from './edit';
import { blendInfo, effectInfo } from './model';

function run(label: string, fn: (d: Parameters<Parameters<ReturnType<typeof store>['update']>[1]>[0]) => unknown, coalesce?: string): boolean {
  let did = false;
  store().update(label, (d) => void (did = !!fn(d)), coalesce ? { coalesce } : {});
  return did;
}

const tkey = (t: Target) => ('layer' in t ? `l:${t.layer}` : `f:${t.folder}`);
const frame = () => store().get().ui.frame;

/** What the Effects panel works on: the active layer's folder when `folder` is asked for, else the active layer. */
export function activeTarget(): Target | null {
  const { doc, ui } = store().get();
  const l = doc.layers.find((x) => x.id === ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  return l ? { layer: l.id } : null;
}

export function setBlend(t: Target, mode: BlendMode): boolean {
  return run(`Blend mode: ${blendInfo(mode).label}`, (d) => edit.setBlend(d, t, mode));
}

export function addEffect(t: Target, kind: EffectKind): Id | null {
  let id: Id | null = null;
  run(`Add ${effectInfo(kind).label.toLowerCase()}`, (d) => (id = edit.addEffect(d, t, kind)));
  return id;
}

export const removeEffect = (t: Target, id: Id) => run('Remove effect', (d) => edit.removeEffect(d, t, id));
export const moveEffect = (t: Target, id: Id, dir: -1 | 1) => run('Reorder effects', (d) => edit.moveEffect(d, t, id, dir));
export const setEffectOn = (t: Target, id: Id, on: boolean) => run(on ? 'Turn effect on' : 'Turn effect off', (d) => edit.setEffectOn(d, t, id, on));
export const setEffectValue = (t: Target, id: Id, key: string, v: number | string) =>
  run('Change effect', (d) => edit.setEffectValue(d, t, id, key, v, frame()), `fx:${tkey(t)}:${id}:${key}:${frame()}`);
export const setEffectAnimated = (t: Target, id: Id, on: boolean) => run(on ? 'Animate effect' : 'Stop animating effect', (d) => edit.setEffectAnimated(d, t, id, on, frame()));
export const removeEffectKey = (t: Target, id: Id) => run('Remove effect key', (d) => edit.removeEffectKey(d, t, id, frame()));
export const resetEffect = (t: Target, id: Id) => run('Reset effect', (d) => edit.resetEffect(d, t, id));
export const resetLook = (t: Target) => run('Reset blend and effects', (d) => edit.resetLook(d, t));

export const setClip = (layerId: Id, on: boolean) => run(on ? 'Clip to the layer below' : 'Stop clipping', (d) => edit.setClip(d, layerId, on));
export const setMask = (layerId: Id, mode: 'show' | 'hide' | null) => run(mode ? 'Make mask' : 'Stop being a mask', (d) => edit.setMask(d, layerId, mode));
export const useAsMask = (layerId: Id, scope: 'below' | 'all', mode: 'show' | 'hide' = 'show') => run('Use as mask', (d) => edit.useAsMask(d, layerId, scope, mode));

export function makeFolder(layerIds: Id[]): Id | null {
  let id: Id | null = null;
  run('Put in a folder', (d) => (id = edit.makeFolder(d, layerIds)));
  return id;
}
export const ungroupFolder = (folderId: Id) => run('Take layers out of folder', (d) => edit.ungroupFolder(d, folderId));
export const renameFolder = (folderId: Id, name: string) => run('Rename folder', (d) => edit.setFolderProps(d, folderId, { name }));
export const setFolderVisible = (folderId: Id, visible: boolean) => run(visible ? 'Show folder' : 'Hide folder', (d) => edit.setFolderProps(d, folderId, { visible }));
export const setFolderOpacity = (folderId: Id, opacity: number) => run('Change folder opacity', (d) => edit.setFolderProps(d, folderId, { opacity }), `folder-opacity:${folderId}`);
export const moveLayerInto = (layerId: Id, to: number, folder: Id | null) => run('Move layer', (d) => edit.moveLayerInto(d, layerId, to, folder));

const nodeWord = (n: edit.Node) => ('layer' in n ? 'layer' : 'folder');
export const moveNode = (drag: edit.Node, target: edit.Node, where: edit.Drop) => run(`Move ${nodeWord(drag)}`, (d) => edit.moveNode(d, drag, target, where));
export const stepNode = (n: edit.Node, dir: 'up' | 'down') => run(dir === 'up' ? `Move ${nodeWord(n)} up` : `Move ${nodeWord(n)} down`, (d) => edit.stepNode(d, n, dir));
export const nestNode = (n: edit.Node) => run(`Put ${nodeWord(n)} in the folder next to it`, (d) => edit.nestNode(d, n));
export const outdentNode = (n: edit.Node) => run(`Take ${nodeWord(n)} out of its folder`, (d) => edit.outdentNode(d, n));
