// Which end of the pen is on the page, when the system does not say. Windows, macOS and Wayland mark the eraser end with
// the eraser bit (buttons 32, button 5). Under X11 with libinput the eraser end arrives as a plain pen touch, but it is
// a separate device to the system, and Chromium shows that as a different `persistentDeviceId` (seen: pen 2, eraser 3,
// and back to 2 and 3 as the pen was flipped; pointerId stays the same). So the first device a pen touches with is the
// tip, and a touch from another device while no eraser bit has ever come is taken to be the eraser end.
// Pure and small, so the canvas, the pen check and the tests all read it the same way.

export interface ToolLike {
  pointerType: string;
  pointerId?: number;
  /** A number per physical device, 0 when the system does not say (Chromium 134 and later). */
  persistentDeviceId?: number;
  button: number;
  buttons: number;
}

export class ToolGuess {
  /** The device the tip of the pen is on: the first one that touched down. */
  tip: number | null = null;
  /** Devices seen touching, in order. */
  devices: number[] = [];
  /** The real eraser bit has come at least once, so nothing needs guessing. */
  bitSeen = false;

  constructor(public enabled = true) {}

  /** Learns from one pen event. Call it for every pen pointer event, before asking `isEraser`. */
  observe(e: ToolLike): void {
    if (e.pointerType !== 'pen') return;
    if (e.button === 5 || (e.buttons & 32) !== 0) {
      this.bitSeen = true;
      return;
    }
    const id = e.persistentDeviceId ?? 0;
    if (id <= 0 || (e.buttons & 1) === 0) return;
    if (!this.devices.includes(id)) this.devices.push(id);
    if (this.tip === null) this.tip = id;
  }

  /** True when this event comes from the eraser end, worked out from the device. False when the system said nothing else. */
  isEraser(e: ToolLike): boolean {
    if (!this.enabled || this.bitSeen || e.pointerType !== 'pen') return false;
    const id = e.persistentDeviceId ?? 0;
    return id > 0 && this.tip !== null && id !== this.tip;
  }

  /** Forgets what was learned (a new pen, or the tablet was unplugged and plugged back in). */
  reset(): void {
    this.tip = null;
    this.devices = [];
    this.bitSeen = false;
  }
}

/** The canvas's own. It only guesses on Linux, where the eraser bit can be missing (see `startPenHost`). */
export const penTools = new ToolGuess(false);
