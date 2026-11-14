// The app shell: top bar, tool strip, docked panels around the canvas, status bar, and the floating things
// (command palette, preferences, help, welcome, tooltips, toasts). The pieces live in src/ui.
import { useEffect, useState } from 'react';
import { CanvasView } from '../canvas/CanvasView';
import { PictureStrip, PixelBar } from '../pixel/PixelBar';
import { CommandPalette } from '../ui/CommandPalette';
import { DockZoneView, Splitter } from '../ui/DockView';
import { syncPanels, takeRailMigrationNote } from '../ui/dock';
import { line } from '../ui/mascot/lines';
import { toast } from '../ui/toast';
import { syncDynamicCommands } from '../ui/dynamic';
import { trackHover } from '../ui/help/context';
import { installKeyboard } from '../ui/keyboard';
import { installRovingKeys } from '../ui/roving';
import { watchFirstDrawing } from '../ui/firstDrawing';
import { startScreenWatch } from '../ui/screenSize';
import { startFitWatch } from '../ui/screenFit';
import { startCrashWatch } from '../beta/crashAsk';
import { CrashOffer } from '../beta/CrashOffer';
import { UpdateOffer } from '../update/UpdateOffer';
import { startUpdateWatch } from '../update/state';
import { installDrawingReset } from '../io/fresh';
import { installSheetCloser, openSheet, overlays, type Overlays } from '../ui/overlays';
import { applyPrefs, getPrefs } from '../ui/prefs';
import { ChoiceDialog } from '../ui/ChoiceDialog';
import { AskDialog } from '../platform/AskDialog';
import { SaveQuestionDialog } from '../io/SaveQuestionDialog';
import { StatusBar } from '../ui/StatusBar';
import { ToastView } from '../ui/ToastView';
import { ToolFloat, ToolSlot } from '../ui/ToolStrip';
import { DockOverlays } from '../ui/DockOverlays';
import { FloatLayer } from '../ui/DockFloats';
import { TooltipLayer } from '../ui/Tooltips';
import { TopBar } from '../ui/TopBar';
import { maybeOnboard } from '../ui/onboarding';
import { lazyComponent, lazyModule, warmLazyParts, type Loader } from '../core/lazy';
import type { ComponentType } from 'react';
import { DockFitWatch } from '../ui/DockFitWatch';

// The big floating things load the first time they open (and in idle time after start-up), not before the first frame.
function whenOpen(isOpen: (o: Overlays) => boolean, load: Loader<ComponentType<object>>, warm = true) {
  const C = lazyComponent(lazyModule(load, { warm }));
  return function Gate() {
    return overlays.use(isOpen) ? <C /> : null;
  };
}
const PrefsModal = whenOpen((o) => !!o.prefs, () => import('../ui/PrefsModal').then((m) => m.PrefsModal));
const HelpWindow = whenOpen((o) => !!o.help, () => import('../ui/HelpBrowser').then((m) => m.HelpWindow));
const WelcomeSheet = whenOpen((o) => !!o.sheet, () => import('../ui/Welcome').then((m) => m.WelcomeSheet));
const OnboardingSheet = whenOpen((o) => !!o.onboarding, () => import('../ui/onboarding/Onboarding').then((m) => m.OnboardingSheet), false);
const PenCheckSheet = whenOpen((o) => !!o.penCheck, () => import('../tablet/check/PenCheck').then((m) => m.PenCheck), false);
const AboutDialog = whenOpen((o) => o.about, () => import('../ui/About').then((m) => m.AboutDialog), false);

let welcomed = false;

export function App() {
  // Everything has registered by now. Place the panels before the first paint so nothing jumps.
  useState(() => {
    applyPrefs();
    syncPanels();
    syncDynamicCommands();
    return 0;
  });

  useEffect(() => {
    const off = [installKeyboard(), installRovingKeys(), trackHover(), installSheetCloser(), installDrawingReset(), watchFirstDrawing()];
    // The first time, Quill's hello comes instead of the welcome sheet.
    if (!welcomed && !maybeOnboard() && getPrefs().showWelcome) openSheet('welcome');
    welcomed = true;
    // Quill offers a better interface size on a very dense screen, and again on a new one the window is dragged to.
    startScreenWatch();
    // A small screen gets a tighter layout, said once in a toast.
    startFitWatch();
    // After a crash, a dazed Quill offers to send the crash notes (once, and only if you say so).
    startCrashWatch();
    // A quiet look for a newer release (when Preferences allows), offered at a calm moment.
    const stopUpdates = startUpdateWatch();
    // Someone who changed the one tool arrangement before workspaces had their own is told where it went, once.
    const kept = takeRailMigrationNote();
    if (kept) toast(line('workspaces.railKept', { workspace: kept }), { kind: 'info', duration: 9000 });
    // The first frame with the canvas drawn and the page free to take input. scripts/perf/startup.cjs reads it.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        performance.mark('frameling:interactive');
        warmLazyParts();
      }),
    );
    return () => {
      off.forEach((f) => f());
      stopUpdates();
    };
  }, []);

  return (
    <div className="ui-app">
      <h1 className="ui-sr-only">Frameling</h1>
      <TopBar />
      <div className="ui-body">
        <ToolSlot at="left" />
        <DockZoneView zone="left" />
        <Splitter zone="left" />
        <div className="ui-center">
          <ToolSlot at="top" />
          <DockZoneView zone="top" />
          <Splitter zone="top" />
          <main className="ui-canvas" aria-label="Drawing canvas" data-help="canvas">
            <PixelBar />
            <CanvasView />
            <PictureStrip />
          </main>
          <Splitter zone="bottom" />
          <DockZoneView zone="bottom" />
          <ToolSlot at="bottom" />
        </div>
        <Splitter zone="right" />
        <DockZoneView zone="right" />
        <ToolSlot at="right" />
      </div>
      <FloatLayer>
        <ToolFloat />
      </FloatLayer>
      <DockOverlays />
      <StatusBar />
      <DockFitWatch />
      <CommandPalette />
      <PrefsModal />
      <ChoiceDialog />
      <CrashOffer />
      <UpdateOffer />
      <AskDialog />
      <SaveQuestionDialog />
      <HelpWindow />
      <WelcomeSheet />
      <OnboardingSheet />
      <PenCheckSheet />
      <AboutDialog />
      <ToastView />
      <TooltipLayer />
    </div>
  );
}
