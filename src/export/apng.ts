// Animated PNG, built straight from the PNG pieces in io/png.ts: every frame is a full RGBA picture, so soft edges
// and see-through backgrounds survive (a GIF cannot do that).
import { ihdr, joinBytes, makeChunk, PNG_SIGNATURE, pngImageData, put32, type RawImage } from '../io/png';

export interface ApngOptions {
  width: number;
  height: number;
  fps: number;
  /** Repeat for ever (true) or play once. */
  loop: boolean;
}

/** Delays as thousandths of a second, rounded cumulatively so the total stays true at fps like 24 or 12. */
export function apngDelays(count: number, fps: number): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < count; i++) {
    const t = Math.round(((i + 1) * 1000) / fps);
    out.push(Math.max(1, t - prev));
    prev = Math.max(prev + 1, t);
  }
  return out;
}

export class ApngWriter {
  private frames: Uint8Array[] = [];
  private delays: number[];

  constructor(
    private opts: ApngOptions,
    frameCount: number,
  ) {
    this.delays = apngDelays(frameCount, opts.fps);
  }

  addFrame(img: RawImage): void {
    if (img.width !== this.opts.width || img.height !== this.opts.height) throw new Error('Every frame must be the same size');
    this.frames.push(pngImageData(img, 'adaptive', 6));
  }

  finish(): Uint8Array {
    const { width, height, loop } = this.opts;
    const n = this.frames.length;
    const parts: Uint8Array[] = [PNG_SIGNATURE, makeChunk('IHDR', ihdr(width, height))];
    const actl = new Uint8Array(8);
    put32(actl, 0, n);
    put32(actl, 4, loop ? 0 : 1);
    parts.push(makeChunk('acTL', actl));
    let seq = 0;
    this.frames.forEach((data, i) => {
      const fctl = new Uint8Array(26);
      put32(fctl, 0, seq++);
      put32(fctl, 4, width);
      put32(fctl, 8, height);
      // x and y offset stay 0 (bytes 12 to 19). Delay is delay_num / delay_den seconds.
      const delay = this.delays[Math.min(i, this.delays.length - 1)];
      fctl[20] = (delay >> 8) & 255;
      fctl[21] = delay & 255;
      fctl[22] = 0x03;
      fctl[23] = 0xe8; // 1000
      fctl[24] = 0; // dispose: leave it
      fctl[25] = 0; // blend: replace what is there, so see-through pixels stay see-through
      parts.push(makeChunk('fcTL', fctl));
      if (i === 0) {
        parts.push(makeChunk('IDAT', data));
      } else {
        const fdat = new Uint8Array(4 + data.length);
        put32(fdat, 0, seq++);
        fdat.set(data, 4);
        parts.push(makeChunk('fdAT', fdat));
      }
    });
    parts.push(makeChunk('IEND', new Uint8Array(0)));
    return joinBytes(parts);
  }
}

export function encodeApng(frames: RawImage[], opts: ApngOptions): Uint8Array {
  const w = new ApngWriter(opts, frames.length);
  for (const f of frames) w.addFrame(f);
  return w.finish();
}
