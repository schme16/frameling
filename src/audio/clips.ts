/** Plain maths for sound clips on the timeline: where they start and end in frames, and where the playhead is inside them. */
import type { AudioClip } from '../core/format';

/** How many frames a clip covers (at least 1). Unknown length counts as one frame until it is decoded. */
export function clipFrames(clip: Pick<AudioClip, 'duration'>, fps: number): number {
  return Math.max(1, Math.ceil((clip.duration ?? 0) * fps - 1e-9));
}

/** The frame after the clip's last one. */
export function clipEnd(clip: Pick<AudioClip, 'start' | 'duration'>, fps: number): number {
  return clip.start + clipFrames(clip, fps);
}

/** Seconds into the clip that a frame sits at (negative when the clip has not started yet). */
export function clipOffset(clip: Pick<AudioClip, 'start'>, frame: number, fps: number): number {
  return (frame - clip.start) / fps;
}

/** 0 to 1 loudness for a clip (missing = full). */
export function clipGain(clip: Pick<AudioClip, 'volume' | 'muted'>): number {
  if (clip.muted) return 0;
  const v = clip.volume ?? 1;
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));
}

/** The unmuted clips with something to hear. */
export function audibleClips(clips: readonly AudioClip[] | undefined): AudioClip[] {
  return (clips ?? []).filter((c) => clipGain(c) > 0);
}

const EXT_MIME: Record<string, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', webm: 'audio/webm', weba: 'audio/webm' };

/** The media type for a picked file: what the browser said, or a guess from the name. */
export function mimeFor(name: string, type: string): string {
  if (type.startsWith('audio/')) return type;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'audio/wav';
}

/** "interview.final.mp3" -> "interview.final". */
export function soundName(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '') || 'Sound';
}

export const SOUND_ACCEPT = '.wav,.mp3,.ogg,.oga,.m4a,.aac,.flac,.opus,.webm,audio/*';
