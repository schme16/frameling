// Records a timelapse: while it is on, a small picture of the drawing is kept now and then, written to disk as it goes.
// It only READS the drawing (it draws a copy onto its own canvas and never touches the document or the undo history).
// Nothing is saved in the .frameling file. The bounds are in plan.ts: a longest side, a count, a size on disk, and a gap
// between pictures that doubles when the bounds are hit.
import { choose } from '../core/choices';
import type { Doc } from '../core/format';
import { sceneOf } from '../core/symbols';
import { store } from '../core/store';
import { canvasBytes } from '../export/encode';
import { backgroundFor, drawFrame, makeCanvas, readPixels } from '../export/draw';
import { notify } from '../io/notify';
import { library } from '../platform/library';
import { createStore } from '../ui/mini';
import {
  START_GAP_MS,
  fitInBox,
  inOrder,
  latestSession,
  limitsFor,
  overBound,
  type Limits,
  pictureBox,
  pictureId,
  pixelHash,
  sessionName,
  staleIds,
  thin,
  whenToTake,
  words,
  type Kept,
} from './plan';

export type Status = 'off' | 'recording' | 'paused';

export interface RecState {
  status: Status;
  /** Pictures kept, and how many bytes they take. Also true after stopping, until they are cleared. */
  count: number;
  bytes: number;
  /** When this recording began, and when the first and last pictures were taken. */
  startedAt: number | null;
  firstAt: number | null;
  lastAt: number | null;
  /** The drawing it records. */
  docId: string | null;
  docName: string;
  /** Pictures from before this app session are waiting (found when it started). */
  waiting: number;
}

const idle: RecState = { status: 'off', count: 0, bytes: 0, startedAt: null, firstAt: null, lastAt: null, docId: null, docName: '', waiting: 0 };
export const recorder = createStore<RecState>(idle);

const KIND = 'timelapse';
let session = '';
let seq = 0;
let kept: Kept[] = [];
let box: { width: number; height: number } | null = null;
let gapMs = START_GAP_MS;
let lastDoc: Doc | null = null;
let lastHash = -1;
let lastTakenAt: number | null = null;
let busy = false;
/** How long taking pictures has cost, for the harness: the time on the main thread per picture, drawing and saving. */
export const captureStats = { pictures: 0, totalMs: 0, maxMs: 0 };
let limitsOverride: Limits | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let unsub: (() => void)[] = [];
let canvas: OffscreenCanvas | null = null;
let scratch: OffscreenCanvas | null = null;
// Writes in flight, so stopping waits for the last picture to land.
let inflight: Promise<void> = Promise.resolve();

export const isRecording = (): boolean => recorder.get().status !== 'off';
export const pictureCount = (): number => recorder.get().count;

const sum = (list: Kept[]): number => list.reduce((n, k) => n + k.bytes, 0);

function publish(): void {
  const list = kept;
  recorder.set((s) => ({ ...s, count: list.length, bytes: sum(list), firstAt: list[0]?.at ?? null, lastAt: list.length ? list[list.length - 1].at : null }));
}

/** The pictures kept from the newest timelapse, found on disk (so they are there after restarting the app). */
export async function findKept(): Promise<{ session: string; pictures: Kept[]; others: string[] } | null> {
  return latestSession(await library.list(KIND));
}

/** The size of the first picture, to carry on a timelapse at the same size. */
async function sizeOf(first: Kept): Promise<{ width: number; height: number } | null> {
  const bytes = await library.read(KIND, first.id);
  if (!bytes) return null;
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/webp' }));
    const out = { width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  } catch {
    return null;
  }
}

/** Clears pictures: the ones named, or all of them. */
export async function clearPictures(ids?: string[]): Promise<void> {
  const list = ids ?? (await library.list(KIND)).map((e) => e.id);
  for (const id of list) await library.remove(KIND, id);
  if (!ids) {
    kept = [];
    publish();
    recorder.set((s) => ({ ...s, waiting: 0 }));
  }
}

/** Looks for pictures waiting from an earlier run, so the menu and the palette can offer to export them. */
export async function lookForWaiting(): Promise<void> {
  const f = await findKept().catch(() => null);
  if (isRecording()) return;
  kept = f?.pictures ?? [];
  publish();
  recorder.set((s) => ({ ...s, waiting: kept.length }));
}

// ---------------------------------------------------------------- taking a picture

function sceneNow(): { doc: Doc; frame: number } {
  const st = store().get();
  return sceneOf(st.doc, st.ui.frame);
}

/** Draws the drawing into the session's box (letterboxed when its size has changed) and gives back the canvas. */
function draw(doc: Doc, frame: number): OffscreenCanvas {
  const b = box!;
  if (!canvas || canvas.width !== b.width || canvas.height !== b.height) canvas = makeCanvas(b.width, b.height);
  const bg = backgroundFor(doc, false, false);
  const crisp = doc.layers.length > 0 && doc.layers.every((l) => l.kind !== 'vector' || !!l.rig);
  const fit = fitInBox(doc.width, doc.height, b.width, b.height);
  const exact = Math.abs(fit.x) < 1 && Math.abs(fit.y) < 1;
  if (exact) return drawFrame(canvas, doc, frame, { width: b.width, height: b.height, scale: fit.scale, background: bg, crisp });
  // A different size from the first picture: draw it on its own, then place it in the middle of the box.
  const w = Math.max(1, Math.round(doc.width * fit.scale));
  const h = Math.max(1, Math.round(doc.height * fit.scale));
  if (!scratch || scratch.width !== w || scratch.height !== h) scratch = makeCanvas(w, h);
  drawFrame(scratch, doc, frame, { width: w, height: h, scale: fit.scale, background: bg, crisp });
  const g = canvas.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = doc.background ?? '#ffffff';
  g.fillRect(0, 0, b.width, b.height);
  g.drawImage(scratch, Math.round(fit.x), Math.round(fit.y));
  return canvas;
}

async function takePicture(): Promise<void> {
  const { doc, frame } = sceneNow();
  busy = true;
  const began = performance.now();
  try {
    lastDoc = doc;
    if (!box) {
      const b = pictureBox(doc.width, doc.height);
      box = { width: b.width, height: b.height };
    }
    const c = draw(doc, frame);
    const hash = pixelHash(readPixels(c).pixels);
    lastTakenAt = Date.now();
    // Something changed that does not show (a layer's name): no picture, but the clock still counts.
    if (hash === lastHash) return;
    lastHash = hash;
    const bytes = await canvasBytes(c, 'image/webp', 0.8);
    const cost = performance.now() - began;
    captureStats.pictures++;
    captureStats.totalMs += cost;
    captureStats.maxMs = Math.max(captureStats.maxMs, cost);
    const id = pictureId(session, seq++);
    const entry: Kept = { id, at: Date.now(), bytes: bytes.length };
    kept = [...kept, entry];
    const wrote = library.write(KIND, id, bytes);
    inflight = inflight.then(() => wrote).catch(() => undefined);
    publish();
    const limits = limitsOverride ?? limitsFor(library.persistent());
    if (overBound(kept, limits)) {
      const t = thin(kept, limits, gapMs);
      gapMs = t.gapMs;
      const gone = new Set(t.drop);
      kept = kept.filter((k) => !gone.has(k.id));
      // After the writes in flight, so a picture is never removed before it has landed.
      inflight = inflight.then(() => Promise.all(t.drop.map((d) => library.remove(KIND, d))).then(() => undefined)).catch(() => undefined);
      publish();
    }
  } catch {
    // A picture that could not be made is just a gap; recording carries on.
  } finally {
    busy = false;
    arm();
  }
}

function changed(): boolean {
  return sceneNow().doc !== lastDoc;
}

/** Decides what to do about a change: take a picture now, or come back when the gap allows. */
function arm(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const s = recorder.get();
  if (s.status === 'off') return;
  const w = whenToTake({ changed: changed(), lastAt: lastTakenAt, now: Date.now(), gapMs, busy, paused: s.status === 'paused' });
  if (w.take) void takePicture();
  else if (w.wait !== null) timer = setTimeout(arm, w.wait);
}

// ---------------------------------------------------------------- start, pause, stop

/** Starts recording the drawing that is open. `auto` is for starting when a drawing opens: it never asks anything. */
export async function startRecording(opts: { auto?: boolean; gapMs?: number } = {}): Promise<boolean> {
  if (isRecording()) {
    notify('A timelapse is already recording.', 'info');
    return false;
  }
  const found = await findKept().catch(() => null);
  let carryOn = false;
  if (found && found.pictures.length && !opts.auto) carryOn = (await choose<string>('timelapse.startAgain')) === 'continue';
  if (found) {
    // Older sessions always go, and so do pictures past their time.
    await clearPictures([...found.others, ...(carryOn ? [] : found.pictures.map((k) => k.id))]);
    await clearPictures(staleIds((await library.list(KIND)).map((e) => ({ id: e.id, modified: e.modified })), Date.now()));
  }
  const root = store().rootDoc();
  kept = [];
  box = null;
  gapMs = opts.gapMs ?? START_GAP_MS;
  lastHash = -1;
  lastDoc = null;
  lastTakenAt = null;
  const now = Date.now();
  session = sessionName(now);
  seq = 0;
  if (carryOn && found) {
    session = found.session;
    kept = inOrder(found.pictures);
    seq = Math.max(...kept.map((k) => parseInt(k.id.slice(-5), 36))) + 1;
    box = await sizeOf(kept[0]);
  }
  recorder.set({ ...recorder.get(), status: 'recording', startedAt: now, docId: root.id, docName: root.name, waiting: 0 });
  publish();
  void import('./Badge').then((m) => m.watchBadge());
  unsub = [store().subscribe(arm), store().onLoad(onLoad)];
  arm();
  return true;
}

/** Another drawing opened: this timelapse is of the one before, so it stops (the pictures stay for exporting). */
function onLoad(): void {
  if (!isRecording()) return;
  if (store().rootDoc().id === recorder.get().docId) return;
  void stopRecording('You opened another drawing, so the timelapse stopped.');
}

export function pauseRecording(): void {
  const s = recorder.get();
  if (s.status === 'off') return;
  const next = s.status === 'paused' ? 'recording' : 'paused';
  recorder.set({ ...s, status: next });
  // Coming back: what was drawn while paused is not shown until the next change, so the video skips it.
  if (next === 'recording') lastDoc = sceneNow().doc;
  arm();
}

/** Stops, takes one last picture of how the drawing ended up, and says how much there is. */
export async function stopRecording(why?: string): Promise<void> {
  if (!isRecording()) return;
  const wasPaused = recorder.get().status === 'paused';
  if (timer) clearTimeout(timer);
  timer = null;
  for (const u of unsub) u();
  unsub = [];
  // The ending matters most in a timelapse, so a change still waiting out the gap is taken now.
  if (!wasPaused && !busy && changed() && store().rootDoc().id === recorder.get().docId) await takePicture();
  await inflight;
  if (timer) clearTimeout(timer);
  timer = null;
  recorder.set({ ...recorder.get(), status: 'off', waiting: kept.length });
  const n = kept.length;
  if (!n) return void notify(why ? `${why} Nothing was recorded.` : 'The timelapse stopped. Nothing was recorded.', 'info');
  const span = kept[n - 1].at - kept[0].at;
  const msg = `${why ? `${why} ` : 'The timelapse stopped. '}${n} ${n === 1 ? 'picture' : 'pictures'} over ${words(span / 1000)}.`;
  notify(msg, 'success', { label: 'Make the video', run: () => void import('./open').then((m) => m.openTimelapseExport()) }, 9000);
}

export function toggleRecording(): void {
  if (isRecording()) void stopRecording();
  else void startRecording();
}

/** For the harness: smaller bounds, so thinning can be seen in seconds. */
export function setLimitsForTests(l: Limits | null): void {
  limitsOverride = l;
}

/** A new session is begun with these (for tests and the harness): the state as if nothing had happened. */
export function resetForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  for (const u of unsub) u();
  unsub = [];
  kept = [];
  box = null;
  busy = false;
  recorder.set(idle);
}
