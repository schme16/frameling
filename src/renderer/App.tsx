// The app shell: top bar, tool strip, docked panels around the canvas, status bar, and the floating things
// (command palette, preferences, help, welcome, tooltips, toasts). The pieces live in src/ui.
import { useEffect, useState } from 'react';
import { CanvasView } from '../canvas/CanvasView';
import { CommandPalette } from '../ui/CommandPalette';
import { DockZoneView, Splitter } from '../ui/DockView';
import { syncPanels } from '../ui/dock';
import { syncDynamicCommands } from '../ui/dynamic';
import { trackHover } from '../ui/help/context';
import { installKeyboard } from '../ui/keyboard';
import { installRovingKeys } from '../ui/roving';
import { openSheet, overlays, type Overlays } from '../ui/overlays';
import { applyPrefs, getPrefs } from '../ui/prefs';
import { ChoiceDialog } from '../ui/ChoiceDialog';
import { AskDialog } from '../platform/AskDialog';
import { StatusBar } from '../ui/StatusBar';
import { ToastView } from '../ui/ToastView';
import { ToolStrip } from '../ui/ToolStrip';
import { TooltipLayer } from '../ui/Tooltips';
import { TopBar } from '../ui/TopBar';
import { maybeOnboard } from '../ui/onboarding';
import { lazyComponent, lazyModule, warmLazyParts, type Loader } from '../core/lazy';
import type { ComponentType } from 'react';

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
    const off = [installKeyboard(), installRovingKeys(), trackHover()];
    // The first time, Quill's hello comes instead of the welcome sheet.
    if (!welcomed && !maybeOnboard() && getPrefs().showWelcome) openSheet('welcome');
    welcomed = true;
    // The first frame with the canvas drawn and the page free to take input. scripts/perf/startup.cjs reads it.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        performance.mark('frameling:interactive');
        warmLazyParts();
      }),
    );
    return () => off.forEach((f) => f());
  }, []);

  return (
    <div className="ui-app">
      <h1 className="ui-sr-only">Frameling</h1>
      <TopBar />
      <div className="ui-body">
        <ToolStrip />
        <DockZoneView zone="left" />
        <Splitter zone="left" />
        <div className="ui-center">
          <main className="ui-canvas" aria-label="Drawing canvas" data-help="canvas">
            <CanvasView />
          </main>
          <Splitter zone="bottom" />
          <DockZoneView zone="bottom" />
        </div>
        <Splitter zone="right" />
        <DockZoneView zone="right" />
      </div>
      <StatusBar />
      <CommandPalette />
      <PrefsModal />
      <ChoiceDialog />
      <AskDialog />
      <HelpWindow />
      <WelcomeSheet />
      <OnboardingSheet />
      <AboutDialog />
      <ToastView />
      <TooltipLayer />
    </div>
  );
}
