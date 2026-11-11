/**
 * Reading blend modes, effects, masks and folders back from a file, checked. Anything odd is dropped rather than
 * failing the whole file: a layer that loses a glow is better than a document that won't open.
 */
import type { EffectKey, Layer, LayerEffect, LayerFolder } from '../core/format';
import { defaultValues, effectInfo, isBlendMode, isEffectKind } from './model';

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function readEffects(raw: unknown): LayerEffect[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: LayerEffect[] = [];
  for (const e of raw) {
    if (!isObj(e) || !isEffectKind(e.kind)) continue;
    const info = effectInfo(e.kind);
    const values = defaultValues(e.kind);
    const src = isObj(e.values) ? e.values : {};
    for (const p of info.params) {
      const v = src[p.key];
      if (p.type === 'number' && typeof v === 'number' && Number.isFinite(v)) values[p.key] = v;
      if (p.type === 'color' && typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) values[p.key] = v;
    }
    const keys: EffectKey[] = [];
    for (const k of Array.isArray(e.keys) ? e.keys : []) {
      if (!isObj(k) || typeof k.frame !== 'number' || !isObj(k.values)) continue;
      const kv: Record<string, number> = {};
      for (const p of info.params) if (p.type === 'number' && typeof k.values[p.key] === 'number' && Number.isFinite(k.values[p.key])) kv[p.key] = k.values[p.key];
      if (Object.keys(kv).length && !keys.some((x) => x.frame === Math.round(k.frame))) keys.push({ frame: Math.max(0, Math.round(k.frame)), values: kv });
    }
    keys.sort((a, b) => a.frame - b.frame);
    out.push({
      id: typeof e.id === 'string' ? e.id : `fx${out.length}`,
      kind: e.kind,
      ...(e.on === false ? { on: false } : {}),
      values,
      ...(keys.length ? { keys } : {}),
    });
  }
  return out.length ? out : undefined;
}

/** The look fields of a raw layer, to spread into the layer being built. */
export function readLayerLook(l: Record<string, any>): Partial<Pick<Layer, 'blend' | 'effects' | 'clipToBelow' | 'mask' | 'folder'>> {
  const out: Partial<Pick<Layer, 'blend' | 'effects' | 'clipToBelow' | 'mask' | 'folder'>> = {};
  if (isBlendMode(l.blend) && l.blend !== 'normal') out.blend = l.blend;
  const fx = readEffects(l.effects);
  if (fx) out.effects = fx;
  if (l.clipToBelow === true) out.clipToBelow = true;
  if (l.mask === 'show' || l.mask === 'hide') out.mask = l.mask;
  if (typeof l.folder === 'string') out.folder = l.folder;
  return out;
}

/**
 * The folders, checked. Layers naming a folder that isn't there leave it. Returns an empty object when there are
 * no folders, so callers can spread it.
 */
export function readFolders(raw: unknown, layers: Layer[]): { folders?: Record<string, LayerFolder> } {
  const folders: Record<string, LayerFolder> = {};
  if (isObj(raw)) {
    for (const [id, f] of Object.entries(raw)) {
      if (!isObj(f)) continue;
      folders[id] = {
        id,
        name: typeof f.name === 'string' ? f.name : 'Folder',
        visible: f.visible !== false,
        opacity: typeof f.opacity === 'number' && Number.isFinite(f.opacity) ? Math.min(1, Math.max(0, f.opacity)) : 1,
        ...(isBlendMode(f.blend) && f.blend !== 'normal' ? { blend: f.blend } : {}),
        ...(readEffects(f.effects) ? { effects: readEffects(f.effects) } : {}),
      };
    }
  }
  for (const l of layers) if (l.folder && !folders[l.folder]) delete l.folder;
  // Folders nobody uses are dropped.
  const used = new Set(layers.map((l) => l.folder).filter(Boolean));
  for (const id of Object.keys(folders)) if (!used.has(id)) delete folders[id];
  return Object.keys(folders).length ? { folders } : {};
}
