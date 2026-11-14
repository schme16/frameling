// Which graphics card Frameling asks for on a Linux computer that has more than one. Kept out of gpu.ts so a test can
// give it the cards of any machine as plain objects.
//
// Why this exists: the browser engine does not choose between cards, the system's OpenGL does, and on X11 that follows
// the screen: a computer with a discrete card and the onboard one can end up drawing on the onboard one (or on no card at
// all, as a virtual screen does). Frameling is a drawing app, so when there is a discrete card it asks for that one.
// The way to ask is the card makers' own switches, set in the environment before the engine starts, so the engine's
// graphics process inherits them:
//   NVIDIA (their own driver)  __NV_PRIME_RENDER_OFFLOAD=1, __GLX_VENDOR_LIBRARY_NAME=nvidia, __VK_LAYER_NV_optimus=NVIDIA_only
//   Mesa (AMD, NVIDIA's open driver)  DRI_PRIME=pci-<address of the discrete card>
// They are only set when the card they name is there with its driver loaded and its library installed, when nothing in the
// environment already says which card to use, and never with FRAMELING_CARD=system. Anything else is left to the system,
// which is what the app did before. FRAMELING_CARD=discrete asks for the discrete card even when it is the only one that
// works (a virtual screen, where nothing else would put the drawing on it).
import fs from 'node:fs';
import path from 'node:path';

export interface Card {
  /** PCI address, "0000:01:00.0". */
  pci: string;
  vendorId: number;
  deviceId: number;
  /** The kernel driver that has the card, or undefined when none does. */
  driver?: string;
  /** The card's own memory, when the system says (AMD only). */
  vramBytes?: number;
}

/** Drivers that have a card but do not draw for the desktop: it is set aside for a virtual machine or a stub. */
const NOT_FOR_DRAWING = new Set(['vfio-pci', 'pci-stub', 'xen-pciback']);

export const hasDrawingDriver = (c: Card): boolean => !!c.driver && !NOT_FOR_DRAWING.has(c.driver);

/** A card with its own memory and fan, as opposed to the onboard one. NVIDIA has no onboard cards on a desktop or laptop. */
export function isDiscrete(c: Card): boolean {
  if (c.vendorId === 0x10de) return true;
  // AMD's onboard graphics borrow a slice of main memory, a few hundred megabytes up to two gigabytes; cards have more.
  if (c.vendorId === 0x1002) return (c.vramBytes ?? 0) >= 3 * 1024 ** 3;
  return false; // Intel's discrete cards are rare and do not say, so they are left to the system
}

export type CardAsk = 'auto' | 'discrete' | 'system';

export function cardAsk(env: Record<string, string | undefined>): CardAsk {
  const v = (env.FRAMELING_CARD ?? '').trim().toLowerCase();
  return v === 'system' || v === 'discrete' ? v : 'auto';
}

/** What says which card to use. If any is set, someone chose already and Frameling leaves it. */
const ALREADY = ['DRI_PRIME', '__NV_PRIME_RENDER_OFFLOAD', '__GLX_VENDOR_LIBRARY_NAME', '__EGL_VENDOR_LIBRARY_FILENAMES', 'VK_DRIVER_FILES', 'VK_ICD_FILENAMES', 'MESA_VK_DEVICE_SELECT'];

/** The variables Frameling sets itself (so the second start can tell them from the person's own). */
export const STEERING_KEYS = ['DRI_PRIME', '__NV_PRIME_RENDER_OFFLOAD', '__GLX_VENDOR_LIBRARY_NAME', '__VK_LAYER_NV_optimus'];

export interface Steering {
  card: Card;
  env: Record<string, string>;
  /** One plain line for the log. */
  line: string;
}

/**
 * What to put in the environment to get the discrete card, or null to leave it to the system. `hasLib(name)` says whether a
 * graphics library is installed (the NVIDIA GLX one), so a driver that is loaded but half-installed never gets forced.
 */
export function steering(cards: readonly Card[], env: Record<string, string | undefined>, hasLib: (name: string) => boolean): Steering | null {
  const ask = cardAsk(env);
  if (ask === 'system') return null;
  if (ALREADY.some((k) => env[k])) return null; // the person or the system already said
  const usable = cards.filter(hasDrawingDriver);
  const discrete = usable.filter(isDiscrete);
  if (discrete.length !== 1) return null; // none to ask for, or two and no way to say which is wanted
  const card = discrete[0];
  if (ask === 'auto' && usable.length < 2) return null; // nothing to choose between
  if (card.vendorId === 0x10de && card.driver === 'nvidia') {
    if (!hasLib('libGLX_nvidia.so.0')) return null;
    return {
      card,
      env: { __NV_PRIME_RENDER_OFFLOAD: '1', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', __VK_LAYER_NV_optimus: 'NVIDIA_only' },
      line: '[gpu] asked for the discrete card (NVIDIA driver).',
    };
  }
  if (!card.driver) return null;
  return { card, env: { DRI_PRIME: 'pci-' + card.pci.replace(/[:.]/g, '_') }, line: '[gpu] asked for the discrete card (Mesa, ' + card.driver + ').' };
}

const read = (p: string): string | null => {
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch {
    return null;
  }
};

/** Every display card the system lists on the PCI bus (class 03xx), with its driver. Empty when it cannot read them. */
export function readCards(root = '/sys/bus/pci/devices'): Card[] {
  const out: Card[] = [];
  let names: string[] = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return out;
  }
  for (const n of names) {
    const dir = path.join(root, n);
    if (!(read(path.join(dir, 'class')) ?? '').startsWith('0x03')) continue;
    const vendorId = parseInt(read(path.join(dir, 'vendor')) ?? '', 16);
    const deviceId = parseInt(read(path.join(dir, 'device')) ?? '', 16);
    if (!Number.isFinite(vendorId) || !Number.isFinite(deviceId)) continue;
    let driver: string | undefined;
    try {
      driver = path.basename(fs.readlinkSync(path.join(dir, 'driver')));
    } catch {
      driver = undefined;
    }
    const v = Number(read(path.join(dir, 'mem_info_vram_total')));
    out.push({ pci: n, vendorId, deviceId, driver, vramBytes: Number.isFinite(v) && v > 0 ? v : undefined });
  }
  return out;
}

const LIB_DIRS = ['/usr/lib/x86_64-linux-gnu', '/usr/lib64', '/usr/lib', '/lib/x86_64-linux-gnu', '/usr/lib/aarch64-linux-gnu', '/usr/lib/nvidia'];
export const libInstalled = (name: string): boolean => LIB_DIRS.some((d) => fs.existsSync(path.join(d, name)));

/** The PCI id list the system ships (hwdata or pciutils), read once, for naming a card the engine did not. */
export function readPciIds(): string | null {
  for (const p of ['/usr/share/hwdata/pci.ids', '/usr/share/misc/pci.ids', '/usr/share/pci.ids']) {
    const t = read(p);
    if (t) return t;
  }
  return null;
}
