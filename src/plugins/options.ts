// Options a plugin's exporter shows in the Export dialog (number, choice, switch, text) and the values kept for them.
// The plugin only describes them; Frameling draws the controls and passes the checked values to the export call. Pure.

export type ExportOption =
  | { id: string; type: 'number'; label: string; hint?: string; min: number; max: number; step: number; default: number }
  | { id: string; type: 'choice'; label: string; hint?: string; choices: { value: string; label: string }[]; default: string }
  | { id: string; type: 'switch'; label: string; hint?: string; default: boolean }
  | { id: string; type: 'text'; label: string; hint?: string; maxLength: number; default: string };

export type OptionValue = number | string | boolean;
export type OptionValues = Record<string, OptionValue>;

export const MAX_OPTIONS = 20;

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The option list, cleaned. Unknown kinds and repeated ids are dropped. */
export function sanitizeOptions(raw: unknown): ExportOption[] {
  const out: ExportOption[] = [];
  if (!Array.isArray(raw)) return out;
  for (const o of raw) {
    if (out.length >= MAX_OPTIONS) break;
    if (!isObj(o) || typeof o.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(o.id) || out.some((x) => x.id === o.id)) continue;
    const label = txt(o.label, 60) || o.id;
    const hint = txt(o.hint, 200);
    const base = { id: o.id, label, ...(hint ? { hint } : {}) };
    if (o.type === 'number') {
      const min = fin(o.min) ? o.min : 0;
      const max = fin(o.max) && o.max >= min ? o.max : Math.max(min, 100);
      const step = fin(o.step) && o.step > 0 ? o.step : 1;
      out.push({ ...base, type: 'number', min, max, step, default: Math.min(max, Math.max(min, fin(o.default) ? o.default : min)) });
    } else if (o.type === 'choice') {
      const choices = (Array.isArray(o.choices) ? o.choices : []).slice(0, 50).flatMap((c: unknown) => {
        if (typeof c === 'string') return [{ value: c.slice(0, 80), label: c.slice(0, 80) }];
        return isObj(c) && typeof c.value === 'string' ? [{ value: c.value.slice(0, 80), label: txt(c.label ?? c.value, 80) || c.value.slice(0, 80) }] : [];
      });
      if (!choices.length) continue;
      const def = typeof o.default === 'string' && choices.some((c: { value: string }) => c.value === o.default) ? o.default : choices[0].value;
      out.push({ ...base, type: 'choice', choices, default: def });
    } else if (o.type === 'switch') {
      out.push({ ...base, type: 'switch', default: !!o.default });
    } else if (o.type === 'text') {
      const maxLength = fin(o.maxLength) ? Math.min(500, Math.max(1, Math.round(o.maxLength))) : 100;
      out.push({ ...base, type: 'text', maxLength, default: txt(o.default, maxLength) });
    }
  }
  return out;
}

export function defaultValues(options: ExportOption[]): OptionValues {
  return Object.fromEntries(options.map((o) => [o.id, o.default]));
}

/** Checks values against the options: a wrong kind or out-of-range value falls back to the default, unknown ids are dropped. */
export function cleanValues(options: ExportOption[], raw: unknown): OptionValues {
  const src = isObj(raw) ? raw : {};
  const out: OptionValues = {};
  for (const o of options) {
    const v = src[o.id];
    switch (o.type) {
      case 'number': {
        if (!fin(v)) out[o.id] = o.default;
        else {
          const snapped = o.min + Math.round((Math.min(o.max, Math.max(o.min, v)) - o.min) / o.step) * o.step;
          out[o.id] = Math.min(o.max, Math.max(o.min, Number(snapped.toFixed(6))));
        }
        break;
      }
      case 'choice':
        out[o.id] = typeof v === 'string' && o.choices.some((c) => c.value === v) ? v : o.default;
        break;
      case 'switch':
        out[o.id] = typeof v === 'boolean' ? v : o.default;
        break;
      case 'text':
        out[o.id] = typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, o.maxLength) : o.default;
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- remembered values

const KEY = 'frameling.plugins.exportOptions.v1';

function readAll(): Record<string, unknown> {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}');
    return isObj(v) ? v : {};
  } catch {
    return {};
  }
}

/** What was used last time for this exporter, checked against its options now (new options start at their defaults). */
export function rememberedValues(pluginId: string, exporterId: string, options: ExportOption[]): OptionValues {
  return cleanValues(options, readAll()[`${pluginId}/${exporterId}`]);
}

export function rememberValues(pluginId: string, exporterId: string, values: OptionValues): void {
  try {
    const all = readAll();
    all[`${pluginId}/${exporterId}`] = values;
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch {
    // Then it lasts this visit.
  }
}

export function forgetValues(pluginId: string): void {
  try {
    const all = readAll();
    for (const k of Object.keys(all)) if (k.startsWith(`${pluginId}/`)) delete all[k];
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch {
    // Nothing to do.
  }
}
