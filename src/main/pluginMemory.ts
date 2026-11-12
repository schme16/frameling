// How much memory each plugin's sandbox holds. Every plugin runs in a hidden frame whose address carries `?plugin=<id>`,
// and Chromium gives a sandboxed frame like that its own process, so the process's size is the plugin's size. Where
// two frames (or a frame and the app itself) share a process, nothing is said, since the number would not be one plugin's.

/** Chromium's switch that gives every sandboxed frame its own process (by default they all share one). Set before the app is ready. */
export const PLUGIN_PROCESS_FEATURE = 'IsolateSandboxedIframes:grouping/per-document';

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
