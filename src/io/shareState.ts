// What the Send with a code and Receive with a code windows show, as a plain state that each event moves along. No React
// here, so the story (and every word of it) can be tested. The events come from src/share.
import type { ReceiveEvent, SendEvent } from '../share/types';

export type SendState =
  | { kind: 'starting' }
  | { kind: 'waiting'; code: string; expiresAt: number; wrong: number }
  | { kind: 'sending'; code: string; expiresAt: number; done: number; total: number }
  | { kind: 'sent' }
  | { kind: 'burned' }
  | { kind: 'expired' }
  | { kind: 'offline' }
  | { kind: 'stopped' };

export const startSendState: SendState = { kind: 'starting' };

export function nextSend(s: SendState, e: SendEvent): SendState {
  switch (e.type) {
    case 'starting':
      return { kind: 'starting' };
    case 'ready':
      return { kind: 'waiting', code: e.code, expiresAt: e.expiresAt, wrong: 0 };
    case 'wrong':
      return s.kind === 'waiting' ? { ...s, wrong: e.tries } : s;
    case 'connected':
      return s.kind === 'waiting' ? { kind: 'sending', code: s.code, expiresAt: s.expiresAt, done: 0, total: 0 } : s;
    case 'progress':
      return s.kind === 'sending' ? { ...s, done: e.done, total: e.total } : s;
    case 'dropped':
      // The right person went away part-way: the code still works, so it shows again, and they can try once more.
      return s.kind === 'sending' ? { kind: 'waiting', code: s.code, expiresAt: s.expiresAt, wrong: 0 } : s;
    case 'sent':
      return { kind: 'sent' };
    case 'burned':
      return { kind: 'burned' };
    case 'expired':
      return { kind: 'expired' };
    case 'offline':
      return { kind: 'offline' };
    case 'stopped':
      return { kind: 'stopped' };
  }
}

export type ReceiveState =
  | { kind: 'typing' }
  | { kind: 'starting' }
  | { kind: 'looking' }
  | { kind: 'checking' }
  | { kind: 'receiving'; done: number; total: number }
  | { kind: 'received'; bytes: Uint8Array }
  | { kind: 'wrong'; left: number }
  | { kind: 'refused' }
  | { kind: 'noOne' }
  | { kind: 'offline' }
  | { kind: 'dropped' };

export const startReceiveState: ReceiveState = { kind: 'typing' };

export function nextReceive(s: ReceiveState, e: ReceiveEvent): ReceiveState {
  switch (e.type) {
    case 'starting':
      return { kind: 'starting' };
    case 'looking':
      return { kind: 'looking' };
    case 'checking':
      return { kind: 'checking' };
    case 'progress':
      return { kind: 'receiving', done: e.done, total: e.total };
    case 'received':
      return { kind: 'received', bytes: e.bytes };
    case 'wrong':
      return { kind: 'wrong', left: e.left };
    case 'refused':
      return { kind: 'refused' };
    case 'noOne':
      return { kind: 'noOne' };
    case 'offline':
      return { kind: 'offline' };
    case 'dropped':
      return { kind: 'dropped' };
    case 'stopped':
      return s;
  }
}

/** Whether a share is still going, so closing the window should ask the network to stop. */
export function sendIsLive(s: SendState): boolean {
  return s.kind === 'starting' || s.kind === 'waiting' || s.kind === 'sending';
}

/** Minutes and seconds left, as 9:41. Never below 0:00. */
export function timeLeft(expiresAt: number, now: number): string {
  const secs = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/** A whole-number percentage for a bar, 0 when the size is not known yet. */
export function percent(done: number, total: number): number {
  return total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;
}

/** What the page says when the words typed are not a code yet. Empty when they are, or when there is nothing to say yet. */
export function codeHint(why: 'empty' | 'short' | 'long' | 'unknown', word?: string): string {
  if (why === 'empty') return '';
  if (why === 'short') return 'A code is four words.';
  if (why === 'long') return 'That is more than four words. A code is four.';
  return `"${word}" isn't one of the code words. Check how it's spelt.`;
}
