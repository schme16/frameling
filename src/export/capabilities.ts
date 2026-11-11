// What this computer can encode as video, asked up front so the dialog can grey things out and say why.
import { canEncodeVideo, type VideoCodec } from 'mediabunny';
import { currentChoice } from '../core/choices';
import './choices';

export interface VideoSupport {
  ok: boolean;
  codec: VideoCodec | null;
  /** Can this format keep a see-through background here (with `alphaCodec` if the usual codec cannot)? */
  alpha: boolean;
  /** The codec to switch to when a see-through background is wanted and `codec` cannot keep one. */
  alphaCodec?: VideoCodec | null;
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

let workers: Promise<boolean> | null = null;
/**
 * A see-through video is made by splitting colour and alpha in a worker the encoder library starts from a blob. If the
 * page's security policy forbids that, the export would fail halfway, so say "no" up front instead.
 */
export function blobWorkersWork(): Promise<boolean> {
  if (typeof Worker === 'undefined' || typeof URL.createObjectURL !== 'function') return Promise.resolve(true);
  workers ??= new Promise<boolean>((resolve) => {
    let url = '';
    try {
      url = URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }));
      const w = new Worker(url);
      const done = (ok: boolean) => {
        w.terminate();
        URL.revokeObjectURL(url);
        resolve(ok);
      };
      w.onmessage = () => done(true);
      w.onerror = () => done(false);
      setTimeout(() => done(false), 2000);
    } catch {
      if (url) URL.revokeObjectURL(url);
      resolve(false);
    }
  });
  return workers;
}

/** The order WebM codecs are tried in: the preferred one first, then whatever else this computer has. */
export function webmOrder(pref: string): VideoCodec[] {
  return pref === 'vp9' ? ['vp9', 'av1', 'vp8'] : ['av1', 'vp9', 'vp8'];
}

export function detectCapabilities(width: number, height: number): Promise<Capabilities> {
  const pref = currentChoice<string>('export.webmCodec');
  const key = `${width}x${height}:${pref}`;
  let p = cache.get(key);
  if (!p) {
    p = probe(width, height, pref);
    cache.set(key, p);
  }
  return p;
}

async function probe(width: number, height: number, pref: string): Promise<Capabilities> {
  if (typeof VideoEncoder === 'undefined') return { mp4: { ok: false, codec: null, alpha: false, reason: NO_ENCODER }, webm: { ok: false, codec: null, alpha: false, reason: NO_ENCODER } };
  const big = width > 4096 || height > 4096;
  // MP4 uses H.264, the one that plays everywhere.
  const avc = await can('avc', width, height);
  const mp4: VideoSupport = avc
    ? { ok: true, codec: 'avc', alpha: false, reason: null }
    : { ok: false, codec: null, alpha: false, reason: big ? 'This size is too big for MP4 on this computer. Try a smaller size.' : "This computer can't make H.264 video. WebM or GIF will still work." };
  // WebM: the codec they prefer (AV1 unless they changed it), then the others in turn.
  let webm: VideoSupport = { ok: false, codec: null, alpha: false, reason: big ? 'This size is too big for WebM on this computer. Try a smaller size.' : "This computer can't make WebM video. MP4 or GIF will still work." };
  const order = webmOrder(pref);
  // A see-through WebM is only widely understood with VP9 (or VP8). AV1 can be written with an alpha channel, but
  // browsers and ffmpeg ignore it, so AV1 is never used for transparency however the choice is set.
  const alphaOk = async (codec: VideoCodec) => (codec === 'vp9' || codec === 'vp8') && (await can(codec, width, height)) && (await can(codec, width, height, true)) && (await blobWorkersWork());
  for (const codec of order) {
    if (await can(codec, width, height)) {
      webm = { ok: true, codec, alpha: false, alphaCodec: null, reason: null };
      for (const c of [codec, ...order]) {
        if (await alphaOk(c)) {
          webm.alpha = true;
          webm.alphaCodec = c;
          break;
        }
      }
      break;
    }
  }
  return { mp4, webm };
}
