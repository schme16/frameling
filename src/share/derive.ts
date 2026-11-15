// What a code turns into: where to meet (public) and the password number for the handshake (secret). Node only.
import { createHash, scrypt } from 'node:crypto';
import type { ShareCode } from './code';
import { ORDER } from './spake2';

/** The two parties' names in the handshake (RFC 9382 section 3.3). Fixed, so each side knows which part it plays. */
export const ID_RECEIVER = new TextEncoder().encode('frameling share v1 receiver');
export const ID_SENDER = new TextEncoder().encode('frameling share v1 sender');

/** The meeting place on the DHT: a hash of the first words only. The secret words are not in it, in any form. */
export function topicFor(code: Pick<ShareCode, 'meet'>): Buffer {
  return createHash('sha256').update(`frameling share v1 meet\n${code.meet.join('-')}`).digest();
}

// A slow, memory-hungry hash (scrypt, RFC 7914) between the words and the handshake, as RFC 9382 section 3.2 asks. It is
// not what keeps the code safe (the handshake and the guess limit are), but it makes each guess cost real memory.
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

/** The password as a number in [1, ORDER), from the secret words (and the meeting words, as a salt). */
export function secretToW(code: ShareCode): Promise<bigint> {
  const salt = `frameling share v1 secret\n${code.meet.join('-')}`;
  return new Promise((resolve, reject) => {
    // 64 bytes reduced, so the lean from the reduction is far below anything that matters (RFC 9382 3.2).
    scrypt(code.secret.join('-'), salt, 64, SCRYPT, (err, key) => {
      if (err) return reject(err);
      let n = 0n;
      for (const b of key) n = (n << 8n) | BigInt(b);
      resolve((n % (ORDER - 1n)) + 1n);
    });
  });
}
