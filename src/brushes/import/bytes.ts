// A reader that never goes past the end of its bytes. Every brush format is read through this, so a damaged or hostile
// file ends in a plain message and never in a crash, a huge allocation or a read of something that is not there.
import { BrushProblem } from './types';

export class Reader {
  readonly view: DataView;
  pos: number;
  constructor(
    readonly bytes: Uint8Array,
    pos = 0,
    /** Said when the file ends too soon, as "that ___ ends too soon". */
    readonly what = 'file',
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = pos;
  }
  get left(): number {
    return this.bytes.length - this.pos;
  }
  private need(n: number): void {
    if (!(n >= 0) || this.pos + n > this.bytes.length) throw new BrushProblem(`That ${this.what} ends too soon, so it is probably damaged or only partly downloaded.`);
  }
  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }
  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return v;
  }
  i16(): number {
    this.need(2);
    const v = this.view.getInt16(this.pos, false);
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, false);
    this.pos += 4;
    return v;
  }
  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, false);
    this.pos += 4;
    return v;
  }
  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos, false);
    this.pos += 8;
    return v;
  }
  /** The next `n` bytes, as a view onto the same memory (nothing is copied). */
  take(n: number): Uint8Array {
    this.need(n);
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }
  /** Four characters, for a tag like 'GIMP' or '8BIM'. */
  tag(): string {
    return String.fromCharCode(...this.take(4));
  }
}

/** Text from UTF-8 bytes up to the first zero, with control characters taken out. */
export function textOf(b: Uint8Array): string {
  let end = b.indexOf(0);
  if (end < 0) end = b.length;
  // eslint-disable-next-line no-control-regex
  return new TextDecoder('utf-8', { fatal: false }).decode(b.subarray(0, end)).replace(/[\u0000-\u001f\u007f]/g, '').trim();
}
