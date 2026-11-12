// What MP4 and WebM check before they start: that this computer can make them, which codec to use, and (for an MP4
// with sound) what to do when the sound would not play everywhere. Loaded on first use.
import { audibleClips } from '../../audio/clips';
import { canMakeAac } from '../../audio/export';
import { choose, getChoiceDef } from '../../core/choices';
import type { Doc } from '../../core/format';
import { desktop } from '../../io/desktop';
import { detectCapabilities } from '../capabilities';
import type { Plan } from '../plan';
import { ExportProblem } from '../problem';
import type { FormatSupport } from '../registry';
import type { RunContext } from '../runtime';
import type { ExportSettings } from '../types';

type Video = 'mp4' | 'webm';

export async function prepareVideo(plan: Plan, s: ExportSettings): Promise<Partial<RunContext>> {
  const caps = await detectCapabilities(plan.width, plan.height);
  const c = caps[s.format as Video];
  if (!c.ok) throw new ExportProblem(c.reason ?? "This computer can't make that kind of video.");
  let videoCodec = c.codec;
  // Asked for see-through and the usual codec cannot: use the one that can.
  if (s.format === 'webm' && s.transparent && c.alphaCodec) videoCodec = c.alphaCodec;
  return { videoCodec, videoAlpha: c.alpha };
}

export async function videoSupport(format: Video, size: { width: number; height: number }): Promise<FormatSupport> {
  const c = (await detectCapabilities(size.width, size.height))[format];
  return { why: c.ok ? null : c.reason, alpha: c.alpha, video: { ok: c.ok, codec: c.codec, alphaCodec: c.alphaCodec } };
}

/**
 * MP4 with sound, on a computer that can only make Opus sound and has no ffmpeg to fix it: ask (once) what to do. The
 * sound is in the drawing whether or not the Audio feature is on, but the question belongs to Audio (Preferences >
 * Behaviour), so with Audio off nothing is asked and the video stays an MP4.
 */
export async function settleMp4Sound(doc: Doc, s: ExportSettings): Promise<ExportSettings> {
  const api = desktop();
  if (!api || !getChoiceDef('export.mp4Sound')) return s;
  if (audibleClips(doc.audio).length && !(await canMakeAac()) && !(await api.media?.aacAvailable().catch(() => false))) {
    if ((await choose<string>('export.mp4Sound')) === 'webm') return { ...s, format: 'webm' };
  }
  return s;
}
