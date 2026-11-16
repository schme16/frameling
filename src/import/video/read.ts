// Reading a video's pictures. WebCodecs does the decoding (through mediabunny, which finds the pictures inside the MP4,
// WebM or MOV and hands them to the browser's VideoDecoder); when that can't read a file, a plain video element is asked to
// show each moment instead, which is slower but takes anything the window can play.
import { frameSize, type VideoFacts } from './plan';

export class VideoProblem extends Error {}

export interface VideoFrame2 {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  /** Seconds from the start. */
  time: number;
}

export interface OpenVideo {
  facts: VideoFacts;
  /** Which way it is being read: "decoder" (WebCodecs) or "player" (a video element). */
  way: 'decoder' | 'player';
  /** A picture at each of these moments, in order, each made at `width` x `height`. Stops early when `signal` is aborted. */
  frames(times: number[], width: number, height: number, signal?: AbortSignal): AsyncGenerator<VideoFrame2>;
  close(): void;
}

const canvasOf = (w: number, h: number): OffscreenCanvas | HTMLCanvasElement => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));

/** Opens a video. Tries the decoder first, then the player. Throws a VideoProblem in plain words when neither can read it. */
export async function openVideo(file: File): Promise<OpenVideo> {
  let first: unknown;
  if (typeof VideoDecoder !== 'undefined') {
    try {
      return await openWithDecoder(file);
    } catch (e) {
      first = e;
      if (e instanceof VideoProblem && /no picture/i.test(e.message)) throw e;
    }
  }
  try {
    return await openWithPlayer(file);
  } catch (e) {
    if (e instanceof VideoProblem) throw e;
    void first;
    throw new VideoProblem(`Frameling couldn't read "${file.name}". It may be damaged, or in a kind of video this computer can't play. Converting it to an MP4 first usually works.`);
  }
}

// ---------------------------------------------------------------- the decoder

async function openWithDecoder(file: File): Promise<OpenVideo> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new VideoProblem(`There is no picture in "${file.name}": it has sound only, or something Frameling doesn't know as a video.`);
    if (!(await track.canDecode())) throw new Error('cannot decode');
    const [width, height, duration, audio, codec, stats] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.computeDuration(),
      input.getPrimaryAudioTrack().catch(() => null),
      track.getCodec().catch(() => null),
      track.computePacketStats(60).catch(() => null),
    ]);
    const first = await track.getFirstTimestamp().catch(() => 0);
    const facts: VideoFacts = { name: file.name, duration: Math.max(0, duration - first), width, height, fps: stats?.averagePacketRate ?? 0, hasSound: !!audio, ...(codec ? { codec } : {}) };
    return {
      facts,
      way: 'decoder',
      async *frames(times, w, h, signal) {
        const sink = new mb.CanvasSink(track, { width: w, height: h, fit: 'fill' });
        const got = sink.canvasesAtTimestamps(times.map((t) => first + t));
        let i = 0;
        for await (const c of got) {
          if (signal?.aborted) break;
          // A moment with no picture (past the end) repeats the last one that did have.
          if (c) yield { canvas: c.canvas, time: times[i] };
          i++;
        }
      },
      close: () => void input.dispose(),
    };
  } catch (e) {
    input.dispose();
    throw e;
  }
}

// ---------------------------------------------------------------- the player

async function openWithPlayer(file: File): Promise<OpenVideo> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.playsInline = true;
  v.src = url;
  const done = () => URL.revokeObjectURL(url);
  try {
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new VideoProblem(`Frameling couldn't play "${file.name}". It may be damaged, or in a kind of video this computer can't play. Converting it to an MP4 first usually works.`));
    });
  } catch (e) {
    done();
    throw e;
  }
  if (!v.videoWidth || !v.videoHeight) {
    done();
    throw new VideoProblem(`There is no picture in "${file.name}": it has sound only, or something Frameling doesn't know as a video.`);
  }
  const anyV = v as HTMLVideoElement & { webkitAudioDecodedByteCount?: number; mozHasAudio?: boolean; audioTracks?: { length: number } };
  const hasSound = anyV.audioTracks ? anyV.audioTracks.length > 0 : anyV.mozHasAudio ?? (anyV.webkitAudioDecodedByteCount ?? 0) > 0;
  const facts: VideoFacts = { name: file.name, duration: Number.isFinite(v.duration) ? v.duration : 0, width: v.videoWidth, height: v.videoHeight, fps: 0, hasSound };
  return {
    facts,
    way: 'player',
    async *frames(times, w, h, signal) {
      const c = canvasOf(w, h);
      const g = c.getContext('2d') as CanvasRenderingContext2D;
      for (const t of times) {
        if (signal?.aborted) break;
        await new Promise<void>((res) => {
          const finish = () => {
            v.removeEventListener('seeked', finish);
            res();
          };
          v.addEventListener('seeked', finish);
          v.currentTime = Math.min(t, Math.max(0, v.duration - 0.001));
          // A seek to where it already is never says "seeked".
          setTimeout(finish, 4000);
        });
        g.drawImage(v, 0, 0, w, h);
        // A copy, so the next seek doesn't change what was handed on.
        const copy = canvasOf(w, h);
        (copy.getContext('2d') as CanvasRenderingContext2D).drawImage(c as CanvasImageSource, 0, 0);
        yield { canvas: copy, time: t };
      }
    },
    close: () => {
      v.removeAttribute('src');
      v.load();
      done();
    },
  };
}

/** A picture (as made by the reader) as JPEG bytes. */
export async function jpegOf(c: OffscreenCanvas | HTMLCanvasElement, quality = 0.88): Promise<Uint8Array> {
  const blob: Blob | null = 'convertToBlob' in c ? await c.convertToBlob({ type: 'image/jpeg', quality }) : await new Promise((r) => (c as HTMLCanvasElement).toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new VideoProblem("Frameling couldn't keep one of the pictures.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** A picture's pixels, for pixel frames. */
export function pixelsOf(c: OffscreenCanvas | HTMLCanvasElement): { width: number; height: number; pixels: Uint8ClampedArray } {
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const d = g.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, pixels: d.data };
}

export { frameSize };
