import { p256 } from '@noble/curves/nist.js';
import { describe, expect, it } from 'vitest';
import { ORDER, Spake2 } from '../../src/share/spake2';
import { RFC9382_VECTORS } from './rfc9382.vectors';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const unhex = (s: string) => new Uint8Array(Buffer.from(s, 'hex'));
const text = (s: string) => new TextEncoder().encode(s);
const big = (s: string) => BigInt('0x' + s);

describe('SPAKE2 against the RFC 9382 Appendix B vectors (P256-SHA256-HKDF-HMAC)', () => {
  RFC9382_VECTORS.forEach((v, i) => {
    it(`vector ${i + 1}: A='${v.A}', B='${v.B}' reproduces every listed value from both sides`, () => {
      const idA = text(v.A);
      const idB = text(v.B);
      const a = new Spake2({ role: 'A', w: big(v.w), idA, idB, x: big(v.x) });
      const b = new Spake2({ role: 'B', w: big(v.w), idA, idB, x: big(v.y) });
      expect(hex(a.message)).toBe(v.pA);
      expect(hex(b.message)).toBe(v.pB);

      const ra = a.finish(b.message)!;
      const rb = b.finish(a.message)!;
      for (const r of [ra, rb]) {
        expect(hex(r.parts.k)).toBe(v.K);
        expect(hex(r.parts.tt)).toBe(v.TT);
        expect(hex(r.key)).toBe(v.Ke);
        expect(hex(r.parts.ka)).toBe(v.Ka);
        expect(hex(r.parts.kcA)).toBe(v.KcA);
        expect(hex(r.parts.kcB)).toBe(v.KcB);
        expect(hex(r.parts.confirmA)).toBe(v.confA);
        expect(hex(r.parts.confirmB)).toBe(v.confB);
      }
      // Each side's own confirmation is the one the other side expects.
      expect(hex(ra.confirm)).toBe(v.confA);
      expect(hex(rb.confirm)).toBe(v.confB);
      expect(ra.verify(unhex(v.confB))).toBe(true);
      expect(rb.verify(unhex(v.confA))).toBe(true);
    });
  });

  it('checks the hash of the transcript too (the RFC lists it separately)', async () => {
    const { createHash } = await import('node:crypto');
    for (const v of RFC9382_VECTORS) expect(createHash('sha256').update(unhex(v.TT)).digest('hex')).toBe(v.hashTT);
  });
});

describe('SPAKE2 behaviour that the vectors do not cover', () => {
  const idA = text('frameling receiver');
  const idB = text('frameling sender');
  const run = (wa: bigint, wb: bigint, aadA = 'x', aadB = 'x') => {
    const a = new Spake2({ role: 'A', w: wa, idA, idB, aad: text(aadA) });
    const b = new Spake2({ role: 'B', w: wb, idA, idB, aad: text(aadB) });
    return { ra: a.finish(b.message)!, rb: b.finish(a.message)! };
  };

  it('agrees on a key and on both confirmations when the passwords match', () => {
    const { ra, rb } = run(12345n, 12345n);
    expect(hex(ra.key)).toBe(hex(rb.key));
    expect(ra.verify(rb.confirm)).toBe(true);
    expect(rb.verify(ra.confirm)).toBe(true);
  });

  it('gives two different keys and two refused confirmations when the passwords differ', () => {
    const { ra, rb } = run(12345n, 12346n);
    expect(hex(ra.key)).not.toBe(hex(rb.key));
    expect(ra.verify(rb.confirm)).toBe(false);
    expect(rb.verify(ra.confirm)).toBe(false);
  });

  it('refuses a confirmation when the extra data (what binds it to the channel) differs', () => {
    const { ra, rb } = run(777n, 777n, 'channel-one', 'channel-two');
    expect(ra.verify(rb.confirm)).toBe(false);
    expect(rb.verify(ra.confirm)).toBe(false);
  });

  it('makes a fresh message every run', () => {
    const o = { role: 'A' as const, w: 9n, idA, idB };
    expect(hex(new Spake2(o).message)).not.toBe(hex(new Spake2(o).message));
  });

  it('refuses messages that are not real points, or the wrong length, rather than throwing', () => {
    const a = () => new Spake2({ role: 'A', w: 5n, idA, idB });
    expect(a().finish(new Uint8Array(0))).toBeNull();
    expect(a().finish(new Uint8Array(65))).toBeNull();
    const notOnCurve = new Uint8Array(65);
    notOnCurve[0] = 4;
    notOnCurve[64] = 1;
    expect(a().finish(notOnCurve)).toBeNull();
    // A compressed point is a real point but not this ciphersuite's wire format.
    const good = new Spake2({ role: 'B', w: 5n, idA, idB }).message;
    expect(a().finish(good.subarray(0, 33))).toBeNull();
  });

  it('refuses the message that would force the shared point to zero (the peer sends exactly w*N)', () => {
    // pB = w*N makes pB - w*N the identity. That is a peer who knows w and wants a key they can predict.
    const w = 31337n;
    const N = p256.Point.fromHex('03d8bbd6c639c62937b04d997f38c3770719c629d7014d49a24b4f98baa1292b49');
    const evil = N.multiply(w).toBytes(false);
    expect(new Spake2({ role: 'A', w, idA, idB }).finish(evil)).toBeNull();
  });

  it('keeps w inside the group order', () => {
    expect(() => new Spake2({ role: 'A', w: 0n, idA, idB })).toThrow();
    expect(() => new Spake2({ role: 'A', w: ORDER, idA, idB })).toThrow();
  });

  it('can only finish once', () => {
    const a = new Spake2({ role: 'A', w: 5n, idA, idB });
    const b = new Spake2({ role: 'B', w: 5n, idA, idB });
    a.finish(b.message);
    expect(() => a.finish(b.message)).toThrow();
  });
});
