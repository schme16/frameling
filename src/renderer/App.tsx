// The app shell: top bar, tool strip, docked panels around the canvas, status bar, and the floating things
// (command palette, preferences, help, welcome, tooltips, toasts). The pieces live in src/ui.
import { useEffect, useState } from 'react';
import { CanvasView } from '../canvas/CanvasView';
import { CommandPalette } from '../ui/CommandPalette';
import { DockZoneView, Splitter } from '../ui/DockView';
import { syncPanels } from '../ui/dock';
import { syncDynamicCommands } from '../ui/dynamic';
import { HelpWindow } from '../ui/HelpBrowser';
import { trackHover } from '../ui/help/context';
import { installKeyboard } from '../ui/keyboard';
import { openSheet } from '../ui/overlays';
import { applyPrefs, getPrefs } from '../ui/prefs';
import { PrefsModal } from '../ui/PrefsModal';
import { ChoiceDialog } from '../ui/ChoiceDialog';
import { StatusBar } from '../ui/StatusBar';
import { ToastView } from '../ui/ToastView';
import { ToolStrip } from '../ui/ToolStrip';
import { TooltipLayer } from '../ui/Tooltips';
import { TopBar } from '../ui/TopBar';
import { WelcomeSheet } from '../ui/Welcome';

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
    const off = [installKeyboard(), trackHover()];
    if (!welcomed && getPrefs().showWelcome) openSheet('welcome');
    welcomed = true;
    return () => off.forEach((f) => f());
  }, []);

  return (
    <div className="ui-app">
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
      <HelpWindow />
      <WelcomeSheet />
      <ToastView />
      <TooltipLayer />
    </div>
  );
}
