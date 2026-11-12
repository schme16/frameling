/**
 * Putting the sound into an MP4 or WebM: mix every unmuted sound for the exported frames, pick an audio codec this
 * computer can encode (AAC, then Opus, then plain uncompressed sound for MP4; Opus for WebM) and feed the mix to the
 * muxer a frame's worth at a time, so the sound and the picture stay in step while the file is written.
 */
import { AudioBufferSource, canEncodeAudio, getFirstEncodableAudioCodec, Mp4OutputFormat, QUALITY_HIGH, WebMOutputFormat, type AudioCodec, type Output } from 'mediabunny';
import type { Doc } from '../core/format';
import { where } from '../io/desktop';
import { audibleClips } from './clips';
import { renderMix } from './mix';

/** Said when the sound goes in uncompressed, because nothing here can compress it (older Safari has no audio encoder). */
export const uncompressedSoundNote = (): string => `${where()} can't compress sound, so this video is a MOV file that carries the sound as it is. QuickTime, Safari and iPhones play it, and the file is bigger.`;

/** Said when there is sound but there is no way to put it in the file. A WebM has no plain-sound way, so it points at MP4. */
export const noSoundNote = (mp4: boolean): string =>
  mp4 ? `${where()} can't make the sound for video files, so the video has no sound.` : `${where()} can't make the sound for WebM videos, so the video has no sound. An MP4 keeps its sound.`;

/** Whether this computer can put AAC sound in an MP4 by itself (Electron usually can't, so MP4 sound is Opus). */
export async function canMakeAac(): Promise<boolean> {
  return canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000 }).catch(() => false);
}

/** Whether this computer can put Opus sound in a file (Chrome and Firefox can, older Safari cannot). */
export async function canMakeOpus(): Promise<boolean> {
  return canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000 }).catch(() => false);
}

export interface SoundTrack {
  /** Adds the sound for frame `i` (call once per frame, in order, after the picture). */
  feed(i: number): Promise<void>;
  /** Says no more is coming. */
  finish(): void;
}

/**
 * The codecs to try, best first. An MP4 ends with plain 16-bit sound, which needs no encoder at all, so a browser
 * without an audio encoder (older Safari) still keeps the sound; it is then written as a MOV (see `needsMov`). A WebM
 * has no such way (browsers do not play plain sound in WebM).
 */
export function audioCodecOrder(mp4: boolean): AudioCodec[] {
  return mp4 ? ['aac', 'opus', 'pcm-s16'] : ['opus', 'vorbis'];
}

/** The sample range of frame `i` in a mix `total` samples long, at `fps`: the last frame takes whatever is left. */
export function frameSlice(i: number, count: number, fps: number, rate: number, total: number): [number, number] {
  const a = Math.min(total, Math.floor((i / fps) * rate));
  const b = i >= count - 1 ? total : Math.min(total, Math.floor(((i + 1) / fps) * rate));
  return [a, b];
}

/** The sound for a video, chosen before the file is made: the mix, and the codec it will be written with. */
export interface SoundPlan {
  mix: AudioBuffer;
  codec: AudioCodec;
}

/** Sound carried as it is goes in a MOV file: QuickTime, Safari and iPhones read that for sure (an MP4 label for it is less certain). */
export const needsMov = (codec: AudioCodec | undefined): boolean => codec === 'pcm-s16';

/**
 * Mixes the sound for the exported frames and picks a codec this computer can write, when the document has sound to
 * hear. `plan` is null when there is nothing to add; `note` says why when there was sound but it cannot go in.
 */
export async function planSound(doc: Doc, mp4: boolean, start: number, count: number): Promise<{ plan: SoundPlan | null; note?: string }> {
  if (!audibleClips(doc.audio).length) return { plan: null };
  const mix = await renderMix(doc, start, count);
  if (!mix) return { plan: null, note: noSoundNote(mp4) };
  const format = mp4 ? new Mp4OutputFormat() : new WebMOutputFormat();
  const allowed = new Set(format.getSupportedAudioCodecs());
  const codec = await getFirstEncodableAudioCodec(
    audioCodecOrder(mp4).filter((c) => allowed.has(c)),
    { numberOfChannels: mix.numberOfChannels, sampleRate: mix.sampleRate },
  ).catch(() => null);
  if (!codec) return { plan: null, note: noSoundNote(mp4) };
  return { plan: { mix, codec }, ...(needsMov(codec) ? { note: uncompressedSoundNote() } : {}) };
}

/** Adds the planned sound to `output` (before it starts) and returns the track to feed. */
export function addSoundTrack({ mix, codec }: SoundPlan, doc: Doc, count: number, output: Output): SoundTrack {
  const source = new AudioBufferSource({ codec, quality: QUALITY_HIGH });
  output.addAudioTrack(source);
  const channels = Array.from({ length: mix.numberOfChannels }, (_, c) => mix.getChannelData(c));
  return {
    async feed(i) {
      const [a, b] = frameSlice(i, count, doc.fps, mix.sampleRate, mix.length);
      if (b <= a) return;
      const piece = new AudioBuffer({ length: b - a, sampleRate: mix.sampleRate, numberOfChannels: mix.numberOfChannels });
      channels.forEach((d, c) => piece.copyToChannel(d.subarray(a, b), c));
      await source.add(piece);
    },
    finish: () => source.close(),
  };
}
