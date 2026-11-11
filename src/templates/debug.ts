// With ?debug in the page address, let scripts keep templates without the dialog (screenshots). Never on in normal use.
import { findTemplate } from '.';
import { saveUserTemplate } from './user';
import type { TemplateMeta } from './community';
import { renderFrameToCanvas } from '../core/render';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingTemplates: unknown }).__framelingTemplates = {
    /** Keeps a built-in template as one of yours, with the given words. */
    saveFrom: (builtinId: string, meta: TemplateMeta) => {
      const t = findTemplate(builtinId);
      return t ? saveUserTemplate(t.make(), { ...meta, frame: t.thumbnail?.() ?? 0 }) : null;
    },
    /** A template's gallery picture as a PNG data URL, fitted in w x h (for contact sheets). */
    thumb: (id: string, w = 320, h = 200, frame?: number) => {
      const t = findTemplate(id);
      if (!t) return null;
      const doc = t.make();
      const img = renderFrameToCanvas(doc, Math.max(0, Math.min(doc.length - 1, frame ?? t.thumbnail?.() ?? 0)), Math.min(w / doc.width, h / doc.height));
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = t.kind !== 'pixel';
      g.drawImage(img, 0, 0);
      return c.toDataURL('image/png');
    },
  };
}
