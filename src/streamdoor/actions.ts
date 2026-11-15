// The example actions the door brings with it, registered through the audience gate like any other. All of them only
// change the view or put words on the screen (`touchesDrawing` is left out), so they are there with nothing else switched on.
//
// A copy-and-change pattern for the next action:
//   registerAudienceAction({ id: 'area.name', label: 'Plain words', kind: 'group-for-cooldown', cooldown: 5000,
//     parse: (raw) => cleaned payload or null,   // raw is whatever the caller sent as the JSON body; keep names out
//     run: (payload, ctx) => { ... } });         // view and words only, unless touchesDrawing: true (then ctx.edit)
import { getCommand } from '../core/registry';
import { runCommand } from '../ui/palette';
import { toast } from '../ui/toast';
import { registerAudienceAction } from '../audience';

/** The most a shown message may be, in characters. */
export const MESSAGE_MAX = 80;

// Control characters, zero-width and direction-changing marks, line and paragraph separators.
const ODD = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069]', 'g');

/** What a viewer's words become: the text of a `{ text }` body or a plain string, on one line, with nothing odd in it. Null when there is nothing to show. */
export function cleanMessage(raw: unknown): { text: string } | null {
  const v = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? (raw as { text?: unknown }).text : undefined;
  if (typeof v !== 'string') return null;
  const text = v.replace(ODD, ' ').replace(/\s+/g, ' ').trim();
  return text ? { text: text.slice(0, MESSAGE_MAX) } : null;
}

export type ZoomWay = 'in' | 'out';

/** `{ "direction": "in" | "out" }`, or the bare words "in" and "out". Null for anything else. */
export function cleanZoom(raw: unknown): { direction: ZoomWay } | null {
  const v = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? (raw as { direction?: unknown }).direction : undefined;
  return v === 'in' || v === 'out' ? { direction: v } : null;
}

const doCommand = (id: string): void => {
  const c = getCommand(id);
  if (c) runCommand(c);
};

/** Registers them. Returns nothing: they go with the feature (the gate's allowlist is owner-tracked). */
export function registerDoorActions(): void {
  registerAudienceAction({
    id: 'door.message',
    label: 'Show a message',
    kind: 'door',
    cooldown: 6000,
    parse: cleanMessage,
    run: ({ text }) => void toast(text, { duration: 6000, quill: null, sound: null }),
  });
  registerAudienceAction({
    id: 'door.zoom',
    label: 'Zoom the view in or out',
    kind: 'view',
    cooldown: 3000,
    parse: cleanZoom,
    run: ({ direction }) => doCommand(direction === 'in' ? 'view.zoomIn' : 'view.zoomOut'),
  });
  registerAudienceAction({
    id: 'door.fit-view',
    label: 'Fit the drawing in the window',
    kind: 'view',
    cooldown: 3000,
    run: () => doCommand('view.fit'),
  });
}
