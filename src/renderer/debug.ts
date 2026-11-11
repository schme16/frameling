// With ?debug in the page address (the screenshot script and local checks use it), expose the store so a test can
// read and drive state. Never on in normal use. main.tsx only loads this (and the areas' own debug hooks below) when
// ?debug is there, so none of it is in the normal start-up download.
import '../export/debug';
import '../io/debug';
import '../effects/debug';
import '../templates/debug';
import '../plugins/debug';
import { store } from '../core/store';
import { findTemplate } from '../templates';
import * as tiles from '../tiles/debug';
import { allCommands, allPanels, allTools, getCommand } from '../core/registry';
import { celebrate, praise } from '../quests/feedback';
import { allQuests, getQuest, questProgress, startQuest } from '../quests/registry';
import { getPrefs, setPrefs } from '../ui/prefs';
import { quillSheet, setQuillSheet, tick as quillTick } from '../ui/mascot/runtime';
import { setWeightsLook } from '../rig/weightsTool';
import { setShowQuill } from '../ui/mascot/goodbye';
import { closeSheet, openHelp, openPrefs, overlays } from '../ui/overlays';
import { showPanel } from '../ui/dock';
import { BUILT_IN_THEMES } from '../ui/themes/builtIn';
import { toast } from '../ui/toast';
import { recovery } from '../io/recovery';
import { setViewSettings } from '../canvas/viewSettings';
import { setGridLook } from '../canvas/gridView';
import { setLightTableTint } from '../canvas/lightTable';
import { offerTweenAt } from '../timeline/tweenOffer';

if (new URLSearchParams(location.search).has('debug')) {
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
    commands: () => allCommands().map((c) => c.id),
    // Swap in another Quill sheet (a placeholder, or art being tried out) without a rebuild.
    quests: {
      start: startQuest,
      // The dialogue shots also want the card for a quest with no badge, or no finish line of its own.
      celebrate: (id: string, o: { noBadge?: boolean; noFinish?: boolean } = {}) => {
        const q = getQuest(id);
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
    // The accessibility check (scripts/a11y.cjs) opens every panel and picks every tool.
    panels: () => allPanels().map((p) => p.id),
    tools: () => allTools().map((t) => t.id),
    showPanel,
    themes: () => BUILT_IN_THEMES.map((t) => ({ id: t.id, mode: t.mode })),
    // The weight painting look, for the A/B in brand/ab/weights.
    weightsLook: setWeightsLook,
  };
}
