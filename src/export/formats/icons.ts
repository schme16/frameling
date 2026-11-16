// An app icon set: PNGs at every common size, a Windows .ico, a Mac .icns and (when asked) the phone sizes, in one zip.
import { zipSync, type Zippable } from 'fflate';
import { currentChoice } from '../../core/choices';
import { buildIcns, buildIco, planIcons, type IconFit } from '../icons';
import { slug } from '../plan';
import { breathe } from '../runtime';
import { squarePng } from './square';
import type { ExporterRun } from '../registry';
import '../choices';

export const run: ExporterRun['run'] = async ({ doc, settings, signal }, { plan, bg, crisp, step }) => {
  const set = planIcons(settings.iconFiles, slug(doc.name, 'icon'));
  const src = { doc, frame: plan.range.start, bg, crisp, fit: (currentChoice('export.iconFit') as IconFit | undefined) === 'fill' ? 'fill' : 'fit' } as const;
  const pngs = new Map<number, Uint8Array>();
  for (let i = 0; i < set.sizes.length; i++) {
    await breathe(signal, i);
    step(i, `Drawing the ${set.sizes[i]} pixel icon`);
    pngs.set(set.sizes[i], squarePng(src, set.sizes[i]));
  }
  step(set.sizes.length, 'Packing the zip');
  const files: Zippable = {};
  const add = (path: string, bytes: Uint8Array) => (files[path] = [bytes, { level: 0 }]);
  for (const p of set.pngs) add(p.path, pngs.get(p.size)!);
  if (set.ico) add(set.ico.path, buildIco(set.ico.sizes.map((size) => ({ size, png: pngs.get(size)! }))));
  if (set.icns) add(set.icns.path, buildIcns(set.icns.types.map((t) => ({ type: t.type, png: pngs.get(t.size)! }))));
  return { kind: 'file', name: `${plan.name}.zip`, bytes: zipSync(files) };
};
