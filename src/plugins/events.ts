// Events a version 2 plugin can hear about: a short summary of what happened, never the drawing itself (a plugin that
// wants more asks for it with `document.get()`, which needs its own permission). Delivery is rate-limited here.
import type { Doc } from '../core/format';

export const EVENT_NAMES = ['document.changed', 'selection.changed', 'frame.changed', 'export.started', 'export.finished'] as const;
export type PluginEventName = (typeof EVENT_NAMES)[number];

/** The fewest milliseconds between two of the same event. Changes in between are folded into one, sent at the end. */
export const EVENT_GAP: Record<PluginEventName, number> = {
  'document.changed': 300,
  'selection.changed': 100,
  'frame.changed': 80,
  'export.started': 0,
  'export.finished': 0,
};

/** Most events of all kinds sent to one plugin in a second. More are dropped. */
export const MAX_EVENTS_PER_SECOND = 40;
/** Events sent that the plugin has not finished with. Past this it is stuck, and gets no more. */
export const MAX_UNANSWERED = 200;

export interface DocumentSummary {
  /** The name of the step in Undo ("Draw stroke"), when there is one. */
  label: string;
  frame: number;
  length: number;
  layers: number;
  drawings: number;
  shapes: number;
}

/** Counts, no content. */
export function summarize(doc: Doc, frame: number, label: string | null): DocumentSummary {
  let shapes = 0;
  const drawings = Object.values(doc.drawings);
  for (const d of drawings) if (d.kind === 'vector') shapes += d.shapes.length;
  return { label: label ?? '', frame, length: doc.length, layers: doc.layers.length, drawings: drawings.length, shapes };
}

export type ExportEvent = { format: string; name: string; ok?: boolean; cancelled?: boolean; error?: string };

/** Sends events on, at most one per gap for each kind (the latest wins), and never more than a budget a second. */
export class EventGate {
  private last = new Map<string, number>();
  private held = new Map<string, unknown>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private windowStart = 0;
  private sent = 0;
  dropped = 0;

  constructor(
    private deliver: (name: PluginEventName, payload: unknown) => void,
    private now: () => number = () => Date.now(),
  ) {}

  offer(name: PluginEventName, payload: unknown): void {
    const gap = EVENT_GAP[name];
    const t = this.now();
    const since = t - (this.last.get(name) ?? -Infinity);
    if (gap && since < gap) {
      // Too soon: keep only the newest and send it when the gap is over.
      this.held.set(name, payload);
      if (!this.timers.has(name)) {
        this.timers.set(
          name,
          setTimeout(() => {
            this.timers.delete(name);
            if (this.held.has(name)) {
              const p = this.held.get(name);
              this.held.delete(name);
              this.offer(name, p);
            }
          }, gap - since),
        );
      }
      return;
    }
    this.held.delete(name);
    if (t - this.windowStart >= 1000) {
      this.windowStart = t;
      this.sent = 0;
    }
    if (this.sent >= MAX_EVENTS_PER_SECOND) {
      this.dropped++;
      return;
    }
    this.sent++;
    this.last.set(name, t);
    this.deliver(name, payload);
  }

  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.held.clear();
  }
}
