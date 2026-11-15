// Compression for the wire, with the compressor handed in (the main process has node's zlib, a test has its own), so the
// rest stays free of Node. A message is one flag byte (0 = as it is, 1 = compressed) and the bytes. Small messages are not
// compressed: a pointer is twelve bytes and compressing it would only make it bigger and slower.
export type Squeeze = (bytes: Uint8Array) => Promise<Uint8Array>;

/** Below this many bytes a message goes as it is. */
export const COMPRESS_FROM = 256;

export async function wrapMessage(raw: Uint8Array, deflate: Squeeze): Promise<Uint8Array> {
  const packed = raw.byteLength >= COMPRESS_FROM ? await deflate(raw) : null;
  const use = packed && packed.byteLength < raw.byteLength ? packed : raw;
  const out = new Uint8Array(1 + use.byteLength);
  out[0] = use === raw ? 0 : 1;
  out.set(use, 1);
  return out;
}

/** Takes the flag off and inflates when it says so. Throws on anything that is not a message. */
export async function unwrapMessage(bytes: Uint8Array, inflate: Squeeze): Promise<Uint8Array> {
  if (bytes.byteLength < 2) throw new Error('empty message');
  const body = bytes.subarray(1);
  if (bytes[0] === 0) return body;
  if (bytes[0] === 1) return inflate(body);
  throw new Error('unknown message flag');
}
