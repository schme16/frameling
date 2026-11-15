// SPAKE2, RFC 9382, the SPAKE2-P256-SHA256-HKDF-HMAC ciphersuite, with key confirmation. Not a protocol of ours: this
// is the RFC written out, and test/share/spake2.test.ts runs the RFC's own Appendix B vectors through it.
//
// What it is for: two people who share a short secret each run this over a connection nobody has authenticated. A
// third party who does not know the secret gets ONE guess per run (they must send a confirmation to find out) and
// learns nothing they can test offline. Whoever counts the failed confirmations decides how many runs a code survives.
//
// The elliptic-curve arithmetic is @noble/curves (audited, widely used). The hash, HMAC and HKDF are Node's own.
//
// Roles: A goes first and uses M, B answers and uses N (RFC 9382 section 3.1). The share protocol fixes them: the person
// receiving is A, the person sending is B.
import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';

type Point = InstanceType<typeof p256.Point>;
const P = p256.Point;
/** The order of the prime-order group (p in the RFC). */
export const ORDER: bigint = P.Fn.ORDER;

// M and N for P-256, from RFC 9382 section 6 (compressed SEC1).
const M = P.fromHex('02886e2f97ace46e55ba9dd7242579f2993b64e16ef3dcab95afd497333d8fa12f');
const N = P.fromHex('03d8bbd6c639c62937b04d997f38c3770719c629d7014d49a24b4f98baa1292b49');

export type Spake2Role = 'A' | 'B';

export interface Spake2Options {
  role: Spake2Role;
  /** The password turned into a number in [1, ORDER): see src/share/derive.ts. */
  w: bigint;
  /** The two identities (RFC 3.3). Empty means "implicit". */
  idA: Uint8Array;
  idB: Uint8Array;
  /** Extra data both sides must agree on, mixed into the confirmation keys (RFC section 4). */
  aad?: Uint8Array;
  /** Tests only: the secret scalar, so the RFC's fixed vectors can be reproduced. */
  x?: bigint;
}

/** What a finished run leaves, with the parts the RFC's test vectors list. */
export interface Spake2Result {
  /** The shared key (Ke). 16 bytes. */
  key: Uint8Array;
  /** What to send so the other side can check we agree (cA for role A, cB for role B). */
  confirm: Uint8Array;
  /** Checks what the other side sent. Constant time. */
  verify(theirs: Uint8Array): boolean;
  /** The intermediate values, for the vector test. Nothing outside tests should read these. */
  parts: { k: Uint8Array; tt: Uint8Array; ka: Uint8Array; kcA: Uint8Array; kcB: Uint8Array; confirmA: Uint8Array; confirmB: Uint8Array };
}

const utf8 = (s: string) => new TextEncoder().encode(s);

function le64(n: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}

function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const lenPrefixed = (b: Uint8Array) => cat(le64(b.length), b);

function scalarBytes(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = n;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** A uniformly random scalar in [1, ORDER): 48 bytes reduced, so the lean is below 2^-128. */
function randomScalar(): bigint {
  let n = 0n;
  for (const b of randomBytes(48)) n = (n << 8n) | BigInt(b);
  return (n % (ORDER - 1n)) + 1n;
}

/** The key schedule of RFC 9382 section 4, from the transcript. Exported for the vector test. */
export function schedule(tt: Uint8Array, aad: Uint8Array) {
  const hash = createHash('sha256').update(tt).digest();
  const ke = hash.subarray(0, 16);
  const ka = hash.subarray(16, 32);
  // KcA || KcB = KDF(Ka, nil, "ConfirmationKeys" || AAD, 32). HKDF with no salt uses a block of zeros, which is "nil".
  const kc = Buffer.from(hkdfSync('sha256', ka, new Uint8Array(0), cat(utf8('ConfirmationKeys'), aad), 32));
  const kcA = kc.subarray(0, 16);
  const kcB = kc.subarray(16, 32);
  const confirmA = createHmac('sha256', kcA).update(tt).digest();
  const confirmB = createHmac('sha256', kcB).update(tt).digest();
  return { ke, ka, kcA, kcB, confirmA, confirmB };
}

export class Spake2 {
  /** The message to send the other side: 65 bytes, an uncompressed point. */
  readonly message: Uint8Array;
  private readonly x: bigint;
  private done = false;

  constructor(private readonly o: Spake2Options) {
    if (o.w <= 0n || o.w >= ORDER) throw new Error('spake2: w out of range');
    this.x = o.x ?? randomScalar();
    if (this.x <= 0n || this.x >= ORDER) throw new Error('spake2: x out of range');
    const mine = o.role === 'A' ? M : N;
    // pA = w*M + x*P, pB = w*N + y*P
    this.message = mine.multiply(o.w).add(P.BASE.multiply(this.x)).toBytes(false);
  }

  /**
   * Takes the other side's message and finishes. Returns null for anything that is not a valid message from a real
   * run: a point that is not on the curve, the wrong length, or one that would force the shared point to be zero.
   * It can only be called once.
   */
  finish(theirs: Uint8Array): Spake2Result | null {
    if (this.done) throw new Error('spake2: finish called twice');
    this.done = true;
    const { role, w, idA, idB } = this.o;
    // Only the uncompressed form is part of this ciphersuite's wire format.
    if (theirs.length !== 65 || theirs[0] !== 4) return null;
    let peer: Point;
    try {
      peer = P.fromBytes(theirs);
      peer.assertValidity();
    } catch {
      return null;
    }
    // K = h*x*(pPeer - w*PeerM), with h = 1 on P-256.
    const theirM = role === 'A' ? N : M;
    const base = peer.subtract(theirM.multiply(w));
    if (base.is0()) return null;
    const kPoint = base.multiply(this.x);
    if (kPoint.is0()) return null;
    const k = kPoint.toBytes(false);

    const pA = role === 'A' ? this.message : theirs;
    const pB = role === 'A' ? theirs : this.message;
    const tt = cat(lenPrefixed(idA), lenPrefixed(idB), lenPrefixed(pA), lenPrefixed(pB), lenPrefixed(k), lenPrefixed(scalarBytes(w)));
    const s = schedule(tt, this.o.aad ?? new Uint8Array(0));
    const mine = role === 'A' ? s.confirmA : s.confirmB;
    const expected = role === 'A' ? s.confirmB : s.confirmA;
    return {
      key: s.ke,
      confirm: mine,
      verify: (got) => got.length === expected.length && timingSafeEqual(Buffer.from(got), expected),
      parts: { k, tt, ka: s.ka, kcA: s.kcA, kcB: s.kcB, confirmA: s.confirmA, confirmB: s.confirmB },
    };
  }
}
