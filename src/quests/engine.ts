// The quest engine: plays one quest at a time, ticking steps off as the store changes or a command runs. It knows
// nothing about React, the DOM or Electron. Everything it touches comes in through `EngineDeps`, so the tests can
// drive it with a plain Store, a fake clock and an in-memory storage.
import type { State } from '../core/store';
import type { MiniStore } from '../ui/mini';
import { QUESTS_KEY, readSaved, type Saved } from './saved';
import { FRESH_PROGRESS, NO_PROBE, type Probe, type Quest, type QuestEvent, type QuestProgress, type QuestStep, type StepCtx } from './types';

export interface StateSource {
  get(): State;
  subscribe(fn: () => void): () => void;
  /** Label of the newest undo step (the real Store has it). Lets a step ask "did a Fill just happen?". */
  undoLabel?(): string | null;
  /** True after an undo, when the newest label is old news. */
  canRedo?(): boolean;
  /** True when the newest change was only a look at another artboard, so it left no edit behind. */
  lastChangeWasView?(): boolean;
}

export interface EngineDeps {
  source: StateSource;
  progress: MiniStore<QuestProgress>;
  /** Finds a quest by id. */
  getQuest(id: string): Quest | undefined;
  /** Runs a command by id (for "Show me how"). */
  runCommand?(id: string): void;
  probe?(): Probe;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?(): number;
}

export { QUESTS_KEY };
export const DEFAULT_HINT_AFTER = 20;

interface Run {
  quest: Quest;
  index: number;
  entry: { state: State; probe: Probe };
  startedAt: number;
  lastActivity: number;
  ran: Set<string>;
  edits: string[];
  frames: Set<number>;
  probeKey: string;
  /**
   * Whether this step may finish. A step you went **back** to starts unarmed: if what it asks for is already true
   * (the brush is still picked), it waits until that stops being true, so you can really do it again.
   */
  armed: boolean;
}

export class QuestEngine {
  private run: Run | null = null;
  private last: State;
  private off: (() => void) | null = null;
  private listeners = new Set<(e: QuestEvent) => void>();
  private entering = false;
  private checking = false;
  private again = false;

  constructor(private deps: EngineDeps) {
    this.last = deps.source.get();
    const saved = this.load();
    deps.progress.set({ ...FRESH_PROGRESS, ...saved });
  }

  // ---------------------------------------------------------------- reading

  get progress(): MiniStore<QuestProgress> {
    return this.deps.progress;
  }

  /** The quest, step and step number being played, or null. */
  current(): { quest: Quest; step: QuestStep; index: number } | null {
    return this.run ? { quest: this.run.quest, step: this.run.quest.steps[this.run.index], index: this.run.index } : null;
  }

  on(fn: (e: QuestEvent) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  // ---------------------------------------------------------------- playing

  /** Begins a quest at a step (the first by default). Replaces any quest already running. */
  start(id: string, opts: { step?: number } = {}): boolean {
    const quest = this.deps.getQuest(id);
    if (!quest || !quest.steps.length) return false;
    const index = Math.max(0, Math.min(opts.step ?? 0, quest.steps.length - 1));
    this.attach();
    this.patch((p) => ({
      ...p,
      active: id,
      step: index,
      paused: null,
      hint: false,
      done: { ...p.done, [id]: index === 0 ? [] : (p.done[id] ?? []).slice(0, index) },
    }));
    this.emit({ kind: 'start', quest });
    this.begin(quest, index);
    this.check();
    return true;
  }

  /** Puts the quest down, remembering where it was so `resume` can pick it up. */
  stop(): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    this.detach();
    this.patch((p) => ({ ...p, active: null, paused: { id: r.quest.id, step: r.index }, hint: false }));
    this.emit({ kind: 'stop', quest: r.quest });
  }

  /** Goes back to a quest that was put down. False when there isn't one. */
  resume(): boolean {
    const p = this.deps.progress.get().paused;
    if (!p) return false;
    return this.start(p.id, { step: p.step });
  }

  /** Counts the current step as done without it being done. On the last step it just ends the quest, with no badge. */
  skip(): void {
    const r = this.run;
    if (!r) return;
    if (r.index >= r.quest.steps.length - 1) {
      this.stop();
      this.patch((p) => ({ ...p, paused: null }));
      return;
    }
    this.finishStep(true);
    this.check();
  }

  /**
   * Goes back one step to try it again. The step you land on counts as not done, and its "how things stood" snapshot
   * is taken fresh, so doing the action moves you on by itself exactly as it did the first time.
   */
  back(): boolean {
    const r = this.run;
    if (!r || r.index === 0) return false;
    const { quest } = r;
    const index = r.index - 1;
    const step = quest.steps[index];
    this.patch((p) => ({ ...p, step: index, hint: false, done: { ...p.done, [quest.id]: (p.done[quest.id] ?? []).filter((id) => id !== step.id) } }));
    this.begin(quest, index);
    if (this.run) this.run.armed = false;
    this.check();
    return true;
  }

  /** "Next" for a step with no check of its own. */
  next(): void {
    if (this.run && !this.run.quest.steps[this.run.index].done) this.finishStep(false);
    this.check();
  }

  /** "Show me how": runs the step's command or function. */
  async showMe(): Promise<void> {
    const r = this.run;
    const show = r?.quest.steps[r.index].show;
    if (!r || !show) return;
    this.touch();
    if (typeof show === 'string') this.deps.runCommand?.(show);
    else await show();
    this.check();
  }

  /** A command ran (the runtime's hook calls this). */
  noteCommand(id: string): void {
    const r = this.run;
    if (!r) return;
    r.ran.add(id);
    this.touch();
    this.check();
  }

  /** Called every second or so: notices things that aren't in the store (the export dialog), and the quiet hint. */
  tick(): void {
    const r = this.run;
    if (!r) return;
    const probe = this.probe();
    const key = JSON.stringify(probe);
    if (key !== r.probeKey) {
      r.probeKey = key;
      this.touch();
    }
    this.check();
    const cur = this.run;
    if (!cur) return;
    const step = cur.quest.steps[cur.index];
    const wait = (step.hintAfter ?? DEFAULT_HINT_AFTER) * 1000;
    const quiet = !!step.hint && this.now() - cur.lastActivity >= wait;
    if (quiet !== this.deps.progress.get().hint) this.patch((p) => ({ ...p, hint: quiet }));
  }

  /** Forgets every badge and finished quest. */
  resetAll(): void {
    this.stop();
    this.patch(() => ({ ...FRESH_PROGRESS }));
  }

  dispose(): void {
    this.run = null;
    this.detach();
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- inside

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private probe(): Probe {
    try {
      return this.deps.probe?.() ?? NO_PROBE;
    } catch {
      return NO_PROBE;
    }
  }

  private emit(e: QuestEvent): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(e);
      } catch {
        // A cheer that fails to draw must not stop the quest.
      }
    }
  }

  private attach(): void {
    if (this.off) return;
    this.last = this.deps.source.get();
    this.off = this.deps.source.subscribe(() => this.onState());
  }

  private detach(): void {
    this.off?.();
    this.off = null;
  }

  private begin(quest: Quest, index: number): void {
    const step = quest.steps[index];
    // The step's own set-up (turning onion skin on) happens before we take the "how things stood" snapshot, so it
    // never counts as the person's progress.
    this.run = null;
    this.entering = true;
    try {
      step.enter?.();
    } catch {
      // A step that can't set itself up still works: the person just does it by hand.
    }
    this.entering = false;
    const state = this.deps.source.get();
    this.last = state;
    const probe = this.probe();
    const t = this.now();
    this.run = {
      quest,
      index,
      entry: { state, probe },
      startedAt: t,
      lastActivity: t,
      ran: new Set(),
      edits: [],
      frames: new Set([state.ui.frame]),
      probeKey: JSON.stringify(probe),
      armed: true,
    };
    if (this.deps.progress.get().hint) this.patch((p) => ({ ...p, hint: false }));
    this.patch((p) => ({ ...p, step: index }));
  }

  private touch(): void {
    if (!this.run) return;
    this.run.lastActivity = this.now();
    if (this.deps.progress.get().hint) this.patch((p) => ({ ...p, hint: false }));
  }

  private onState(): void {
    if (this.entering) return;
    const state = this.deps.source.get();
    const prev = this.last;
    this.last = state;
    const r = this.run;
    if (!r || state === prev) return;
    r.frames.add(state.ui.frame);
    // A new edit (not an undo or redo coming back round) leaves its label on top of the undo stack.
    if (state.doc !== prev.doc && !this.deps.source.canRedo?.() && !this.deps.source.lastChangeWasView?.()) r.edits.push(this.deps.source.undoLabel?.() ?? '');
    this.touch();
    this.check(prev);
  }

  private ctx(r: Run, prev: State): StepCtx {
    const state = this.deps.source.get();
    return { state, prev, entry: r.entry, probe: this.probe(), ran: r.ran, edits: r.edits, frames: r.frames, elapsed: this.now() - r.startedAt };
  }

  /** Looks at the current step, and carries on down the list while each one turns out to be done already. */
  private check(prev?: State): void {
    if (this.checking) {
      this.again = true;
      return;
    }
    this.checking = true;
    try {
      let guard = 0;
      do {
        this.again = false;
        while (this.run && guard++ < 50) {
          const r = this.run;
          const step = r.quest.steps[r.index];
          let ok = false;
          try {
            ok = !!step.done?.(this.ctx(r, prev ?? this.deps.source.get()));
          } catch {
            ok = false;
          }
          if (!ok) {
            // What the step asks for is not true now, so doing it from here counts.
            r.armed = true;
            break;
          }
          if (!r.armed) break;
          this.finishStep(false);
        }
      } while (this.again && this.run);
    } finally {
      this.checking = false;
    }
  }

  private finishStep(skipped: boolean): void {
    const r = this.run;
    if (!r) return;
    const { quest, index } = r;
    const step = quest.steps[index];
    if (!skipped) this.patch((p) => ({ ...p, done: { ...p.done, [quest.id]: [...new Set([...(p.done[quest.id] ?? []), step.id])] } }));
    this.emit({ kind: 'step', quest, step, index, skipped });
    if (index + 1 < quest.steps.length) return this.begin(quest, index + 1);
    // That was the last one.
    this.run = null;
    this.detach();
    const badge = quest.badge ?? null;
    this.patch((p) => ({
      ...p,
      active: null,
      paused: null,
      hint: false,
      completed: p.completed.includes(quest.id) ? p.completed : [...p.completed, quest.id],
      badges: badge && !p.badges.includes(badge.id) ? [...p.badges, badge.id] : p.badges,
    }));
    this.emit({ kind: 'finish', quest, badge });
  }

  // ---------------------------------------------------------------- saving

  private patch(fn: (p: QuestProgress) => QuestProgress): void {
    this.deps.progress.set(fn(this.deps.progress.get()));
    this.save();
  }

  private load(): Saved | null {
    return readSaved(this.deps.storage);
  }

  private save(): void {
    try {
      const p = this.deps.progress.get();
      const paused = p.active ? { id: p.active, step: p.step } : p.paused;
      this.deps.storage?.setItem(QUESTS_KEY, JSON.stringify({ v: 1, completed: p.completed, badges: p.badges, paused }));
    } catch {
      // Storage is full or missing. The quest still plays; it just won't be remembered.
    }
  }
}
