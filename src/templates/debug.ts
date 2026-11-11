// With ?debug in the page address, let scripts keep templates without the dialog (screenshots). Never on in normal use.
import { findTemplate } from '.';
import { saveUserTemplate } from './user';
import type { TemplateMeta } from './community';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingTemplates: unknown }).__framelingTemplates = {
    /** Keeps a built-in template as one of yours, with the given words. */
    saveFrom: (builtinId: string, meta: TemplateMeta) => {
      const t = findTemplate(builtinId);
      return t ? saveUserTemplate(t.make(), { ...meta, frame: t.thumbnail?.() ?? 0 }) : null;
    },
  };
}
