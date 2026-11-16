// A favicon set for a website: favicon.ico, the small PNGs, the touch icon, the two big icons, the manifest and the
// lines to paste into the page, in one zip.
import { zipSync, type Zippable } from 'fflate';
import { currentChoice } from '../../core/choices';
import { buildIco, faviconHtml, faviconManifest, faviconReadme, planFavicon, type IconFit } from '../icons';
import { breathe } from '../runtime';
import { squarePng } from './square';
import type { ExporterRun } from '../registry';
import '../choices';

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

export const run: ExporterRun['run'] = async ({ doc, signal }, { plan, bg, crisp, step }) => {
  const set = planFavicon();
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
  add(set.ico.path, buildIco(set.ico.sizes.map((size) => ({ size, png: pngs.get(size)! }))));
  for (const p of set.pngs) add(p.path, pngs.get(p.size)!);
  add('site.webmanifest', text(faviconManifest(doc.name)));
  add('head.html', text(faviconHtml()));
  add('README.txt', text(faviconReadme()));
  return { kind: 'file', name: `${plan.name}.zip`, bytes: zipSync(files) };
};
