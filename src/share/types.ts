// What a share tells the page while it runs. Both sides are a short story told in events; the page turns each into words.
// Nothing here names who the other person is: the app never learns that, and never keeps what it did learn.

export type SendEvent =
  | { type: 'starting' }
  /** The code is announced and the other person can use it. */
  | { type: 'ready'; code: string; expiresAt: number }
  /** Could not reach the peer network at all. */
  | { type: 'offline' }
  /** Somebody with the right code has connected, and the drawing is on its way. */
  | { type: 'connected' }
  | { type: 'progress'; done: number; total: number }
  | { type: 'sent' }
  /** Somebody tried the wrong code. `left` tries remain before the code stops working. */
  | { type: 'wrong'; tries: number; left: number }
  /** Too many wrong tries: the code is retired. */
  | { type: 'burned' }
  /** The person with the right code went away before the drawing arrived. The code still works. */
  | { type: 'dropped' }
  | { type: 'expired' }
  | { type: 'stopped' };

export type ReceiveEvent =
  | { type: 'starting' }
  | { type: 'looking' }
  /** A connection opened, and the code is being checked. */
  | { type: 'checking' }
  | { type: 'progress'; done: number; total: number }
  | { type: 'received'; bytes: Uint8Array }
  /** Somebody answered, but the code did not match. */
  | { type: 'wrong'; tries: number; left: number }
  /** Too many wrong tries in a row: stop asking. */
  | { type: 'refused' }
  /** Nobody answered in time. */
  | { type: 'noOne' }
  | { type: 'offline' }
  | { type: 'dropped' }
  | { type: 'stopped' };

export type ShareEvent = ({ side: 'send' } & SendEvent) | ({ side: 'receive' } & ReceiveEvent);
