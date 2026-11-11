// Turning a video's Opus sound into AAC with ffmpeg, when ffmpeg is on this computer. Electron can't encode AAC
// itself, and Opus inside MP4 plays silent in QuickTime, Safari and on iPhones. The picture is copied as it is.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { candidates } from './video';

let found: string | null | undefined;

/** The ffmpeg to use (the same places ProRes looks, see video.ts) that can make AAC, or null. Looked up once. */
export function ffmpegPath(): string | null {
  if (found !== undefined) return found;
  found = null;
  for (const cand of candidates()) {
    if (!fs.existsSync(cand)) continue;
    try {
      const r = spawnSync(cand, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 8000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
      if (r.status === 0 && /\baac\b/.test(r.stdout)) {
        found = cand;
        break;
      }
    } catch {
      // Try the next one.
    }
  }
  return found;
}

/** The same MP4 with its sound as AAC, or null when that couldn't be done (the caller keeps the original). */
export async function mp4SoundToAac(bytes: Uint8Array): Promise<Uint8Array | null> {
  const ff = ffmpegPath();
  if (!ff) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frameling-aac-'));
  const src = path.join(dir, 'in.mp4');
  const out = path.join(dir, 'out.mp4');
  try {
    fs.writeFileSync(src, bytes);
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn(ff, ['-v', 'error', '-y', '-i', src, '-map', '0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { windowsHide: true, stdio: 'ignore' });
      const t = setTimeout(() => p.kill(), 120_000);
      p.on('error', () => resolve(false));
      p.on('close', (code) => {
        clearTimeout(t);
        resolve(code === 0);
      });
    });
    return ok && fs.existsSync(out) ? new Uint8Array(fs.readFileSync(out)) : null;
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
