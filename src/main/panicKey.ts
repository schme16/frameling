// The audience Stop key, working from any window while the person is on air. Best effort: some desktops (Wayland, some
// Linux setups) do not let an app listen for a key it is not focused for, and then the key only works inside Frameling
// and the on-screen Stop button is what to use. Nothing here touches Electron: the pieces are handed in, so it can be tested.

/** The key, in Electron's spelling. The same combination as the one inside the app (Ctrl+Alt+K, Cmd+Alt+K). */
export const PANIC_ACCELERATOR = 'CommandOrControl+Alt+K';

export interface PanicKeyDeps {
  /** Asks the desktop to call `fn` for the key. Returns false when it could not (a taken key, or a desktop that says no). */
  register(accelerator: string, fn: () => void): boolean;
  unregister(accelerator: string): void;
  /** Tells the page the key was pressed. */
  send(): void;
}

export interface PanicKey {
  /** Starts or stops listening. Returns whether the key is now listening, which is false when it is off or could not start. */
  set(on: boolean): boolean;
  readonly active: boolean;
}

export function createPanicKey(deps: PanicKeyDeps): PanicKey {
  let active = false;
  return {
    set(on) {
      if (on && !active) {
        try {
          active = deps.register(PANIC_ACCELERATOR, () => deps.send());
        } catch {
          active = false;
        }
      } else if (!on && active) {
        active = false;
        try {
          deps.unregister(PANIC_ACCELERATOR);
        } catch {
          // Already gone.
        }
      }
      return active;
    },
    get active() {
      return active;
    },
  };
}
