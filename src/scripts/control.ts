// What happens around a run: the look-first sheet for a script from somewhere else, where to keep a new one, what to do
// with the scripts inside a drawing you open, and what the person is told afterwards. The run itself is runner.ts.
import { getCommand } from '../core/registry';
import { choose, currentChoice, rememberedChoice } from '../core/choices';
import { store } from '../core/store';
import { notify } from '../io/notify';
import { ask } from '../platform/ask';
import { createStore } from '../ui/mini';
import { HOME_CHOICE, IN_FILES_CHOICE } from './choices';
import { lookAt, type Look, type Script, type ScriptHome } from './model';
import { startRun, running, type PrintedLine, type RunOutcome, type ScriptRun } from './runner';
import { allScripts, canRun, createScript, docScripts, findScript, loadDocScripts, openId, rememberAllowed, scripts, setDocOn, setRunHandler, updateScript, wasAllowed } from './state';
import { isRunnable } from '../plugins/appRules';

/** What the panel shows about the latest run. */
export interface RunView {
  id: string;
  name: string;
  printed: PrintedLine[];
  /** Null while it is still going. */
  outcome: RunOutcome | null;
}
export const lastRun = createStore<RunView | null>(null);

let current: ScriptRun | null = null;

// ---------------------------------------------------------------- the sheet that stops

/** The words of the look-first sheet. Pure given what the commands are called. */
export function lookWords(script: Pick<Script, 'name'>, look: Look, labelOf: (id: string) => string | undefined): { message: string; detail: string } {
  const lines: string[] = ['It can change your drawing and press Frameling\'s own commands. It has no internet and can\'t reach your files.'];
  const named = look.commandIds.filter((id) => isRunnable(id) && labelOf(id));
  if (named.length) lines.push(`It presses: ${named.slice(0, 8).map((id) => labelOf(id)).join(', ')}${named.length > 8 ? ` and ${named.length - 8} more` : ''}.`);
  if (look.blocked.length) lines.push(`It names ${look.blocked.slice(0, 4).join(', ')}, which scripts aren't allowed to press, so those will fail.`);
  if (look.endlessLoop) lines.push('It has a loop that might never end. Frameling stops any script that goes quiet for a few seconds.');
  if (look.mentionsInternet) lines.push('It mentions the internet. Scripts have none, so that part will fail.');
  lines.push('A run is one step in Undo, and a run that goes wrong puts your drawing back how it was.');
  return { message: `"${script.name}" came from somewhere else. Read it in the editor first. Run it?`, detail: lines.join('\n\n') };
}

/** Stops and shows a script that was not written here. Resolves how to go on. */
export async function lookFirst(script: Script): Promise<'once' | 'trust' | 'cancel'> {
  const look = lookAt(script.code, (id) => !!getCommand(id));
  const w = lookWords(script, look, (id) => getCommand(id)?.label);
  const answer = await ask({
    id: 'scripts.lookFirst',
    title: 'Look before it runs',
    message: w.message,
    detail: w.detail,
    buttons: [
      { value: 'once', label: 'Run it this time', primary: true },
      { value: 'trust', label: 'I have read it, trust it' },
      { value: 'cancel', label: 'Cancel' },
    ],
    cancel: 'cancel',
  });
  return answer === 'once' || answer === 'trust' ? answer : 'cancel';
}

// ---------------------------------------------------------------- running

/** Runs a script the way a person asked: after the look-first sheet when it is somebody else's. Resolves the outcome, or null when it did not run. */
export async function runScript(script: Script): Promise<RunOutcome | null> {
  if (!canRun(script)) {
    notify("This drawing's scripts are off. Open the Scripts panel to read them and turn them on.", 'info');
    return null;
  }
  if (running.get()) {
    notify(`"${running.get()!.name}" is still running. Stop it first, or wait for it.`, 'info');
    return null;
  }
  if (script.home === 'app' && !script.reviewed) {
    const a = await lookFirst(script);
    if (a === 'cancel') return null;
    if (a === 'trust') updateScript(script.id, { reviewed: true });
  }
  const view: RunView = { id: script.id, name: script.name, printed: [], outcome: null };
  lastRun.set(view);
  const r = startRun(script, undefined, {
    onPrint: (l) => {
      view.printed = [...view.printed, l].slice(-300);
      lastRun.set({ ...view });
    },
  });
  current = r;
  const outcome = await r.done;
  if (current === r) current = null;
  lastRun.set({ ...view, printed: outcome.printed.slice(-300), outcome });
  tell(script, outcome);
  return outcome;
}

/** What the person hears after a run. The panel shows the details; this is for a run that came from a key or the palette. */
function tell(script: Script, o: RunOutcome): void {
  if (o.ok) {
    notify(o.changes ? `${script.name}: done. Ctrl+Z takes it all back in one step.` : `${script.name}: done. It didn't change the drawing.`, 'success', undefined, 3500);
  } else {
    const where = o.line ? ` (line ${o.line})` : '';
    notify(`${script.name}${where}: ${o.message}`, o.ended ? 'warn' : 'error', { label: 'Open it', run: () => openScript(script.id) }, 9000);
  }
}

/** A run started somewhere other than the panel (the remote door) becomes the one Stop ends, until it finishes. */
export function adoptRun(r: ScriptRun): void {
  current = r;
  void r.done.then(() => {
    if (current === r) current = null;
  });
}

/** Stops the script that is running. Safe to call when none is. */
export function stopRunning(): boolean {
  if (!current) return false;
  current.stop();
  return true;
}

let showPanel: () => void = () => undefined;
/** The panel hands over how to bring itself up (so this file does not need the dock). */
export function setPanelOpener(fn: () => void): void {
  showPanel = fn;
}

export function openScript(id: string): void {
  openId.set(id);
  showPanel();
}

setRunHandler((s) => void runScript(s));

// ---------------------------------------------------------------- new scripts

/** Where a new script goes: asks the first time (with a sheet), then remembers. A drawing whose scripts are off can't be added to. */
export async function chooseHome(): Promise<ScriptHome> {
  const home = await choose<ScriptHome>(HOME_CHOICE);
  if (home === 'doc' && scripts.get().doc.length && !scripts.get().docOn) return 'app';
  return home;
}

export async function newScript(name: string, code: string, reviewed = true, home?: ScriptHome): Promise<Script | null> {
  const h = home ?? (await chooseHome());
  const r = createScript(name, code, h, reviewed);
  if ('why' in r) {
    notify(r.why, 'warn');
    return null;
  }
  // A person who puts a script into an empty drawing has no reason to be asked about it.
  // A person who puts a script into a drawing that has none of somebody else's has no reason to be asked about their own.
  if (h === 'doc' && !scripts.get().docOn) {
    setDocOn(true);
    rememberAllowed(store().rootDoc().id, scripts.get().doc);
  }
  openId.set(r.script.id);
  return r.script;
}

// ---------------------------------------------------------------- scripts inside a drawing you open

let opening = 0;

/** A drawing was opened: read its scripts, and unless the person already said yes to exactly these, leave them off and ask. */
export async function onDrawingOpened(): Promise<void> {
  const ticket = ++opening;
  const found = docScripts();
  const id = store().rootDoc().id;
  loadDocScripts(false);
  if (!found.length) return;
  if (wasAllowed(id, found)) return setDocOn(true);
  // A remembered "never" is a quiet no: the scripts are listed in the panel, switched off.
  if (rememberedChoice(IN_FILES_CHOICE) === 'never') return;
  const names = found.slice(0, 5).map((s) => s.name).join(', ');
  const answer = await choose<'off' | 'on' | 'never'>(IN_FILES_CHOICE);
  // Another drawing was opened while the question was up: this answer is about the one before.
  if (ticket !== opening || answer !== 'on') {
    if (answer !== 'on' && ticket === opening) notify(`This drawing has scripts (${names}). They are off. Open the Scripts panel to read them.`, 'info', { label: 'Read them', run: () => openScript(found[0].id) }, 8000);
    return;
  }
  setDocOn(true);
  rememberAllowed(id, found);
}

/** Turns the open drawing's scripts on, after the person has read them (the panel's button). */
export function allowDrawingScripts(): void {
  setDocOn(true);
  rememberAllowed(store().rootDoc().id, scripts.get().doc);
}

/** What the choice currently says to do with new scripts, without asking (for the panel's hint). */
export const homeNow = (): ScriptHome => currentChoice<ScriptHome>(HOME_CHOICE);

export { allScripts, findScript };
