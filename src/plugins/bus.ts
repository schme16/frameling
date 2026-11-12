// A doorway for telling plugins what happened (an export started, say) from parts of the app that should not need to
// know plugins exist. Costs nothing when no plugin listens.
import type { PluginEventName } from './events';

type Payload = Record<string, unknown> | (() => Record<string, unknown>);
type Sink = (name: PluginEventName, payload: Payload) => void;

let sink: Sink | null = null;

/** The plugin manager listens here. */
export function setEventSink(fn: Sink | null): void {
  sink = fn;
}

export function emitPluginEvent(name: PluginEventName, payload: Payload): void {
  try {
    sink?.(name, payload);
  } catch {
    // A plugin's trouble never gets in the way of the app.
  }
}
