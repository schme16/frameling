// MP4 and WebM. The sound is mixed in from the timeline whether or not the Audio feature is on: the sound data lives
// in the document, so a video keeps it.
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, VideoSample, VideoSampleSource, WebMOutputFormat } from 'mediabunny';
import { audibleClips } from '../../audio/clips';
import { NO_SOUND_NOTE, prepareSound } from '../../audio/export';
import { breathe } from '../runtime';
import { BT709_LIMITED, rgbaToI420 } from '../yuv';
import type { ExporterRun } from '../registry';

export const run: ExporterRun['run'] = async (ctx, { plan, bg, canvas, step, rgbaAt, frameAt }) => {
  const { doc, settings, signal } = ctx;
  const codec = ctx.videoCodec;
  if (!codec) throw new Error("This computer can't make that kind of video.");
  const mp4 = settings.format === 'mp4';
  const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
  // MP4 frames are converted to limited range BT.709 here (see yuv.ts); left to the browser they come out full
  // range. WebM keeps the canvas path, which is what carries a see-through background.
  const config = { codec, quality: QUALITY_HIGH, ...(bg === 'none' ? { alpha: 'keep' as const } : {}) };
  const source = mp4 ? new VideoSampleSource(config) : new CanvasSource(canvas, config);
  output.addVideoTrack(source, { frameRate: doc.fps });
  // The timeline's sounds, mixed (a note comes back when there was sound but it could not go in).
  // A clip that plays backward or a set number of times no longer matches the timeline's sound, so that is left out.
  const sound = plan.order
    ? { track: null, note: audibleClips(doc.audio).length ? 'The video has no sound, because this clip plays in a different order than the timeline.' : undefined }
    : await prepareSound(doc, mp4, plan.range.start, plan.count, output).catch(() => ({ track: null, note: NO_SOUND_NOTE }));
  try {
    await output.start();
    const dt = 1 / doc.fps;
    let yuv: Uint8Array | undefined;
    for (let i = 0; i < plan.count; i++) {
      await breathe(signal, i);
      step(i, `Drawing frame ${i + 1} of ${plan.count}`);
      // The time of each frame is its number divided by the frame rate, however long drawing it took.
      if (source instanceof VideoSampleSource) {
        const img = rgbaAt(i);
        yuv = rgbaToI420(img.pixels, img.width, img.height, yuv);
        const sample = new VideoSample(yuv, { format: 'I420', codedWidth: img.width, codedHeight: img.height, timestamp: i * dt, duration: dt, colorSpace: BT709_LIMITED });
        try {
          await source.add(sample);
        } finally {
          sample.close();
        }
      } else {
        frameAt(i);
        await source.add(i * dt, dt);
      }
      await sound.track?.feed(i);
    }
    sound.track?.finish();
    step(plan.count, 'Finishing the video');
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  }
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) throw new Error('The video came out empty. Please try again.');
  let bytes: Uint8Array = new Uint8Array(buf);
  // Opus in an MP4 is silent in QuickTime, Safari and on iPhones, so it becomes AAC where ffmpeg can do it.
  if (mp4 && 'codec' in sound && sound.codec === 'opus' && ctx.toAac) {
    step(plan.count, 'Making the sound play everywhere');
    bytes = (await ctx.toAac(bytes).catch(() => null)) ?? bytes;
  }
  return { kind: 'file', name: `${plan.name}.${mp4 ? 'mp4' : 'webm'}`, bytes, ...(sound.note ? { note: sound.note } : {}) };
};
