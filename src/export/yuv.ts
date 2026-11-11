// RGBA to limited range BT.709 I420 (what "yuv420p, tv range, bt709" means in ffprobe). MP4 export converts each
// frame here instead of letting the browser do it, because the browser writes full range (yuvj420p, tagged sRGB),
// which some players and editors show washed out or too dark.

/** The colour space to tag frames with. */
export const BT709_LIMITED = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709', fullRange: false } as const;

const KR = 0.2126;
const KB = 0.0722;
const KG = 1 - KR - KB;
const S = 1 << 16;
// Fixed point, 16 fractional bits. Luma spans 16..235 and chroma 16..240 (centred on 128).
const yScale = 219 / 255;
const cbScale = 224 / 255 / (2 * (1 - KB));
const crScale = 224 / 255 / (2 * (1 - KR));
const YR = Math.round(yScale * KR * S);
const YG = Math.round(yScale * KG * S);
const YB = Math.round(yScale * KB * S);
const UR = Math.round(cbScale * -KR * S);
const UG = Math.round(cbScale * -KG * S);
const UB = Math.round(cbScale * (1 - KB) * S);
const VR = Math.round(crScale * (1 - KR) * S);
const VG = Math.round(crScale * -KG * S);
const VB = Math.round(crScale * -KB * S);
const Y0 = 16 * S + S / 2;
const C0 = 128 * S + S / 2;

/** Bytes an I420 frame of this size needs: a full size luma plane and two quarter size chroma planes. */
export function i420Size(width: number, height: number): number {
  const cw = Math.ceil(width / 2);
  const ch = Math.ceil(height / 2);
  return width * height + 2 * cw * ch;
}

/**
 * Converts straight RGBA (alpha ignored, the frame is already on its background) to I420. Chroma is the average of
 * each 2 x 2 block. Writes into `out` when given (reused between frames), else a new array.
 *
 * One pass over pairs of rows, reading whole pixels as 32 bit words (little endian, so red is the low byte). About
 * 4 ms a frame at 1920 x 1080 and 7 ms at 2560 x 1440 (two plain passes took 6 and 11).
 */
export function rgbaToI420(rgba: Uint8ClampedArray, width: number, height: number, out?: Uint8Array): Uint8Array {
  const cw = Math.ceil(width / 2);
  const ch = Math.ceil(height / 2);
  const dst = out && out.length >= i420Size(width, height) ? out : new Uint8Array(i420Size(width, height));
  const n = width * height;
  // A view can only start on a 4 byte boundary; anything else gets copied first.
  const p = rgba.byteOffset % 4 === 0 ? new Int32Array(rgba.buffer, rgba.byteOffset, n) : new Int32Array(rgba.slice(0, n * 4).buffer);
  const uOff = n;
  const vOff = uOff + cw * ch;
  for (let cy = 0; cy < ch; cy++) {
    const r0 = cy * 2 * width;
    const lastRow = cy * 2 + 1 >= height;
    const r1 = lastRow ? r0 : r0 + width;
    let k = cy * cw;
    for (let x = 0; x < width; x += 2, k++) {
      const lastCol = x + 1 >= width;
      const x1 = lastCol ? x : x + 1;
      const a = p[r0 + x];
      const b = p[r0 + x1];
      const c = p[r1 + x];
      const d = p[r1 + x1];
      const ar = a & 255, ag = (a >> 8) & 255, ab = (a >> 16) & 255;
      const br = b & 255, bg = (b >> 8) & 255, bb = (b >> 16) & 255;
      const cr = c & 255, cg = (c >> 8) & 255, cb = (c >> 16) & 255;
      const dr = d & 255, dg = (d >> 8) & 255, db = (d >> 16) & 255;
      dst[r0 + x] = (YR * ar + YG * ag + YB * ab + Y0) >> 16;
      if (!lastCol) dst[r0 + x1] = (YR * br + YG * bg + YB * bb + Y0) >> 16;
      if (!lastRow) {
        dst[r1 + x] = (YR * cr + YG * cg + YB * cb + Y0) >> 16;
        if (!lastCol) dst[r1 + x1] = (YR * dr + YG * dg + YB * db + Y0) >> 16;
      }
      // Sums of four, so the >> 18 below divides by 4 as well.
      const r = ar + br + cr + dr;
      const g = ag + bg + cg + dg;
      const bl = ab + bb + cb + db;
      dst[uOff + k] = (UR * r + UG * g + UB * bl + 4 * C0) >> 18;
      dst[vOff + k] = (VR * r + VG * g + VB * bl + 4 * C0) >> 18;
    }
  }
  return dst;
}
