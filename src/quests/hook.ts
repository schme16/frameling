// Tells the engine when a command ran, without editing core: at quest start every registered command's `run` is
// wrapped, and `stop()` puts the originals back. The wrapper hands the command's own return value straight back, so
// callers that wait on a promise still get it.
import { allCommands, type Command } from '../core/registry';

export interface CommandWatch {
  /** Wraps commands registered since the last look (palette-made ones, late arrivals). */
  refresh(): void;
  /** Restores every command that is still wrapped. */
  stop(): void;
}

export function watchCommands(onRan: (id: string) => void, list: () => Command[] = allCommands): CommandWatch {
  const wrapped = new Map<Command, { orig: Command['run']; wrap: Command['run'] }>();

  const refresh = () => {
    for (const c of list()) {
      if (wrapped.has(c)) continue;
      const orig = c.run;
      const wrap: Command['run'] = function () {
        const r = orig.call(c);
        const done = () => {
          try {
            onRan(c.id);
          } catch {
            // The quest side failing must never break a command.
          }
        };
        if (r && typeof (r as Promise<void>).then === 'function') (r as Promise<void>).then(done, () => {});
        else done();
        return r;
      };
      wrapped.set(c, { orig, wrap });
      c.run = wrap;
    }
  };

  refresh();
  return {
    refresh,
    stop() {
      for (const [c, w] of wrapped) if (c.run === w.wrap) c.run = w.orig;
      wrapped.clear();
    },
  };
}
