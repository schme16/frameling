// Opening a video as frames to trace over. It reads the video's facts, shows what it found and what the choices make, and
// only then, on Bring them in, reads the pictures: as a reference layer (card: a picture for each frame) or as pixel frames,
// the same way a sequence of pictures comes in.
import { choose } from '../../core/choices';
import { store } from '../../core/store';
import type { Doc, Id, ReferencePicture } from '../../core/format';
import { uid } from '../../core/doc';
import { stripExt } from '../../io/desktop';
import { askAboutUnsavedChanges } from '../../io/document';
import { mountModal } from '../../io/mount';
import { notify } from '../../io/notify';
import { spriteDoc, spriteInto, type BuildOptions } from '../../pixel/import/build';
import { framesPicture, nameFromFile } from '../../reference/model';
import { addReferenceLayer } from '../../reference/ops';
import { setPlacing } from '../../reference/state';
import type { LongVideoChoice } from '../../reference/choices';
import '../../reference/choices';
import { pickFiles } from '../pick';
import { reportImport } from '../report';
import { hasDrawing, whereToPut } from '../where';
import { sequenceSprite, type DecodedPicture } from '../sequence/read';
import { VideoDialog } from './VideoDialog';
import { frameSize, frameTimes, landingFrames, lastHold, videoReport, foundSummary, VIDEO_ACCEPT, type VideoRequest } from './plan';
import { jpegOf, openVideo, pixelsOf, VideoProblem, type OpenVideo } from './read';

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** Reads the pictures and puts them where the request says. Resolves to whether anything came in. */
async function make(video: OpenVideo, req: VideoRequest, progress: (d: number, t: number) => void, signal: AbortSignal): Promise<boolean> {
  const facts = video.facts;
  const name = stripExt(facts.name) || 'Video';
  const times = frameTimes(req.start, req.end, req.rate);
  const size = frameSize(facts.width, facts.height, req.side);
  const info = foundSummary(facts, req);
  const doc0 = store().get().doc;
  const where = req.as === 'pixel' ? await whereToPut(doc0) : 'add';
  if (where === 'add' && store().nestedTag()) {
    notify('Close the symbol you are editing first, then bring the video in.', 'info');
    return false;
  }
  const shown: { time: number; ref?: Uint8Array; pic?: DecodedPicture }[] = [];
  try {
    let n = 0;
    for await (const f of video.frames(times, size.width, size.height, signal)) {
      if (req.as === 'reference') shown.push({ time: f.time, ref: await jpegOf(f.canvas) });
      else shown.push({ time: f.time, pic: { path: `${name} ${pad(n + 1, 4)}`, ...pixelsOf(f.canvas) } });
      progress(++n, times.length);
    }
  } catch (e) {
    notify(e instanceof VideoProblem ? e.message : "Frameling couldn't read the pictures from that video.", 'error', undefined, 9000);
    return false;
  }
  if (signal.aborted) {
    notify('Stopped. Nothing was brought in.', 'info');
    return false;
  }
  if (!shown.length) {
    notify('No pictures could be read from that stretch of the video. Try a different part, or convert the video to an MP4 first.', 'error', undefined, 9000);
    return false;
  }
  const missed = times.length - shown.length;
  const left = [...info.left, ...(missed > 0 ? [`${missed} ${missed === 1 ? 'picture' : 'pictures'} the video had nothing for (past its end).`] : [])];

  if (req.as === 'reference') {
    const doc = store().get().doc;
    const first = store().get().ui.frame;
    const starts = landingFrames(shown.map((s) => s.time), req.start, doc.fps, first);
    const hold = lastHold(req.rate, doc.fps);
    const need = starts[starts.length - 1] + hold;
    let extend = false;
    if (need > doc.length) extend = (await choose<LongVideoChoice>('reference.longVideo')) === 'extend';
    // Frames that fall past the end (animation kept as it is) are left out.
    const keep = extend ? shown.length : starts.filter((s) => s < doc.length).length;
    if (keep < shown.length) left.push(`${shown.length - keep} pictures that fall after the last frame of your animation.`);
    const pics: { picture: ReferencePicture; isNew: boolean }[] = shown.slice(0, keep).map((s, i) => ({
      picture: { id: uid('p'), name: `${name} ${pad(i + 1, 4)}`, data: s.ref!, mime: 'image/jpeg', width: size.width, height: size.height },
      isNew: true,
    }));
    if (!pics.length) {
      notify('None of the pictures fit in your animation. Move to an earlier frame, or let the animation grow.', 'warn');
      return false;
    }
    const id: Id = addReferenceLayer(`Video "${name}" as reference`, nameFromFile(name), pics, (d: Doc) => framesPicture(pics.map((p) => p.picture), starts.slice(0, keep), hold, d), extend ? need : undefined);
    setPlacing(id);
    reportImport(videoReport(name, pics.length, req, size, left, info.notes, 'Added'));
    return true;
  }

  // Pixel frames: the same path as a sequence of pictures.
  const pictures = shown.map((s) => s.pic!);
  const rate = where === 'add' ? doc0.fps : req.rate;
  const sprite = sequenceSprite(pictures, { fps: rate, hold: where === 'add' ? lastHold(req.rate, doc0.fps) : 1, reverse: false });
  const options: BuildOptions = { way: 'animation', name, rowsAsSprites: false, palette: false, fps: rate };
  let notes: string[] = [];
  if (where === 'add') {
    const frame = store().get().ui.frame;
    store().update(`Add video "${name}"`, (d) => {
      notes = spriteInto(d, sprite, options, frame);
    });
    const doc = store().get().doc;
    store().setUi({ activeLayerId: doc.layers[doc.layers.length - 1].id as Id });
  } else {
    let made;
    try {
      made = spriteDoc(sprite, options);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Frameling couldn't make a drawing from that video.", 'error');
      return false;
    }
    if (hasDrawing(store().get().doc) && !(await askAboutUnsavedChanges())) return false;
    store().load(made.doc, null);
    store().setUi({ dirty: true });
    notes = made.notes;
  }
  reportImport(videoReport(name, pictures.length, req, size, left, [...info.notes, ...notes.filter((n) => !/same size/.test(n))], where === 'add' ? 'Added' : 'Opened'));
  return true;
}

/** Opens the window for a video file. Resolves to whether pictures came in. */
export async function openVideoFile(file: File): Promise<boolean> {
  let video: OpenVideo;
  notify(`Reading "${file.name}"...`, 'info', undefined, 2500);
  try {
    video = await openVideo(file);
  } catch (e) {
    notify(e instanceof VideoProblem ? e.message : `Frameling couldn't read "${file.name}".`, 'error', undefined, 9000);
    return false;
  }
  if (!(video.facts.duration > 0)) {
    video.close();
    notify(`"${file.name}" has no length Frameling can read, so there is nothing to bring in.`, 'warn', undefined, 8000);
    return false;
  }
  const doc = store().get().doc;
  return new Promise<boolean>((resolve) => {
    let done = false;
    mountModal((close) => (
      <VideoDialog
        video={video}
        docFps={doc.fps}
        into={hasDrawing(doc)}
        work={(req, progress, signal) =>
          make(video, req, progress, signal).then((ok) => {
            done = ok;
            return ok;
          })
        }
        close={() => {
          close();
          video.close();
          resolve(done);
        }}
      />
    ));
  });
}

/** File > Import > Video, to trace over. */
export async function pickVideo(): Promise<void> {
  const files = await pickFiles(VIDEO_ACCEPT);
  if (files[0]) await openVideoFile(files[0].file);
}

/** A video dropped on the window, or opened by path. */
export const dropVideo = (files: File[]): Promise<boolean> => openVideoFile(files[0]);
export const openVideoBytes = (bytes: Uint8Array, path: string): Promise<boolean> => openVideoFile(new File([bytes as BlobPart], path.slice(path.lastIndexOf('/') + 1)));
