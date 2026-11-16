// What the remote door does with a request, on the page. Everything it touches is handed in, so the rules are tested
// without a window: the busy check, one Undo step per run, the refusals and the log.
//
// Not the audience gate. A remote caller is not a viewer: it goes through none of the gate's allowances (the "let the
// audience interrupt your drawing" switch, the cooldowns, the queue), and none of the gate's refusals are lifted for it.
// What it may press is the Scripts list (appRules.ts), which has the audience, streaming, settings, files and Undo off it.
import type { AppCommandInfo, AppSet } from '../plugins/appRules';
import type { RemoteAnswer, RemoteAsk, RemoteReason } from '../shared/remoteDoor';
import { busyReason, cleanRun, cleanScript, describeRun, RETRY_MS, summarize, type BusyInput, type DocLike } from './rules';
import { note } from './log';

/** What a script run came to. A slice of the Scripts runner's outcome. */
export interface ScriptResult {
  ok: boolean;
  message?: string;
  line?: number;
  ended?: 'stopped' | 'stuck';
  changes: number;
  ms: number;
  printed: { level: string; text: string }[];
}

export interface DriverDeps {
  commands(): AppCommandInfo[];
  /** Presses one command and waits for it. Throws, in plain words, when it can't. */
  press(id: string): Promise<void>;
  /** Chooses the frame, layer, selection and colours. Throws, in plain words, when it can't. */
  choose(what: AppSet): void;
  /** The Undo grouping (the store's). `end` folds what happened since `start` into one step and says how many it folded. */
  group: { start(): unknown; end(mark: unknown, label: string): number; abort(mark: unknown): number };
  /** True while the door is still open: a run in the middle of its steps stops when it goes shut. */
  isOpen(): boolean;
  busy(): Omit<BusyInput, 'runInProgress'>;
  state(): Record<string, unknown>;
  doc(): DocLike;
  runScript(code: string, name: string): Promise<ScriptResult>;
  /** Lets the pill glow for a moment. */
  touched(): void;
  /** The command's own name, for the log. */
  labelOf(id: string): string | undefined;
}

const ok = (body: Record<string, unknown>): RemoteAnswer => ({ status: 200, body: { ok: true, ...body } });
const no = (status: RemoteAnswer['status'], reason: RemoteReason, message: string, extra: Record<string, unknown> = {}): RemoteAnswer => ({ status, body: { ok: false, reason, message, ...extra } });

export function createDriver(d: DriverDeps) {
  let inProgress = false;

  const busy = () => busyReason({ ...d.busy(), runInProgress: inProgress });
  const busyAnswer = (what: string): RemoteAnswer | null => {
    const b = busy();
    if (!b) return null;
    note(what, 'refused', b.message);
    return no(409, 'busy', b.message, { detail: b.detail, retryInMs: RETRY_MS });
  };

  async function run(body: unknown): Promise<RemoteAnswer> {
    const c = cleanRun(body);
    if (!c.ok) {
      note('A run that could not be read', 'refused', c.message);
      return no(c.reason === 'refused' ? 403 : 400, c.reason, c.message);
    }
    const what = describeRun(c.value.steps, d.labelOf);
    const wait = busyAnswer(what);
    if (wait) return wait;
    inProgress = true;
    d.touched();
    const mark = d.group.start();
    try {
      for (const s of c.value.steps) {
        if (!d.isOpen()) {
          d.group.abort(mark);
          note(what, 'failed', 'The door was closed part way. Everything it had done was taken back.');
          return no(503, 'closed', 'The remote door was closed part way through. Everything it had done was taken back.');
        }
        if ('command' in s) await d.press(s.command);
        else d.choose(s.set);
      }
      const label = c.value.label || (c.value.steps.length === 1 && 'command' in c.value.steps[0] ? (d.labelOf(c.value.steps[0].command) ?? 'run') : 'run');
      const changes = d.group.end(mark, `Remote: ${label}`);
      note(what, 'done');
      return ok({ steps: c.value.steps.length, changes });
    } catch (e) {
      const undone = d.group.abort(mark);
      const message = `${e instanceof Error ? e.message : 'That could not be done.'}${undone ? ' Everything this run had changed was taken back.' : ''}`;
      note(what, 'failed', message);
      return no(422, 'failed', message, { undone });
    } finally {
      inProgress = false;
    }
  }

  async function script(body: unknown): Promise<RemoteAnswer> {
    const c = cleanScript(body);
    if (!c.ok) {
      note('A script that could not be read', 'refused', c.message);
      return no(400, c.reason, c.message);
    }
    const what = `Ran the script "${c.value.name}" (${c.value.code.split('\n').length} lines)`;
    const wait = busyAnswer(what);
    if (wait) return wait;
    inProgress = true;
    d.touched();
    try {
      const r = await d.runScript(c.value.code, c.value.name);
      if (!r.ok) {
        const message = r.message ?? 'The script did not finish.';
        note(what, 'failed', message);
        return no(422, 'failed', message, { ...(r.line ? { line: r.line } : {}), ...(r.ended ? { ended: r.ended } : {}), printed: r.printed });
      }
      note(what, 'done');
      return ok({ changes: r.changes, ms: r.ms, printed: r.printed });
    } finally {
      inProgress = false;
    }
  }

  return {
    async answer(op: RemoteAsk): Promise<RemoteAnswer> {
      switch (op.op) {
        case 'hello':
          return ok({ app: 'frameling', door: 'remote', version: 1, reaches: ['commands', 'choices', 'scripts', 'state', 'document summary'], busy: busy()?.detail ?? null });
        case 'state':
          return ok({ ...d.state(), busy: busy()?.detail ?? null });
        case 'document':
          return ok(summarize(d.doc()));
        case 'commands':
          return ok({ commands: d.commands() });
        case 'run':
          return run(op.body);
        case 'script':
          return script(op.body);
      }
    },
  };
}
