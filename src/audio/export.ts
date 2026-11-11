/**
 * Putting the sound into an MP4 or WebM: mix every unmuted sound for the exported frames, pick an audio codec this
 * computer can encode (AAC then Opus for MP4, Opus for WebM) and feed the mix to the muxer a frame's worth at a time,
 * so the sound and the picture stay in step while the file is written.
 */
import { AudioBufferSource, getFirstEncodableAudioCodec, Mp4OutputFormat, QUALITY_HIGH, WebMOutputFormat, type AudioCodec, type Output } from 'mediabunny';
import type { Doc } from '../core/format';
import { audibleClips } from './clips';
import { renderMix } from './mix';

/** Said when there is sound but this computer has no way to put it in the file. */
export const NO_SOUND_NOTE = "This computer can't make the sound for video files, so the video has no sound.";

export interface SoundTrack {
  /** Adds the sound for frame `i` (call once per frame, in order, after the picture). */
  feed(i: number): Promise<void>;
  /** Says no more is coming. */
  finish(): void;
}

/** The codecs to try, best first. */
export function audioCodecOrder(mp4: boolean): AudioCodec[] {
  return mp4 ? ['aac', 'opus'] : ['opus', 'vorbis'];
}

/** The sample range of frame `i` in a mix `total` samples long, at `fps`: the last frame takes whatever is left. */
export function frameSlice(i: number, count: number, fps: number, rate: number, total: number): [number, number] {
  const a = Math.min(total, Math.floor((i / fps) * rate));
  const b = i >= count - 1 ? total : Math.min(total, Math.floor(((i + 1) / fps) * rate));
  return [a, b];
}

/**
 * Adds an audio track to `output` (before it starts) when the document has sound to hear. Returns the track, and a
 * note for the person when there was sound but it could not be added.
 */
export async function prepareSound(doc: Doc, mp4: boolean, start: number, count: number, output: Output): Promise<{ track: SoundTrack | null; note?: string }> {
  if (!audibleClips(doc.audio).length) return { track: null };
  const mix = await renderMix(doc, start, count);
  if (!mix) return { track: null, note: NO_SOUND_NOTE };
  const format = mp4 ? new Mp4OutputFormat() : new WebMOutputFormat();
  const allowed = new Set(format.getSupportedAudioCodecs());
  const codec = await getFirstEncodableAudioCodec(
    audioCodecOrder(mp4).filter((c) => allowed.has(c)),
    { numberOfChannels: mix.numberOfChannels, sampleRate: mix.sampleRate },
  ).catch(() => null);
  if (!codec) return { track: null, note: NO_SOUND_NOTE };
  const source = new AudioBufferSource({ codec, quality: QUALITY_HIGH });
  output.addAudioTrack(source);
  const channels = Array.from({ length: mix.numberOfChannels }, (_, c) => mix.getChannelData(c));
  return {
    track: {
      async feed(i) {
        const [a, b] = frameSlice(i, count, doc.fps, mix.sampleRate, mix.length);
        if (b <= a) return;
        const piece = new AudioBuffer({ length: b - a, sampleRate: mix.sampleRate, numberOfChannels: mix.numberOfChannels });
        channels.forEach((d, c) => piece.copyToChannel(d.subarray(a, b), c));
        await source.add(piece);
      },
      finish: () => source.close(),
    },
  };
}
