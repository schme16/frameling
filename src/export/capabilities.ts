// What this computer can encode as video, asked up front so the dialog can grey things out and say why.
import { canEncodeVideo, type VideoCodec } from 'mediabunny';

export interface VideoSupport {
  ok: boolean;
  codec: VideoCodec | null;
  /** Can this format keep a see-through background here? */
  alpha: boolean;
  /** Plain-words reason when not ok. */
  reason: string | null;
}

export interface Capabilities {
  mp4: VideoSupport;
  webm: VideoSupport;
}

const NO_ENCODER = "This computer's video encoder isn't available, so videos can't be made here.";

async function can(codec: VideoCodec, width: number, height: number, alpha = false): Promise<boolean> {
  try {
    return await canEncodeVideo(codec, { width, height, ...(alpha ? { alpha: 'keep' as const } : {}) });
  } catch {
    return false;
  }
}

const cache = new Map<string, Promise<Capabilities>>();

export function detectCapabilities(width: number, height: number): Promise<Capabilities> {
  const key = `${width}x${height}`;
  let p = cache.get(key);
  if (!p) {
    p = probe(width, height);
    cache.set(key, p);
  }
  return p;
}

async function probe(width: number, height: number): Promise<Capabilities> {
  if (typeof VideoEncoder === 'undefined') return { mp4: { ok: false, codec: null, alpha: false, reason: NO_ENCODER }, webm: { ok: false, codec: null, alpha: false, reason: NO_ENCODER } };
  const big = width > 4096 || height > 4096;
  // MP4 uses H.264, the one that plays everywhere.
  const avc = await can('avc', width, height);
  const mp4: VideoSupport = avc
    ? { ok: true, codec: 'avc', alpha: false, reason: null }
    : { ok: false, codec: null, alpha: false, reason: big ? 'This size is too big for MP4 on this computer. Try a smaller size.' : "This computer can't make H.264 video. WebM or GIF will still work." };
  // WebM prefers VP9, then AV1 if that is all there is, then the older VP8.
  let webm: VideoSupport = { ok: false, codec: null, alpha: false, reason: big ? 'This size is too big for WebM on this computer. Try a smaller size.' : "This computer can't make WebM video. MP4 or GIF will still work." };
  for (const codec of ['vp9', 'av1', 'vp8'] as const) {
    if (await can(codec, width, height)) {
      webm = { ok: true, codec, alpha: await can(codec, width, height, true), reason: null };
      break;
    }
  }
  return { mp4, webm };
}
