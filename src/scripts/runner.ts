// Runs one script. A script is a plugin in disguise: the same sandbox, the same checked messages, the same watchdog.
// What is different is the person waiting for it. Everything it does to the drawing is one step in Undo, and a run that
// fails, is stopped or gets stuck puts the drawing back how it was.
import { applyOps } from '../plugins/ops';
import { appCommands, appRun, appSet } from '../plugins/appBridge';
import type { PluginManifest } from '../plugins/manifest';
import { PluginRuntime, type HostHooks, type Transport } from '../plugins/runtime';
import { startSandbox, type SandboxStart } from '../plugins/sandbox';
import { WATCHDOG } from '../plugins/watchdog';
import { drawingAt, findLayer } from '../core/doc';
import { store } from '../core/store';
import { rootDoc } from '../core/symbols';
import { withoutNotes } from '../notes/model';
import { notify } from '../io/notify';
import { running } from './state';
import { pluginIdOf, wrapScript, type Script } from './model';

export interface PrintedLine {
  level: 'log' | 'info' | 'warn' | 'error';
  text: string;
}

export interface RunOutcome {
  ok: boolean;
  /** What went wrong, in plain words. */
  message?: string;
  /** The line of the script it went wrong on. */
  line?: number;
  /** Why it ended early, when it did not end by itself. */
  ended?: 'stopped' | 'stuck';
  /** How many changes were made (steps folded into the one Undo), when it worked. */
  changes: number;
  ms: number;
  printed: PrintedLine[];
}

export interface ScriptRun {
  id: string;
  /** Stops it now. The drawing goes back how it was. */
  stop(): void;
  done: Promise<RunOutcome>;
}

export { running };

/** Swapped in tests, where there is no sandbox to start. */
export interface RunDeps {
  start(s: SandboxStart): Promise<Transport>;
}
let real: RunDeps = { start: (s) => startSandbox(s) };
/** Tests swap in a stand-in for the sandbox (there are no frames or workers in Node); null puts the real one back. */
export function setRunDepsForTests(d: RunDeps | null): void {
  real = d ?? { start: (s) => startSandbox(s) };
}

export const STUCK_MESSAGE = (seconds: number) => `It ran for more than ${seconds} seconds without finishing, so Frameling stopped it. If it is meant to take a while, call frameling.progress(done, total) now and then to say how far it has got.`;

/** The powers a script has. They are the plugin powers, so a script that becomes a plugin asks for just these. */
export const SCRIPT_POWERS = ['document.read', 'document.edit', 'app'] as const;

function manifestFor(s: Pick<Script, 'id' | 'name'>): PluginManifest {
  return { id: pluginIdOf(s.id), name: s.name, version: '1.0.0', description: '', author: '', main: 'main.js', permissions: [...SCRIPT_POWERS], network: [], apiVersion: 2, events: [], exporterOptions: {} };
}

/** What the host does for a script: the same as for a plugin, with the Undo grouping done by the run around it. */
function hooksFor(name: string, h: { problem(m: string, loading: boolean, line?: number): void; loaded(): void; watchdog(): void; printed(l: PrintedLine): void }): HostHooks {
  return {
    getDoc: () => withoutNotes(rootDoc(store().rootDoc())),
    getState: () => {
      const { doc, ui } = store().get();
      const layer = findLayer(doc, ui.activeLayerId);
      return { frame: ui.frame, activeLayerId: ui.activeLayerId, selection: [...ui.selection], drawingId: layer ? (drawingAt(doc, layer, ui.frame)?.id ?? null) : null };
    },
    edit: (label, ops) => {
      const s = store().get();
      if (store().nestedTag() || s.doc.editing?.length) throw new Error('Close the symbol or tile being edited first, then try again.');
      store().update(label ? `${name}: ${label}` : name, (d) => applyOps(d, ops));
    },
    notify: (message, kind) => notify(`${name}: ${message}`, kind),
    // A script is one run, not something that stays: it adds no commands, exports or panels.
    addCommand: () => undefined,
    addExporter: () => undefined,
    addPanel: () => undefined,
    updatePanel: () => undefined,
    problem: h.problem,
    loaded: h.loaded,
    watchdog: () => h.watchdog(),
    printed: (level, text) => h.printed({ level, text }),
    appCommands,
    appRun,
    appSet,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Starts a script and hands back a way to stop it. Never throws: a script that could not start is an outcome too. */
export function startRun(script: Pick<Script, 'id' | 'name' | 'code'>, deps: RunDeps = real, opts: { onPrint?: (l: PrintedLine) => void } = {}): ScriptRun {
  const t0 = Date.now();
  const printed: PrintedLine[] = [];
  let stopRequested = false;
  let stuckFor = 0;
  let rt: PluginRuntime | null = null;
  const fail = (message: string, ended?: 'stopped' | 'stuck', line?: number): RunOutcome => ({ ok: false, message, ...(line ? { line } : {}), ...(ended ? { ended } : {}), changes: 0, ms: Date.now() - t0, printed });

  if (running.get()) {
    return { id: script.id, stop: () => undefined, done: Promise.resolve(fail(`"${running.get()!.name}" is still running. Stop it first, or wait for it to finish.`)) };
  }
  running.set({ id: script.id, name: script.name });
  const mark = store().startGroup();
  const problems: { message: string; line?: number }[] = [];
  let onLoaded: () => void = () => undefined;
  let onLoadFailed: (m: { message: string; line?: number }) => void = () => undefined;
  const loaded = new Promise<{ message: string; line?: number } | null>((resolve) => {
    onLoaded = () => resolve(null);
    onLoadFailed = (m) => resolve(m);
  });

  const hooks = hooksFor(script.name, {
    problem: (message, loading, line) => (loading ? onLoadFailed({ message, line }) : void problems.push({ message, line })),
    loaded: () => onLoaded(),
    watchdog: () => {
      stuckFor = Math.max(1, Math.round(WATCHDOG.scriptStuckMs / 1000));
      rt?.stop();
    },
    printed: (l) => {
      if (printed.length < 500) printed.push(l);
      opts.onPrint?.(l);
    },
  });

  const done = (async (): Promise<RunOutcome> => {
    let transport: Transport | null = null;
    try {
      const m = manifestFor(script);
      transport = await deps.start({ code: wrapScript(script.name, script.code), plugin: { id: m.id, name: m.name, version: m.version }, network: [] });
      if (stopRequested) {
        transport.close();
        store().abortGroup(mark);
        return fail('Stopped. Nothing was changed.', 'stopped');
      }
      rt = new PluginRuntime(m, [...SCRIPT_POWERS], transport, hooks, { script: true });
      const loadProblem = await Promise.race([loaded, sleep(10_000).then((): { message: string; line?: number } => ({ message: 'The script did not start.' }))]);
      if (loadProblem) return finish(fail(loadProblem.message, undefined, loadProblem.line));
      const r = await rt.runScriptCommand('run');
      if (stuckFor) return finish(fail(STUCK_MESSAGE(stuckFor), 'stuck'));
      if (stopRequested) return finish(fail('Stopped.', 'stopped'));
      if (!r.ok) return finish(fail(r.message, undefined, r.line));
      // Calls it did not wait for (a forgotten `await`) must land inside this run, and may still turn out to fail.
      for (let i = 0; i < 100 && rt.calling > 0; i++) await sleep(20);
      await sleep(20);
      if (stuckFor) return finish(fail(STUCK_MESSAGE(stuckFor), 'stuck'));
      if (problems.length) return finish(fail(problems[0].message, undefined, problems[0].line));
      return finish({ ok: true, changes: 0, ms: Date.now() - t0, printed });
    } catch (e) {
      return finish(fail(e instanceof Error ? e.message : 'The script could not run.'));
    }

    // Ends the group: one Undo step for a run that worked, nothing at all for one that did not.
    function finish(o: RunOutcome): RunOutcome {
      rt?.stop();
      transport?.close();
      if (o.ok) {
        const n = store().endGroup(mark, `Script: ${script.name}`);
        return { ...o, changes: n };
      }
      const n = store().abortGroup(mark);
      return n ? { ...o, message: `${o.message} Your drawing is back how it was.` } : o;
    }
  })().finally(() => running.set(null));

  return {
    id: script.id,
    stop: () => {
      stopRequested = true;
      rt?.stop();
    },
    done,
  };
}
