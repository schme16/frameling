// Wires one engine to the real app: the store, the command registry, the clock and the DOM. This is the only place
// that knows quests are playing in a window.
import { setChoiceDeferral } from '../core/choices';
import { allCommands } from '../core/registry';
import { store } from '../core/store';
import { getPrefs, reducedMotion } from '../ui/prefs';
import { runCommandById } from './actions';
import { QuestEngine, type StateSource } from './engine';
import { celebrate, clearPraise, dismissCelebration, praise } from './feedback';
import { playCue } from '../ui/sounds';
import { watchCommands, type CommandWatch } from './hook';
import { readProbe } from './probe';
import { localStorageOrNull } from './saved';
import { getFullQuest, questProgress, setStarter, setStopper } from './registry';
import { PIXEL_QUESTS } from '../pixel/quests-ways';

const source: StateSource = {
  get: () => store().get(),
  subscribe: (fn) => store().subscribe(fn),
  undoLabel: () => store().undoLabel(),
  canRedo: () => store().canRedo(),
};

export const engine = new QuestEngine({
  source,
  progress: questProgress,
  getQuest: getFullQuest,
  runCommand: runCommandById,
  probe: readProbe,
  storage: localStorageOrNull(),
});

// A lesson is not the moment for a settings question (Tapping Space lands just as it says "Press play").
setChoiceDeferral(() => questProgress.get().active !== null);

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
  // A card from a quest you have left behind would be nonsense, so starting or putting one down clears it.
  if (e.kind === 'start') {
    clearPraise();
    startWatching();
  } else if (e.kind === 'stop') {
    clearPraise();
    stopWatching();
  }
  else if (e.kind === 'step' && !e.skipped) {
    praise(PIXEL_QUESTS.has(e.quest.id), e.step.did);
    playCue('step');
  }
  else if (e.kind === 'finish') {
    stopWatching();
    celebrate(e.quest, e.badge, reducedMotion());
    playCue('celebrate');
  }
});

/** Gets the document ready (asking before anything is thrown away), then starts the quest. Returns false for an unknown quest. */
export function playQuest(id: string): boolean {
  const q = getFullQuest(id);
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
  const q = p && getFullQuest(p.id);
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
