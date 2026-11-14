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
import '../brushes/debug';
import '../quillpet/debug';
import '../update/debug';
import { uid } from '../core/doc';
import { activeDrawing } from '../tools/edit';
import { store } from '../core/store';
import { guard as saveGuard } from '../io/file';
import { findTemplate } from '../templates';
import * as tiles from '../tiles/debug';
import { allCommands, allHelp, allPanels, allTools, getCommand } from '../core/registry';
import { celebrate, praise } from '../quests/feedback';
import { allQuests, getFullQuest, loadQuests, questProgress, startQuest } from '../quests/registry';
import { getPrefs, setPrefs } from '../ui/prefs';
import { getToolSettings, setToolSettings } from '../tools/settings';
import { considerScreen } from '../ui/screenSize';
import * as screenFit from '../ui/screenFit';
import { crashDialog, crashReport } from '../beta/crashAsk';
import { askSaveInPage } from '../io/saveAsk';
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
import * as lockState from '../ui/lockState';
import { setViewSettings } from '../canvas/viewSettings';
import { pretendReport } from '../gpu/report';
import { setGridLook } from '../canvas/gridView';
import { setLightTableTint } from '../canvas/lightTable';
import { offerTweenAt } from '../timeline/tweenOffer';
import { setTl } from '../timeline/state';
import { getFillOptions, setFillOptions } from '../tools/fill-options';
import { allChoices, askAgain, forgetAnswers } from '../core/choices';

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
    // The paint bucket's options, for its shots and A/Bs.
    fill: { get: getFillOptions, set: setFillOptions },
    // The tool options (pixel brush size and shape, pencil thickness), for the big brush check (scripts/perf/brushsize.cjs).
    toolSettings: { get: getToolSettings, set: setToolSettings },
    // Opens a starter template by id (for shots of a known document).
    template: (id: string) => {
      const t = findTemplate(id);
      if (t) store().load(t.make());
      return !!t;
    },
    tiles,
    // Pretend what the computer reports about its graphics, for the Performance page's shots: pretendReport(report | null).
    gpu: { pretend: pretendReport },
    // Theme and look picks, for shots in a given theme.
    prefs: { get: getPrefs, set: setPrefs },
    // Ask-the-first-time questions, for their shots and the no-wrap check: ask one by id, or forget the answers.
    choices: { ask: askAgain, forget: forgetAnswers, all: () => allChoices().map((c) => c.id) },
    // Quill's interface size offer for a pretend screen (shots, checks): { id, width, height, scaleFactor, workWidth, workHeight }.
    // The small-screen fit: tell it a screen (a harness has no real one), and ask what it decided.
    fit: { consider: (d: Omit<Parameters<typeof screenFit.considerFit>[0], 'windowWidth' | 'windowHeight'>, quiet = true) => screenFit.considerFit({ windowWidth: 1280, windowHeight: 720, ...d }, { quiet }), toggle: screenFit.toggleFit, isCompact: screenFit.isCompact },
    screenOffer: (d: Omit<Parameters<typeof considerScreen>[0], 'windowWidth' | 'windowHeight'>) => void considerScreen({ windowWidth: 1400, windowHeight: 900, ...d }, { force: true }),
    // Quill's offer after a crash, for a pretend crash (shots, checks): 'ask' offers to send, 'tell' only says what happened.
    crashOffer: (mode: 'ask' | 'tell' = 'ask') => {
      const notes = { how: 'killed' as const, startedAt: Date.UTC(2026, 10, 14, 9, 30), version: '1.4.0', platform: 'linux x64', events: [] };
      const env = { appVersion: '1.4.0', platform: 'linux', electron: '45.0.0', screen: { width: 1920, height: 1080 } };
      crashDialog.set({ mode, notes, report: crashReport(notes, env) });
    },
    // Quill's "Save changes?" question, for shots and checks: a drawing with a file (false) or a never-saved one (true).
    saveQuestion: (neverSaved = false) => void askSaveInPage(neverSaved ? 'Untitled' : 'Ball bounce', neverSaved),
    // The timeline's frame width (pixels a frame), for shots of a zoom the slider is too coarse to land on.
    timelineZoom: (cw: number) => setTl({ cw }),
    commands: () => allCommands().map((c) => c.id),
    /** Every help topic with its picture or clip, for the web check that every file is served. */
    help: () => allHelp().map((t) => ({ id: t.id, media: t.media ?? null })),
    // The dock (panels, floating windows, workspaces), for shots and checks.
    dock: { ...dockApi, chrome: dockFloats.setFloatChrome },
    // Quill's lock lesson, for the dialogue shots: pretend a quick slip, then teach it.
    teachLock: (kind: 'tools' | 'panels' = 'tools') => {
      lockState.lastDrag.ms = 120;
      lockState.lastDrag.px = 30;
      return lockState.teachLock(kind, () => dockApi.setLock(kind, true));
    },
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
    // Small states that are hard to reach by hand, so the contact sheet of panels (scripts/panels-sheet.cjs) shows them:
    // one picked text shape, two notes, three named slices on the first pixel layer (picked), and a few edits in the History list.
    seed: {
      notes: () =>
        store().update('Seed notes', (d) => {
          (d.notes ??= []).push(
            { id: uid('n'), x: 120, y: 90, text: 'Make the squash a touch longer.', pin: 'page' },
            { id: uid('n'), x: 300, y: 200, text: 'Shadow should shrink as the ball rises.', pin: 'page' },
          );
        }),
      slices: () => {
        const layer = store().get().doc.layers.find((l) => l.kind === 'pixel');
        if (!layer) return false;
        store().setUi({ activeLayerId: layer.id });
        store().update('Seed slices', (d) => {
          const l = d.layers.find((x) => x.id === layer.id);
          if (l?.kind === 'pixel') l.slices = [{ id: uid('s'), name: 'idle', x: 0, y: 0, w: 16, h: 16 }, { id: uid('s'), name: 'run', x: 16, y: 0, w: 16, h: 16 }, { id: uid('s'), name: 'jump', x: 32, y: 0, w: 16, h: 16 }];
        });
        return true;
      },
      // Picks the first text shape on any layer (the Text panel only shows its controls for one). False when there is none.
      text: () => {
        for (const l of store().get().doc.layers) {
          store().setUi({ activeLayerId: l.id, selection: [] });
          const shape = activeDrawing()?.kind === 'vector' ? (activeDrawing() as { shapes: { id: string; type: string }[] }).shapes.find((x) => x.type === 'text') : undefined;
          if (shape) return void store().setUi({ selection: [shape.id] });
        }
        return false;
      },
      history: () => {
        for (const label of ['Move the ball', 'Squash and stretch', 'Fade the shadow']) store().update(label, (d) => void (d.layers[0].opacity = d.layers[0].opacity === 1 ? 0.9 : 1));
      },
    },
    // Every panel with its name and zone, for the contact sheet of all panels (scripts/panels-sheet.cjs).
    panelList: () => allPanels().map((p) => ({ id: p.id, title: p.title, zone: p.zone })),
    tools: () => allTools().map((t) => t.id),
    showPanel,
    // The right side's layout, for side by side shots: 'inspector' (the real one), 'rail' or 'tabs'.
    rightStyle: (v: RightStyle) => setPrefs({ rightSide: v }),
    themes: () => BUILT_IN_THEMES.map((t) => ({ id: t.id, mode: t.mode })),
    // The weight painting look, for the A/B in brand/ab/weights.
    weightsLook: setWeightsLook,
  };
}
