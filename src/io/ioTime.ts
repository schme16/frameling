/**
 * Where the time inside a save goes, totalled in ms since the last reset, for scripts/perf and the ?debug hooks.
 * A save is milliseconds at best, so the few clock reads this costs are free; it is always on, so any build can
 * answer "what was that save made of?" without a special one.
 *
 * `trim` is finding the painted part of pixel drawings and copying it out, `history` is packing the undo steps into the
 * file, `docjson` is writing doc.json, `files` is
 * everything else the document walk does, `pngCopy` is copying pixel arrays ready for the encode workers, `post` is
 * handing jobs to workers (the structured clone of whatever goes across). Those six are time the page is held: the
 * main thread cannot draw or answer the pen during them. `pngWait` and `zipWait` are the whole wait for the workers,
 * most of which is their time, not the page's.
 */
export const ioTime = {
  trim: 0,
  history: 0,
  docjson: 0,
  files: 0,
  pngCopy: 0,
  post: 0,
  pngWait: 0,
  zipWait: 0,
  openScan: 0,
  openJson: 0,
  openDecode: 0,
  openDocBytes: 0,
  openUnzip: 0,
  openBuild: 0,
  openHistory: 0,
  openJsonWait: 0,
  openPngWait: 0,
  /** How many jobs went to a worker, and how many PNGs had to be made (the rest came from the cache). */
  posts: 0,
  pngs: 0,
  saves: 0,
  opens: 0,
  /** The time the page was held, which is the part a person feels. */
  get held(): number {
    return ioTime.trim + ioTime.history + ioTime.docjson + ioTime.files + ioTime.pngCopy + ioTime.post;
  },
  /** The same for opening: the time the page was held, which is the part a person feels. */
  get openHeld(): number {
    return ioTime.openScan + ioTime.openJson + ioTime.openUnzip + ioTime.openBuild + ioTime.openHistory;
  },
  reset(): void {
    ioTime.trim = 0;
    ioTime.history = 0;
    ioTime.docjson = 0;
    ioTime.files = 0;
    ioTime.pngCopy = 0;
    ioTime.post = 0;
    ioTime.pngWait = 0;
    ioTime.zipWait = 0;
    ioTime.posts = 0;
    ioTime.pngs = 0;
    ioTime.saves = 0;
    ioTime.opens = 0;
    ioTime.openScan = 0;
    ioTime.openJson = 0;
    ioTime.openDecode = 0;
    ioTime.openDocBytes = 0;
    ioTime.openUnzip = 0;
    ioTime.openBuild = 0;
    ioTime.openHistory = 0;
    ioTime.openJsonWait = 0;
    ioTime.openPngWait = 0;
  },
};

/** The clock, where there is one (a worker or an old environment without it still works, it just reads zero). */
export const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);
