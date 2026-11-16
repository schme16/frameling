// Working out which card is really in use and what it is called. Pure: strings in, plain answers out, so every
// machine's shape (a hybrid laptop, a desktop with a card and the onboard one, a virtual screen) is a test case.
//
// Three sources, from the most to the least trustworthy:
//   1. the renderer text a page's own WebGL says ("ANGLE (NVIDIA, Vulkan 1.4 (NVIDIA GeForce RTX 4080 SUPER (0x2702)), ...)"):
//      it is what the engine really made the drawing context on, so it is the only one that cannot be stale;
//   2. the engine's own device string and GL strings, when it fills them (it often does not on Linux);
//   3. the vendor and device ids looked up in the system's PCI list, which names a card with no driver involved.
// The engine's "active" flag is not trusted on its own: on a two-card machine it can point at the onboard card while the
// page is drawing on the other one.

export type RendererApi = 'Vulkan' | 'OpenGL' | 'Direct3D' | 'Metal' | 'Software' | 'unknown';

export interface RendererInfo {
  /** The card's name with the API noise taken off, or null when the renderer names none (software, empty). */
  name: string | null;
  api: RendererApi;
  /** The PCI device id, when the renderer text carries one (ANGLE on Vulkan does). */
  deviceId?: number;
  /** A software renderer (llvmpipe, SwiftShader, Microsoft Basic Render Driver). */
  soft: boolean;
}

const SOFT = /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render|microsoft basic/i;
export const isSoftwareRenderer = (s: string | undefined | null): boolean => !!s && SOFT.test(s);

/** "NVIDIA Device (0x2702)", "AMD Device 164e", "Device 2702": the engine's stand-in when it has no real name. */
export function isGenericName(s: string | undefined | null): boolean {
  const t = (s ?? '').trim();
  if (!t) return true;
  return /^(\S+\s+)?(graphics\s+)?device\s*\(?(0x)?[0-9a-f]{2,8}\)?$/i.test(t) || /^(vendor\s+)?0x[0-9a-f]+$/i.test(t);
}

/** Takes the API and driver noise off a card name: "NVIDIA NVIDIA GeForce RTX 4080" and "GeForce/PCIe/SSE2 Direct3D11 vs_5_0". */
function tidyName(raw: string): string {
  let n = raw
    .replace(/\s*\(0x[0-9a-f]+\)\s*$/i, '')
    .replace(/\/.*$/, '')
    .replace(/\s+Direct3D\d*.*$/i, '')
    .replace(/^ANGLE Metal Renderer:\s*/i, '')
    .replace(/\s*\((?:radeonsi|radv|iris|anv|nouveau|zink|nvk)[^)]*\)\s*$/i, '')
    .replace(/\s*\(TM\)|\(R\)/gi, '')
    .trim();
  // "NVIDIA NVIDIA GeForce" is the Vulkan driver's vendor in front of a name that already starts with it.
  n = n.replace(/^(\S+)\s+\1\b/i, '$1');
  return n.replace(/\s{2,}/g, ' ').trim();
}

/** Splits an ANGLE renderer at its top-level commas. The middle part is the card; the vendor comes first, the API last. */
function angleParts(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

/** Reads a WebGL renderer string, the way ANGLE writes it on every system (or a bare driver string). */
export function parseRenderer(renderer: string | undefined | null): RendererInfo {
  const s = (renderer ?? '').trim();
  if (!s) return { name: null, api: 'unknown', soft: false };
  const soft = isSoftwareRenderer(s);
  const angle = /^ANGLE \((.*)\)$/s.exec(s)?.[1];
  const parts = angle ? angleParts(angle) : [s];
  const tail = parts.slice(1).join(', ');
  let api: RendererApi = 'unknown';
  if (/\bVulkan\b/i.test(tail)) api = 'Vulkan';
  else if (/Direct3D|D3D1\d|D3D9/i.test(s)) api = 'Direct3D';
  else if (/\bMetal\b/i.test(s)) api = 'Metal';
  else if (/OpenGL/i.test(tail) || !angle) api = 'OpenGL';
  if (soft) api = 'Software';
  if (soft) return { name: null, api, soft };

  let mid = parts[1] ?? parts[0] ?? '';
  let deviceId: number | undefined;
  // Vulkan: "Vulkan 1.4.351 (NVIDIA NVIDIA GeForce RTX 4080 SUPER (0x00002702))"
  const vk = /^Vulkan [\d.]+ \((.*)\)$/s.exec(mid);
  if (vk) mid = vk[1];
  const id = /\(0x([0-9a-f]+)\)\s*$/i.exec(mid);
  if (id) deviceId = parseInt(id[1], 16);
  const name = tidyName(mid);
  return { name: name && !isGenericName(name) ? name : null, api, deviceId, soft: false };
}

const VENDOR_WORDS: Array<[number, RegExp]> = [
  [0x10de, /nvidia|geforce|quadro|\brtx\b|tesla/i],
  [0x1002, /\bamd\b|ati\b|radeon/i],
  [0x8086, /intel|\barc\b|\biris\b|\buhd\b/i],
  [0x106b, /apple/i],
  [0x5143, /qualcomm|adreno/i],
  [0x13b5, /\barm\b|mali/i],
];

/** Which vendor a renderer text names, as a PCI vendor id, or null. */
export function rendererVendor(renderer: string | undefined | null): number | null {
  const s = renderer ?? '';
  for (const [id, re] of VENDOR_WORDS) if (re.test(s)) return id;
  return null;
}

export interface CardLike {
  vendorId: number;
  deviceId: number;
  active: boolean;
}

/**
 * Which card is really drawing, from what a page's WebGL says: the index into `devices`, or -1 when the renderer is
 * software (no card is drawing at all). With no renderer to go on, the engine's own `active` flag is all there is.
 * Order: the device id the renderer carries, then the vendor (when only one card has that vendor, or the engine's pick is
 * of that vendor, or the vendor is NVIDIA, whose cards are never the onboard one), else the engine's pick.
 */
export function activeIndex(devices: readonly CardLike[], renderer: string | undefined | null): number {
  const engine = devices.findIndex((d) => d.active);
  const fallback = engine >= 0 ? engine : devices.length ? 0 : -1;
  const info = parseRenderer(renderer);
  if (info.soft) return -1;
  if (!renderer || !renderer.trim()) return fallback;
  if (info.deviceId !== undefined) {
    const i = devices.findIndex((d) => d.deviceId === info.deviceId);
    if (i >= 0) return i;
  }
  const v = rendererVendor(renderer);
  if (v === null) return fallback;
  const same = devices.map((d, i) => (d.vendorId === v ? i : -1)).filter((i) => i >= 0);
  if (same.length === 0) return fallback;
  if (same.length === 1) return same[0];
  return same.includes(engine) ? engine : same[0];
}

/** The text between square brackets in a PCI name, which is the marketing name: "AD103 [GeForce RTX 4080 SUPER]". */
const bracket = (s: string): string | null => {
  const all = [...s.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
  return all.length ? all[all.length - 1] : null;
};

const PCI_VENDOR_SHORT: Record<number, string> = { 0x10de: 'NVIDIA', 0x1002: 'AMD', 0x8086: 'Intel' };

/**
 * Looks a vendor and device id up in the text of a PCI id list (pci.ids, which Linux ships in hwdata). Returns a plain
 * name such as "NVIDIA GeForce RTX 4080 SUPER", or null when the list does not know the pair.
 */
export function pciIdsName(text: string, vendorId: number, deviceId: number): string | null {
  const hex = (n: number) => n.toString(16).padStart(4, '0');
  const lines = text.split('\n');
  const vHeader = hex(vendorId) + '  ';
  let i = lines.findIndex((l) => l.startsWith(vHeader));
  if (i < 0) return null;
  const vendorName = lines[i].slice(vHeader.length).trim();
  const dHeader = '\t' + hex(deviceId) + '  ';
  for (i += 1; i < lines.length; i++) {
    const l = lines[i];
    if (l && !l.startsWith('\t') && !l.startsWith('#')) return null; // next vendor
    if (!l.startsWith(dHeader)) continue;
    const raw = l.slice(dHeader.length).trim();
    const marketing = bracket(raw) ?? raw;
    const short = PCI_VENDOR_SHORT[vendorId] ?? vendorName.replace(/\s*(Corporation|Corp\.?|Inc\.?|\[.*\]).*$/i, '').trim();
    // "Advanced Micro Devices, Inc. [AMD/ATI] Raphael" lists as "Raphael"; keep the maker in front unless the name has it.
    const name = new RegExp(`^${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(marketing) ? marketing : `${short} ${marketing}`;
    return name.trim();
  }
  return null;
}

/**
 * The best honest name for one card. `deviceString` is the engine's; `renderer` the page's WebGL text (only meaningful for
 * the card that is drawing); `pciName` the lookup. A generic "NVIDIA Device (0x2702)" never wins over a real name.
 */
export function bestName(o: { deviceString?: string; renderer?: string | null; glRenderer?: string | null; pciName?: string | null; isActive: boolean }): string | undefined {
  const live = o.isActive ? parseRenderer(o.renderer).name : null;
  if (live) return live;
  if (o.deviceString && !isGenericName(o.deviceString)) return o.deviceString;
  const gl = o.isActive ? parseRenderer(o.glRenderer).name : null;
  if (gl) return gl;
  return o.pciName ?? undefined;
}

/** The API a live renderer says the card is reached through, when it says (the engine's own part list often does not). */
export const rendererApi = (renderer: string | undefined | null): RendererApi => parseRenderer(renderer).api;
