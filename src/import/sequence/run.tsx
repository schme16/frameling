// Bringing in a sequence of pictures: from several picked pictures, a folder or a zip (Frameling's own PNG sequence
// export too). It reads the names, sorts them the way a person would, reads the pictures, shows what it found, and only
// then, on Bring them in, makes the frames.
import { store } from '../../core/store';
import type { Id } from '../../core/format';
import { baseName, stripExt } from '../../io/desktop';
import { askAboutUnsavedChanges } from '../../io/document';
import { mountModal } from '../../io/mount';
import { notify } from '../../io/notify';
import { spriteDoc, spriteInto, type BuildOptions } from '../../pixel/import/build';
import { pickFiles, folderNameOf } from '../pick';
import { reportImport } from '../report';
import { hasDrawing, whereToPut, type ImportWhere } from '../where';
import { SequenceDialog, type SequenceRequest } from './SequenceDialog';
import { nameList, planSequence, sequenceReport, SEQUENCE_ACCEPT, SEQUENCE_PICTURE, type SequencePlan } from './plan';
import { decodeAll, readZipPictures, SequenceProblem, sequenceSprite, type NamedBytes } from './read';

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Pictures not yet read: their paths now, their bytes when asked for. */
export interface Source {
  /** What the drawing is called: the folder, the zip or the pictures' shared name. */
  name: string;
  entries: { path: string; read: () => Promise<Uint8Array> }[];
  /** Names of other things that came along (not pictures). */
  others: string[];
}

async function bringIn(src: Source): Promise<boolean> {
  const plan = planSequence([...src.entries.map((e) => e.path), ...src.others]);
  if (!plan.pictures.length) {
    const what = plan.others.length ? ` It has ${plural(plan.others.length, 'other file')}: ${nameList(plan.others)}.` : ' It is empty.';
    notify(`There are no pictures in "${src.name}" for Frameling to bring in (PNG, JPG, WebP, BMP or GIF).${what}`, 'warn', undefined, 9000);
    return false;
  }
  const doc = store().get().doc;
  const where = await whereToPut(doc);
  if (where === 'add' && store().nestedTag()) {
    notify('Close the symbol you are editing first, then add the pictures to the drawing.', 'info');
    return false;
  }
  const byPath = new Map(src.entries.map((e) => [e.path, e]));
  const files: NamedBytes[] = [];
  if (plan.pictures.length > 12) notify(`Reading ${plan.pictures.length} pictures...`, 'info', undefined, 4000);
  for (const p of plan.pictures) {
    try {
      files.push({ path: p, bytes: await byPath.get(p)!.read() });
    } catch {
      files.push({ path: p, bytes: new Uint8Array(0) });
    }
  }
  const decoded = await decodeAll(files);
  if (!decoded.pictures.length) {
    notify(`Frameling couldn't read any of the ${plural(plan.pictures.length, 'picture')} in "${src.name}". They may be damaged, or not the kind of picture it knows.`, 'error', undefined, 9000);
    return false;
  }
  return new Promise<boolean>((resolve) => {
    let done = false;
    mountModal((close) => (
      <SequenceDialog
        name={src.name}
        plan={plan}
        decoded={decoded}
        into={where === 'add'}
        docFps={doc.fps}
        close={() => {
          close();
          if (!done) resolve(false);
        }}
        finish={(req) => {
          done = true;
          void make(src.name, where, plan, decoded.unreadable, req).then(resolve);
        }}
      />
    ));
  });
}

async function make(name: string, where: ImportWhere, plan: SequencePlan, unreadable: { path: string; why: string }[], req: SequenceRequest): Promise<boolean> {
  let sprite;
  try {
    sprite = sequenceSprite(req.pictures, req.timing);
  } catch (e) {
    notify(e instanceof SequenceProblem ? e.message : "Frameling couldn't make frames from those pictures.", 'error');
    return false;
  }
  const options: BuildOptions = { way: 'animation', name, rowsAsSprites: false, palette: false, fps: req.timing.fps };
  const shown: SequencePlan = { ...plan, pictures: req.pictures.map((p) => p.path) };
  let notes: string[] = [];
  if (where === 'add') {
    const frame = store().get().ui.frame;
    store().update(`Add pictures "${name}"`, (d) => {
      notes = spriteInto(d, sprite, options, frame);
    });
    const doc = store().get().doc;
    store().setUi({ activeLayerId: doc.layers[doc.layers.length - 1].id as Id });
  } else {
    let made;
    try {
      made = spriteDoc(sprite, options);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Frameling couldn't make a drawing from those pictures.", 'error');
      return false;
    }
    if (hasDrawing(store().get().doc) && !(await askAboutUnsavedChanges())) return false;
    // A new drawing with no file yet, so Save asks where to put it.
    store().load(made.doc, null);
    store().setUi({ dirty: true });
    notes = made.notes;
  }
  reportImport(sequenceReport(name, where, sprite.frames.length * req.timing.hold, sprite, shown, unreadable, notes.filter((n) => !/same size/.test(n))));
  return true;
}

// ---------------------------------------------------------------- where the pictures come from

/** Pictures picked one by one, or a whole folder of them. */
export async function importSequenceFiles(files: { path: string; file: File }[], folderName = ''): Promise<boolean> {
  const pictures = files.filter((f) => SEQUENCE_PICTURE.test(f.path));
  const zip = files.length === 1 && /\.zip$/i.test(files[0].path) ? files[0] : null;
  if (zip) return importSequenceZip(new Uint8Array(await zip.file.arrayBuffer()), zip.path);
  const names = files.map((f) => f.path);
  const plan = planSequence(names);
  const name = folderName || plan.runs[0]?.label || 'Pictures';
  const entries = pictures.map((f) => ({ path: f.path, read: async () => new Uint8Array(await f.file.arrayBuffer()) }));
  return bringIn({ name, entries, others: files.filter((f) => !SEQUENCE_PICTURE.test(f.path)).map((f) => f.path) });
}

/** A zip of pictures (Frameling's own PNG sequence is one). */
export async function importSequenceZip(bytes: Uint8Array, path: string): Promise<boolean> {
  let read;
  try {
    read = readZipPictures(bytes);
  } catch (e) {
    notify(e instanceof SequenceProblem ? e.message : "Frameling couldn't open that zip.", 'error', undefined, 9000);
    return false;
  }
  const name = stripExt(baseName(path)) || 'Pictures';
  return bringIn({ name, entries: read.pictures.map((p) => ({ path: p.path, read: async () => p.bytes })), others: read.others });
}

/** File > Import > Pictures: pick several pictures or one zip. */
export async function pickSequenceFiles(): Promise<void> {
  const files = await pickFiles(`${SEQUENCE_ACCEPT},.zip`, { multiple: true });
  if (files.length) await importSequenceFiles(files);
}

/** File > Import > Folder of pictures. */
export async function pickSequenceFolder(): Promise<void> {
  const files = await pickFiles('', { folder: true });
  if (files.length) await importSequenceFiles(files, folderNameOf(files));
}
