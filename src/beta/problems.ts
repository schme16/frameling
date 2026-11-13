/**
 * The last few things that went wrong in the page, kept in memory so a report can say what happened rather than
 * "it broke". Nothing is written to disk and nothing is sent on its own: the list only ever leaves this computer
 * inside a report you press Send on.
 */
const MAX = 20;
let problems: { at: number; what: string }[] = [];
let watching = false;

/** The newest first few, as plain lines. */
export const recentProblems = (): string[] => problems.map((p) => `${new Date(p.at).toISOString()} ${p.what}`);

/** For the tests, and for after a report goes. */
export const forgetProblems = (): void => void (problems = []);

export function noteProblem(what: string): void {
  problems = [...problems, { at: Date.now(), what: what.slice(0, 500) }].slice(-MAX);
}

/** Starts listening for errors the page throws. Gives back the way to stop. */
export function watchProblems(win: Window = window): () => void {
  if (watching) return () => undefined;
  watching = true;
  const onError = (e: ErrorEvent) => noteProblem(`error: ${e.message}`);
  const onReject = (e: PromiseRejectionEvent) => noteProblem(`unhandled: ${String(e.reason).slice(0, 300)}`);
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onReject);
  return () => {
    watching = false;
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onReject);
  };
}
