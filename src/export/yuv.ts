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
 */
export function rgbaToI420(rgba: Uint8ClampedArray, width: number, height: number, out?: Uint8Array): Uint8Array {
  const cw = Math.ceil(width / 2);
  const ch = Math.ceil(height / 2);
  const dst = out && out.length >= i420Size(width, height) ? out : new Uint8Array(i420Size(width, height));
  const uOff = width * height;
  const vOff = uOff + cw * ch;
  for (let y = 0; y < height; y++) {
    let i = y * width * 4;
    let o = y * width;
    for (let x = 0; x < width; x++, i += 4) dst[o++] = (YR * rgba[i] + YG * rgba[i + 1] + YB * rgba[i + 2] + Y0) >> 16;
  }
  for (let cy = 0; cy < ch; cy++) {
    const y0 = cy * 2;
    const y1 = Math.min(y0 + 1, height - 1);
    for (let cx = 0; cx < cw; cx++) {
      const x0 = cx * 2;
      const x1 = Math.min(x0 + 1, width - 1);
      const a = (y0 * width + x0) * 4;
      const b = (y0 * width + x1) * 4;
      const c = (y1 * width + x0) * 4;
      const d = (y1 * width + x1) * 4;
      // Sums of four, so the >> 18 below divides by 4 as well.
      const r = rgba[a] + rgba[b] + rgba[c] + rgba[d];
      const g = rgba[a + 1] + rgba[b + 1] + rgba[c + 1] + rgba[d + 1];
      const bl = rgba[a + 2] + rgba[b + 2] + rgba[c + 2] + rgba[d + 2];
      const k = cy * cw + cx;
      dst[uOff + k] = (UR * r + UG * g + UB * bl + 4 * C0) >> 18;
      dst[vOff + k] = (VR * r + VG * g + VB * bl + 4 * C0) >> 18;
    }
  }
  return dst;
}
