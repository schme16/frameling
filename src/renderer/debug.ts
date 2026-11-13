// With ?debug in the page address (the screenshot script and local checks use it), expose the store so a test can
// read and drive state. Never on in normal use. main.tsx only loads this (and the areas' own debug hooks below) when
// ?debug is there, so none of it is in the normal start-up download.
import '../export/debug';
import '../io/debug';
import '../effects/debug';
import '../templates/debug';
import '../plugins/debug';
import '../features/debug';
import '../artboards/debug';
import '../pixel/debug';
import '../quillpet/debug';
import { store } from '../core/store';
import { guard as saveGuard } from '../io/file';
import { findTemplate } from '../templates';
import * as tiles from '../tiles/debug';
import { allCommands, allHelp, allPanels, allTools, getCommand } from '../core/registry';
import { celebrate, praise } from '../quests/feedback';
import { allQuests, getFullQuest, loadQuests, questProgress, startQuest } from '../quests/registry';
import { getPrefs, setPrefs } from '../ui/prefs';
import { considerScreen } from '../ui/screenSize';
import { crashDialog, crashReport } from '../beta/crashAsk';
import { quillSheet, setQuillSheet, tick as quillTick } from '../ui/mascot/runtime';
import { setWeightsLook } from '../rig/weightsTool';
import { setShowQuill } from '../ui/mascot/goodbye';
import { closeSheet, openHelp, openPrefs, overlays } from '../ui/overlays';
import { getPen, resetPen, setPenDevice, setToolPen, setTouch } from '../tablet/settings';
import { penTools } from '../tablet/tool';
import { showPanel } from '../ui/dock';
import * as dockApi from '../ui/dock';
import * as dockFloats from '../ui/DockFloats';
import type { RightStyle } from '../ui/rightStyle';
import { BUILT_IN_THEMES } from '../ui/themes/builtIn';
import { toast } from '../ui/toast';
import { recovery } from '../io/recovery';
import { setViewSettings } from '../canvas/viewSettings';
import { setGridLook } from '../canvas/gridView';
import { setLightTableTint } from '../canvas/lightTable';
import { offerTweenAt } from '../timeline/tweenOffer';

if (new URLSearchParams(location.search).has('debug')) {
  // Saving keeps each vector drawing's text; in the harnesses such a drawing is frozen so a write in place throws.
  // Perf runs add &nofreeze to measure the normal path.
  saveGuard.freeze = !new URLSearchParams(location.search).has('nofreeze');
  (window as unknown as { __frameling: unknown }).__frameling = {
    store,
    run: (id: string) => getCommand(id)?.run(),
    // Grids, light table and the tween offer, for their help shots and A/Bs.
    anim: {
      view: setViewSettings,
      gridLook: setGridLook,
      lightTableTint: setLightTableTint,
      offerTween: (layerName: string, frame: number) => {
        const { doc } = store().get();
        const layer = doc.layers.find((l) => l.name === layerName);
        if (layer) store().setUi({ activeLayerId: layer.id, frame });
        return layer ? !!offerTweenAt(store().get().doc, layer, frame) : false;
      },
    },
    // Opens a starter template by id (for shots of a known document).
    template: (id: string) => {
      const t = findTemplate(id);
      if (t) store().load(t.make());
      return !!t;
    },
    tiles,
    // Theme and look picks, for shots in a given theme.
    prefs: { get: getPrefs, set: setPrefs },
    // Quill's interface size offer for a pretend screen (shots, checks): { id, width, height, scaleFactor, workWidth, workHeight }.
    screenOffer: (d: Omit<Parameters<typeof considerScreen>[0], 'windowWidth' | 'windowHeight'>) => void considerScreen({ windowWidth: 1400, windowHeight: 900, ...d }, { force: true }),
    // Quill's offer after a crash, for a pretend crash (shots, checks): 'ask' offers to send, 'tell' only says what happened.
    crashOffer: (mode: 'ask' | 'tell' = 'ask') => {
      const notes = { how: 'killed' as const, startedAt: Date.UTC(2026, 10, 14, 9, 30), version: '1.4.0', platform: 'linux x64', events: [] };
      const env = { appVersion: '1.4.0', platform: 'linux', electron: '45.0.0', screen: { width: 1920, height: 1080 } };
      crashDialog.set({ mode, notes, report: crashReport(notes, env) });
    },
    commands: () => allCommands().map((c) => c.id),
    /** Every help topic with its picture or clip, for the web check that every file is served. */
    help: () => allHelp().map((t) => ({ id: t.id, media: t.media ?? null })),
    // The dock (panels, floating windows, workspaces), for shots and checks.
    dock: { ...dockApi, chrome: dockFloats.setFloatChrome },
    // Swap in another Quill sheet (a placeholder, or art being tried out) without a rebuild.
    quests: {
      start: startQuest,
      // The dialogue shots also want the card for a quest with no badge, or no finish line of its own.
      celebrate: async (id: string, o: { noBadge?: boolean; noFinish?: boolean } = {}) => {
        await loadQuests();
        const q = getFullQuest(id);
        if (q) celebrate(o.noFinish ? { ...q, finish: undefined } : q, o.noBadge ? null : (q.badge ?? null), false, 60_000);
      },
      praise,
      progress: questProgress,
      all: () => allQuests().map((q) => q.id),
    },
    quill: { sheet: () => quillSheet.get(), setSheet: setQuillSheet, tick: quillTick, setShown: setShowQuill },
    toast,
    // Work found after a crash, for shots of the welcome sheet's recovery card.
    recovery,
    overlays: { openHelp, openPrefs, closeSheet, state: overlays },
    // Pen and tablet settings, for the pen check (scripts/e2e/pen.cjs).
    pen: { get: getPen, setTool: setToolPen, setDevice: setPenDevice, setTouch, reset: resetPen, forgetTools: () => penTools.reset() },
    // The accessibility check (scripts/a11y.cjs) opens every panel and picks every tool.
    panels: () => allPanels().map((p) => p.id),
    tools: () => allTools().map((t) => t.id),
    showPanel,
    // The right side's layout, for side by side shots: 'inspector' (the real one), 'rail' or 'tabs'.
    rightStyle: (v: RightStyle) => setPrefs({ rightSide: v }),
    themes: () => BUILT_IN_THEMES.map((t) => ({ id: t.id, mode: t.mode })),
    // The weight painting look, for the A/B in brand/ab/weights.
    weightsLook: setWeightsLook,
  };
}
