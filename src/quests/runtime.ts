// Wires one engine to the real app: the store, the command registry, the clock and the DOM. This is the only place
// that knows quests are playing in a window.
import { allCommands } from '../core/registry';
import { store } from '../core/store';
import { getPrefs, reducedMotion } from '../ui/prefs';
import { runCommandById } from './actions';
import { QuestEngine, type StateSource } from './engine';
import { celebrate, chime, dismissCelebration, praise } from './feedback';
import { watchCommands, type CommandWatch } from './hook';
import { readProbe } from './probe';
import { getQuest, questProgress, setStarter, setStopper } from './registry';

const source: StateSource = {
  get: () => store().get(),
  subscribe: (fn) => store().subscribe(fn),
  undoLabel: () => store().undoLabel(),
  canRedo: () => store().canRedo(),
};

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const engine = new QuestEngine({
  source,
  progress: questProgress,
  getQuest,
  runCommand: runCommandById,
  probe: readProbe,
  storage: storage(),
});

let timer: ReturnType<typeof setInterval> | null = null;
let watch: CommandWatch | null = null;

function startWatching(): void {
  watch ??= watchCommands((id) => engine.noteCommand(id), allCommands);
  if (!timer) {
    timer = setInterval(() => {
      watch?.refresh();
      engine.tick();
    }, 500);
    (timer as { unref?: () => void }).unref?.();
  }
}

function stopWatching(): void {
  if (timer) clearInterval(timer);
  timer = null;
  watch?.stop();
  watch = null;
}

engine.on((e) => {
  if (e.kind === 'start') startWatching();
  else if (e.kind === 'stop') stopWatching();
  else if (e.kind === 'step' && !e.skipped) praise();
  else if (e.kind === 'finish') {
    stopWatching();
    celebrate(e.quest, e.badge, reducedMotion());
    if (getPrefs().sounds) chime();
  }
});

/** Gets the document ready (asking before anything is thrown away), then starts the quest. Returns false for an unknown quest. */
export function playQuest(id: string): boolean {
  const q = getQuest(id);
  if (!q) return false;
  dismissCelebration();
  // A page that is ready already starts the quest straight away; one that needs swapping may wait on a dialog.
  try {
    const ready = q.prepare ? q.prepare() : true;
    if (typeof ready === 'boolean') {
      if (ready) engine.start(id);
    } else {
      void ready.then((ok) => ok && engine.start(id), () => {});
    }
  } catch {
    return false;
  }
  return true;
}

/** Picks up the quest that was put down. When the open document no longer suits it, starts that quest again from the top. */
export function resumeQuest(): boolean {
  const p = questProgress.get().paused;
  const q = p && getQuest(p.id);
  if (!p || !q) return false;
  dismissCelebration();
  if (!q.ready || q.ready(store().get())) return engine.resume();
  return playQuest(q.id);
}

export function putDownQuest(): void {
  engine.stop();
}

setStarter(playQuest);
setStopper(putDownQuest);
