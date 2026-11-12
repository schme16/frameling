// Turns the layered plan into PSD records, given a way to get pictures. Pure (the drawing is handed in), so the
// structure can be tested and read back with a PSD reader without a canvas.
import type { Layer, LayerFolder } from '../core/format';
import type { RawImage } from '../io/png';
import { itemLayers, type LayeredItem } from './layered';
import type { PsdLayer } from './psd';

export interface PsdPictures {
  /** A layer on its own at full opacity (effects applied), full canvas size. */
  layer(l: Layer): RawImage;
  /** A folder's layers drawn together with the folder's effects, but not its opacity or blend. */
  folder(f: LayerFolder, members: Layer[]): RawImage;
}

/** One byte per pixel from a picture's alpha (255 shows). `invert` flips it, for masks that hide where they draw. */
export function maskPixels(img: RawImage, invert: boolean): Uint8Array {
  const out = new Uint8Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = invert ? 255 - img.pixels[i * 4 + 3] : img.pixels[i * 4 + 3];
  return out;
}

/** PSD records for the plan, bottom first. */
export function psdRecords(plan: LayeredItem[], pics: PsdPictures): PsdLayer[] {
  // A mask layer's picture is needed twice (as the hidden layer and as the mask), so each layer is drawn once.
  const seen = new Map<string, RawImage>();
  const pic = (l: Layer) => {
    let p = seen.get(l.id);
    if (!p) seen.set(l.id, (p = pics.layer(l)));
    return p;
  };
  const maskOf = (l: Layer) => maskPixels(pic(l), l.mask === 'hide');

  const layer = (it: Extract<LayeredItem, { kind: 'layer' }>, forceHidden = false): PsdLayer => ({
    name: it.mask ? `${it.layer.name} (mask)` : it.layer.name,
    image: pic(it.layer),
    opacity: it.layer.opacity,
    blend: it.layer.blend ?? 'normal',
    hidden: it.hidden || forceHidden,
    clipping: it.clipping,
  });

  // The insides of a folder whose picture is baked: every layer hidden, inner folders kept as hidden groups.
  const hiddenWalk = (items: LayeredItem[]): PsdLayer[] =>
    items.flatMap((it): PsdLayer[] => {
      if (it.kind === 'layer') return [layer(it, true)];
      if (it.kind === 'masked') return hiddenWalk(it.layers);
      return [
        { name: it.folder.name, group: 'end', opacity: 1, blend: 'pass' },
        ...hiddenWalk(it.layers),
        { name: it.folder.name, group: 'open', opacity: it.folder.opacity, blend: it.passThrough ? 'pass' : (it.folder.blend ?? 'normal'), hidden: true },
      ];
    });

  const walk = (items: LayeredItem[]): PsdLayer[] => {
    const out: PsdLayer[] = [];
    for (const it of items) {
      if (it.kind === 'layer') {
        out.push(layer(it));
        continue;
      }
      if (it.kind === 'masked') {
        // Everything under a stage mask goes in an isolated (normal) group, like the canvas draws it, with the mask on the group.
        const name = `Masked by ${it.mask.name}`;
        out.push({ name, group: 'end', opacity: 1, blend: 'pass' }, ...walk(it.layers), { name, group: 'open', opacity: 1, blend: 'normal', mask: maskOf(it.mask) });
        continue;
      }
      out.push({ name: it.folder.name, group: 'end', opacity: 1, blend: 'pass' });
      const members = itemLayers(it.layers);
      if (it.baked) {
        // The folder has effects (glow, shadow...), which a group can't hold. The group gets one finished picture of the
        // folder (its masks and clipping already applied) and the layers stay inside, hidden, to edit or bring back.
        // Folders inside it stay as hidden groups.
        out.push(...hiddenWalk(it.layers));
        out.push({ name: `${it.folder.name} (with effects)`, image: pics.folder(it.folder, members.map((x) => x.layer)), opacity: 1, blend: 'normal' });
      } else {
        // A mask layer in a folder cuts only the layers under it: they sit in their own "Masked by" group inside the folder.
        out.push(...walk(it.layers));
      }
      out.push({ name: it.folder.name, group: 'open', opacity: it.folder.opacity, blend: it.passThrough ? 'pass' : (it.folder.blend ?? 'normal'), hidden: !it.folder.visible });
    }
    return out;
  };
  return walk(plan);
}
