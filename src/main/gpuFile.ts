// The "draw in software" switch that works from outside the app. If hardware drawing ever stopped the window opening,
// Preferences could not be reached to turn it off, so the switch is a plain empty file the start-up reads before any
// window exists: Frameling/gpu-off in the config folder, or
// FRAMELING_GPU=off in the environment. No electron import here, so tests can run it.
import fs from 'node:fs';
import path from 'node:path';

export const GPU_OFF_FILE = 'gpu-off';

interface Where {
  platform: string;
  env: Record<string, string | undefined>;
  home: string;
  /** Electron's appData folder (Windows and macOS). */
  appData: string;
}

/**
 * The file's place. On Linux it is `$XDG_CONFIG_HOME` or `~/.config`, then
 * Frameling/gpu-off; elsewhere it sits in the app's data folder, which is where the same name is read at start-up.
 */
export function gpuOffPath(w: Where): string {
  const base = w.platform === 'linux' ? w.env.XDG_CONFIG_HOME || path.join(w.home, '.config') : w.appData;
  return path.join(base, 'Frameling', GPU_OFF_FILE);
}

/** Is hardware drawing switched off, and by what? */
export function gpuOffState(file: string, env: Record<string, string | undefined>, exists: (p: string) => boolean = fs.existsSync): { file: boolean; env: boolean } {
  return { file: exists(file), env: env.FRAMELING_GPU === 'off' };
}

/** Writes or removes the file. Returns an error in plain words, or null when it worked. */
export function setGpuOffFile(file: string, off: boolean): string | null {
  try {
    if (off) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'Frameling draws in software while this file is here. Delete it, or turn Hardware drawing back on in Preferences > Performance.\n');
    } else {
      fs.rmSync(file, { force: true });
    }
    return null;
  } catch (e) {
    return `Frameling could not ${off ? 'write' : 'remove'} ${file}: ${(e as { code?: string })?.code ?? 'unknown error'}.`;
  }
}

/** Reads the total memory of an AMD card from its sysfs number (bytes), or null for anything else. */
export function parseVramBytes(text: string): number | null {
  const n = Number(text.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The biggest card memory Linux reports through sysfs (only AMD cards do; NVIDIA and Intel say nothing there). */
export function linuxVramBytes(root = '/sys/class/drm'): number | null {
  try {
    let best: number | null = null;
    for (const d of fs.readdirSync(root)) {
      if (!/^card\d+$/.test(d)) continue;
      try {
        const v = parseVramBytes(fs.readFileSync(path.join(root, d, 'device', 'mem_info_vram_total'), 'utf8'));
        if (v && (best === null || v > best)) best = v;
      } catch {
        // no such file for this card
      }
    }
    return best;
  } catch {
    return null;
  }
}
