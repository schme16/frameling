// ProRes through FFmpeg, when it's installed on this computer. The page streams raw RGBA frames; FFmpeg writes the
// .mov straight to the file the person picked. Nothing is bundled: without FFmpeg the format says so in plain words.
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;

/** Where FFmpeg might be. GUI apps on macOS don't get the shell's PATH, so the usual install places are tried too. */
export function candidates(platform: string = process.platform, env: NodeJS.ProcessEnv = process.env): string[] {
  const win = platform === 'win32';
  const p = win ? path.win32 : path.posix;
  const exe = win ? 'ffmpeg.exe' : 'ffmpeg';
  const list: string[] = [];
  if (env.FRAMELING_FFMPEG) list.push(env.FRAMELING_FFMPEG);
  // Windows spells it Path, and a copy of the environment (tests) isn't case-blind like process.env is there.
  const PATH = env.PATH ?? env.Path ?? '';
  for (const dir of PATH.split(win ? ';' : ':')) if (dir) list.push(p.join(dir.replace(/^"|"$/g, ''), exe));
  if (platform === 'darwin') list.push('/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/local/bin/ffmpeg');
  else if (win) {
    // The usual installs: by hand, winget, Chocolatey and Scoop. A program started before the install finished, or
    // from a shortcut, may not have them on its PATH yet.
    list.push('C:\\ffmpeg\\bin\\ffmpeg.exe', p.join(env.ProgramFiles ?? 'C:\\Program Files', 'ffmpeg', 'bin', 'ffmpeg.exe'));
    if (env.LOCALAPPDATA) list.push(p.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'));
    list.push(p.join(env.ProgramData ?? 'C:\\ProgramData', 'chocolatey', 'bin', 'ffmpeg.exe'));
    if (env.USERPROFILE) list.push(p.join(env.USERPROFILE, 'scoop', 'shims', 'ffmpeg.exe'));
  } else list.push('/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/snap/bin/ffmpeg');
  // Windows doesn't care about letter case, so C:\FFmpeg and c:\ffmpeg are tried once.
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = win ? x.toLowerCase() : x;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

export interface FfmpegProbe {
  ok: boolean;
  /** Plain words when it can't be used. */
  reason?: string;
  version?: string;
}

let probed: { bin: string | null; probe: FfmpegProbe } | null = null;

export function probeFfmpeg(): { bin: string | null; probe: FfmpegProbe } {
  if (probed) return probed;
  for (const bin of candidates()) {
    if (!fs.existsSync(bin)) continue;
    const v = spawnSync(bin, ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    if (v.status !== 0) continue;
    const enc = spawnSync(bin, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 8000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const version = /ffmpeg version (\S+)/.exec(v.stdout)?.[1];
    if (!/prores_ks/.test(enc.stdout)) {
      probed = { bin: null, probe: { ok: false, version, reason: "The FFmpeg on this computer can't make ProRes. Install a full build from ffmpeg.org, then open Export again." } };
      return probed;
    }
    probed = { bin, probe: { ok: true, version } };
    return probed;
  }
  probed = { bin: null, probe: { ok: false, reason: 'ProRes needs FFmpeg, a free video tool. Install it from ffmpeg.org, then open Export again.' } };
  return probed;
}

/** The FFmpeg arguments for ProRes 4444 (with alpha when asked) from raw RGBA on stdin. */
export function proresArgs(o: { width: number; height: number; fps: number; alpha: boolean; out: string }): string[] {
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${o.width}x${o.height}`,
    '-r', String(o.fps),
    '-i', '-',
    '-c:v', 'prores_ks',
    '-profile:v', '4444',
    '-pix_fmt', o.alpha ? 'yuva444p10le' : 'yuv444p10le',
    ...(o.alpha ? ['-alpha_bits', '16'] : []),
    '-vendor', 'apl0',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-an',
    '-movflags', '+faststart',
    o.out,
  ];
}

interface Job {
  proc: ChildProcessWithoutNullStreams;
  err: string;
  done: Promise<number | null>;
  out: string;
}

const jobs = new Map<number, Job>();
let nextJob = 1;

export function registerVideoIpc(handle: Handle, mayWrite: (p: string) => boolean): void {
  handle('video:probe', () => {
    probed = null;
    return probeFfmpeg().probe;
  });

  handle('video:start', (_e, out: string, o: { width: number; height: number; fps: number; alpha: boolean }) => {
    if (typeof out !== 'string' || !mayWrite(out)) return { error: 'Frameling can only save to a place you picked.' };
    const { bin, probe } = probeFfmpeg();
    if (!bin) return { error: probe.reason ?? 'FFmpeg was not found.' };
    const width = Math.round(Number(o?.width));
    const height = Math.round(Number(o?.height));
    const fps = Number(o?.fps);
    if (!(width > 0 && height > 0 && width <= 16384 && height <= 16384 && fps > 0 && fps <= 240)) return { error: 'That size or frame rate is not one ProRes can use.' };
    const proc = spawn(bin, proresArgs({ width, height, fps, alpha: !!o.alpha, out }), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const job: Job = { proc, err: '', out, done: new Promise((r) => proc.on('exit', (code) => r(code))) };
    proc.stderr.on('data', (d) => {
      if (job.err.length < 4000) job.err += String(d);
    });
    proc.stdin.on('error', () => undefined);
    const id = nextJob++;
    jobs.set(id, job);
    return { id };
  });

  handle('video:frame', async (_e, id: number, bytes: Uint8Array) => {
    const job = jobs.get(id);
    if (!job) return { error: 'The video was already finished.' };
    if (job.proc.exitCode !== null) return { error: `FFmpeg stopped early. ${job.err.trim().split('\n').pop() ?? ''}`.trim() };
    const ok = job.proc.stdin.write(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    if (!ok) await new Promise<void>((r) => job.proc.stdin.once('drain', () => r()));
    return { ok: true };
  });

  handle('video:finish', async (_e, id: number) => {
    const job = jobs.get(id);
    if (!job) return { error: 'The video was already finished.' };
    job.proc.stdin.end();
    const code = await job.done;
    jobs.delete(id);
    if (code !== 0) return { error: `FFmpeg couldn't finish the video. ${job.err.trim().split('\n').pop() ?? ''}`.trim() };
    return { ok: true };
  });

  handle('video:cancel', async (_e, id: number) => {
    const job = jobs.get(id);
    if (!job) return;
    jobs.delete(id);
    // FFmpeg tidies up on a polite stop by reading the rest of its input, so close that and stop it hard.
    job.proc.stdin.destroy();
    job.proc.kill('SIGKILL');
    await job.done;
    try {
      fs.rmSync(job.out, { force: true });
    } catch {
      // A half-written file left behind is untidy, not harmful.
    }
  });
}
