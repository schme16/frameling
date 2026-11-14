// How much memory each plugin's sandbox holds, when it is being measured. Every plugin runs in a hidden frame whose
// address carries `?plugin=<id>`. Normally all of them share one process (cheap). With "Measure plugins' memory and
// speed" on, the next start gives each its own (about 90 MB each), so the process's size is the plugin's size. Where
// two frames (or a frame and the app itself) share a process, nothing is said, since the number would not be one plugin's.
import fs from 'node:fs';
import path from 'node:path';

/** Chromium's switch that gives every sandboxed frame its own process (by default they all share one). Set before the app is ready, and only while measuring is on. */
export const PLUGIN_PROCESS_FEATURE = 'IsolateSandboxedIframes:grouping/per-document';

/** An empty file in the app's data folder. Its presence at start means "Measure plugins' memory and speed" was on, so sandboxes get processes of their own. */
export const DIAGNOSTICS_FLAG = 'plugin-diagnostics.flag';

export function isolationWanted(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, DIAGNOSTICS_FLAG));
  } catch {
    return false;
  }
}

export function wantIsolation(dir: string, on: boolean): void {
  try {
    const file = path.join(dir, DIAGNOSTICS_FLAG);
    if (on) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, '');
    } else fs.rmSync(file, { force: true });
  } catch {
    // Then the choice lasts only until the next start; measuring still works without the memory part.
  }
}

export interface FrameInfo {
  url: string;
  pid: number;
}
export interface ProcessInfo {
  pid: number;
  /** Kilobytes held in memory (Electron's workingSetSize). */
  workingSetKb: number;
}

/** Plugin id to bytes, for the plugins that have a process to themselves. */
export function pluginMemory(frames: FrameInfo[], procs: ProcessInfo[], appPid: number): Record<string, number> {
  const owners = new Map<number, string[]>();
  for (const f of frames) {
    const m = /\/plugin-host(?:-net)?\.html\?plugin=([a-z0-9-]{1,60})$/.exec(f.url);
    if (!m) continue;
    owners.set(f.pid, [...(owners.get(f.pid) ?? []), m[1]]);
  }
  // A process that also holds the app's own page is not the plugin's alone.
  for (const f of frames) if (!/\/plugin-host/.test(f.url)) owners.delete(f.pid);
  const out: Record<string, number> = {};
  for (const [pid, ids] of owners) {
    if (ids.length !== 1 || pid === appPid) continue;
    const p = procs.find((x) => x.pid === pid);
    if (p) out[ids[0]] = Math.round(p.workingSetKb * 1024);
  }
  return out;
}
