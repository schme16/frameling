/**
 * What to say when a sound file can't be read. Browsers differ in the kinds of sound they know (older Safari
 * can't open OGG), so the words depend on what this one can play, and an OGG file gets a message of its own.
 */
import { where } from '../io/desktop';

/** Asks the browser whether it can play a kind of sound ("audio/ogg; codecs=vorbis"). True when it cannot tell (no audio element). */
export function browserCanPlay(type: string): boolean {
  if (typeof document === 'undefined') return true;
  try {
    return document.createElement('audio').canPlayType(type) !== '';
  } catch {
    return true;
  }
}

/** Does the file start the way an OGG file does? (Opus and Vorbis sound both come in OGG.) */
export const isOgg = (bytes: Uint8Array): boolean => bytes.length > 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;

/** "opus" or "vorbis": which sound an OGG file carries, from its first page. */
export function oggCodec(bytes: Uint8Array): 'opus' | 'vorbis' {
  const head = String.fromCharCode(...bytes.subarray(0, 128));
  return head.includes('OpusHead') ? 'opus' : 'vorbis';
}

/** The kinds of file that open here, in words ("WAV, MP3, M4A, OGG and FLAC"). */
export function playableKinds(can: (type: string) => boolean = browserCanPlay): string {
  const kinds = ['WAV', 'MP3', 'M4A'];
  if (can('audio/ogg; codecs=vorbis') || can('audio/ogg; codecs=opus')) kinds.push('OGG');
  if (can('audio/flac')) kinds.push('FLAC');
  return `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`;
}

/** The plain-words reason a sound file could not be added. */
export function soundProblem(bytes: Uint8Array, can: (type: string) => boolean = browserCanPlay): string {
  if (isOgg(bytes) && !can(`audio/ogg; codecs=${oggCodec(bytes)}`)) {
    return `${where()} can't open OGG sound files (Safari can't, in older versions). Save the sound as an MP3, M4A or WAV file and try again, or use Chrome, Edge or Firefox.`;
  }
  return `That file couldn't be read as a sound. It may be damaged. ${playableKinds(can)} files work here.`;
}
