// The processor and the memory, for the drawing report and a bug report. Pure: the desktop side reads the system
// (src/main/gpu.ts) and hands the raw text and numbers here. What is used on each platform:
//   Linux    /proc/cpuinfo for the model and the real core count (the engine's list only counts threads),
//            falling back to Node's os.cpus() for ARM boards that name no model there.
//   macOS    os.cpus(): the model reads "Apple M2" or "Intel(R) Core(TM) i7", and every entry is a thread.
//   Windows  os.cpus(): the name from the registry. Real cores are not known without a slower call, so none is claimed.
// Memory is os.totalmem() everywhere: what the computer has, not what Frameling holds.

/** What a processor is, in the few facts worth sending. */
export interface CpuInfo {
  /** The name as the system gives it, tidied (no (R), no (TM), one space between words). */
  model: string;
  /** Real cores, when the system says. Often fewer than threads, for a computer that runs two threads on each core. */
  cores?: number;
  /** What the system counts as a processor each: the number of things that can run at once. */
  threads: number;
  /** Node's name for it: x64, arm64, ia32... */
  arch: string;
}

/** The name with the trademark marks and the doubled spaces taken out, so it reads as a person would say it. */
export const tidyModel = (s: string): string =>
  s
    .replace(/\((?:R|TM|tm|r)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Reads what Linux's /proc/cpuinfo says: the model and how many real cores there are. */
export function parseCpuinfo(text: string): { model?: string; cores?: number } {
  const blocks = text.split(/\n\s*\n/);
  let model: string | undefined;
  const seen = new Set<string>();
  let perPackage = 0;
  const packages = new Set<string>();
  for (const b of blocks) {
    const get = (k: string): string | undefined => b.match(new RegExp(`^${k}\\s*:\\s*(.*)$`, 'mi'))?.[1]?.trim();
    model ??= get('model name') || get('Hardware') || get('Model') || get('cpu model') || undefined;
    const core = get('core id');
    const pkg = get('physical id') ?? '0';
    if (core !== undefined) {
      seen.add(`${pkg}:${core}`);
      packages.add(pkg);
    }
    const n = Number(get('cpu cores'));
    if (n > 0) perPackage = n;
  }
  // Unique (package, core) pairs are the real count; "cpu cores" times packages is the fallback when ids are missing.
  const cores = seen.size || (perPackage ? perPackage * Math.max(1, packages.size) : undefined);
  return { model: model ? tidyModel(model) : undefined, cores };
}

/** Puts the system's answers together. `cpuinfo` is the text of /proc/cpuinfo on Linux, null elsewhere or when unreadable. */
export function readCpu(o: { cpus: { model: string }[]; arch: string; cpuinfo?: string | null }): CpuInfo {
  const info = o.cpuinfo ? parseCpuinfo(o.cpuinfo) : {};
  const model = info.model || tidyModel(o.cpus[0]?.model ?? '') || 'not reported';
  const threads = o.cpus.length;
  const cores = info.cores && info.cores > 0 && (!threads || info.cores <= threads) ? info.cores : undefined;
  return { model, ...(cores ? { cores } : {}), threads, arch: o.arch };
}

/** The architecture in plain words with Node's name second. */
export function archText(arch: string): string {
  const names: Record<string, string> = { x64: '64-bit Intel or AMD', arm64: '64-bit ARM (Apple silicon, Snapdragon, Raspberry Pi)', ia32: '32-bit Intel or AMD', arm: '32-bit ARM' };
  return names[arch] ? `${names[arch]} (${arch})` : arch || 'not reported';
}

/** "AMD Ryzen 7 5800X 8-Core Processor, 8 cores, 16 threads". */
export function cpuText(c?: CpuInfo): string {
  if (!c) return 'not reported';
  const n = (x: number, w: string) => `${x} ${w}${x === 1 ? '' : 's'}`;
  const counts = c.cores ? `${n(c.cores, 'core')}, ${n(c.threads, 'thread')}` : n(c.threads, 'thread');
  return `${c.model}, ${counts}`;
}
