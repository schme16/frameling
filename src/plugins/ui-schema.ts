// A plugin panel is described, never drawn by the plugin: a small tree of known parts (text, buttons, sliders...).
// This checks whatever the plugin sent and keeps only what Frameling knows how to show. Pure.

export type UiNode =
  | { type: 'column' | 'row'; children: UiNode[] }
  | { type: 'text'; text: string; style?: 'title' | 'muted' }
  | { type: 'divider' }
  | { type: 'button'; id: string; label: string; primary?: boolean }
  | { type: 'checkbox'; id: string; label: string; value: boolean }
  | { type: 'slider'; id: string; label: string; min: number; max: number; step: number; value: number }
  | { type: 'number'; id: string; label: string; min?: number; max?: number; step?: number; value: number }
  | { type: 'text-input'; id: string; label: string; value: string }
  | { type: 'select'; id: string; label: string; options: { value: string; label: string }[]; value: string }
  | { type: 'color'; id: string; label: string; value: string };

const MAX_NODES = 200;
const MAX_DEPTH = 6;

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const txt = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : '');
const id = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : null);
const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);

/** The panel tree, cleaned. Unknown parts are dropped; a broken tree becomes an empty column. */
export function sanitizeUi(raw: unknown): UiNode {
  let count = 0;
  const walk = (n: unknown, depth: number): UiNode | null => {
    if (!isObj(n) || ++count > MAX_NODES) return null;
    switch (n.type) {
      case 'column':
      case 'row': {
        if (depth >= MAX_DEPTH) return null;
        const children = (Array.isArray(n.children) ? n.children : []).map((c: unknown) => walk(c, depth + 1)).filter((c: UiNode | null): c is UiNode => !!c);
        return { type: n.type, children };
      }
      case 'text':
        return { type: 'text', text: txt(n.text, 1000), ...(n.style === 'title' || n.style === 'muted' ? { style: n.style } : {}) };
      case 'divider':
        return { type: 'divider' };
    }
    const i = id(n.id);
    if (!i) return null;
    const label = txt(n.label, 80);
    switch (n.type) {
      case 'button':
        return { type: 'button', id: i, label: label || 'Go', ...(n.primary ? { primary: true } : {}) };
      case 'checkbox':
        return { type: 'checkbox', id: i, label, value: !!n.value };
      case 'slider': {
        const min = num(n.min, 0);
        const max = Math.max(min, num(n.max, 100));
        const step = Math.max(0, num(n.step, 1));
        return { type: 'slider', id: i, label, min, max, step, value: Math.min(max, Math.max(min, num(n.value, min))) };
      }
      case 'number':
        return { type: 'number', id: i, label, value: num(n.value, 0), ...(typeof n.min === 'number' ? { min: n.min } : {}), ...(typeof n.max === 'number' ? { max: n.max } : {}), ...(typeof n.step === 'number' ? { step: n.step } : {}) };
      case 'text-input':
        return { type: 'text-input', id: i, label, value: txt(n.value, 500) };
      case 'select': {
        const options = (Array.isArray(n.options) ? n.options : []).slice(0, 100).flatMap((o: unknown) => (isObj(o) ? [{ value: txt(o.value, 80), label: txt(o.label ?? o.value, 80) }] : typeof o === 'string' ? [{ value: o.slice(0, 80), label: o.slice(0, 80) }] : []));
        const value = txt(n.value, 80);
        return { type: 'select', id: i, label, options, value: options.some((o: { value: string }) => o.value === value) ? value : (options[0]?.value ?? '') };
      }
      case 'color':
        return { type: 'color', id: i, label, value: typeof n.value === 'string' && /^#[0-9a-f]{6}$/i.test(n.value) ? n.value : '#000000' };
    }
    return null;
  };
  const root = walk(raw, 0);
  if (!root) return { type: 'column', children: [] };
  return root.type === 'column' || root.type === 'row' ? root : { type: 'column', children: [root] };
}
