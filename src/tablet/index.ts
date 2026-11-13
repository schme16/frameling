// Pen and tablet: commands and help. The settings are in settings.ts, the work is done by the canvas (engine.ts) and the tools.
import { registerCommand } from '../core/registry';
import { store } from '../core/store';
import { openPrefs } from '../ui/overlays';
import './help';
import './check/help';
import { startPenCheck } from './check/state';
import { getPen, PEN_TOOLS, setPenDevice, setToolPen, type PenTool } from './settings';
import { isLinuxDesktop, setPenHost } from './buttons';
import { penStore } from './settings';
import { penTools } from './tool';
import { desktop } from '../io/desktop';

/** Linux hands a pen's buttons and eraser end over differently (see buttons.ts and tool.ts): tell them how. */
export function startPenHost(): void {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const linux = isLinuxDesktop(desktop()?.platform, ua);
  setPenHost({ swapBarrels: linux, userSwap: getPen().pen.swapButtons });
  penTools.enabled = linux;
}
startPenHost();
// Turning "Swap my two pen buttons" on or off takes effect straight away.
penStore.subscribe(() => setPenHost({ userSwap: getPen().pen.swapButtons }));

const currentPenTool = (): PenTool | null => {
  const id = store().get().ui.tool as PenTool;
  return PEN_TOOLS.includes(id) ? id : null;
};

registerCommand({
  id: 'view.penTablet',
  label: 'Pen and tablet...',
  category: 'View',
  description: 'Try your pen, shape its pressure, and choose what its buttons do.',
  help: 'pen-tablet',
  keywords: ['tablet', 'pen', 'stylus', 'wacom', 'huion', 'pressure', 'tilt', 'curve', 'barrel', 'button', 'touch', 'palm'],
  global: true,
  run: () => openPrefs('pen'),
});

registerCommand({
  id: 'pen.eraserEnd',
  label: 'Pen eraser end erases',
  category: 'Tools',
  description: 'Turn on or off switching to the eraser when you flip your pen over.',
  help: 'pen-tablet',
  keywords: ['tablet', 'pen', 'eraser', 'flip', 'stylus'],
  checked: () => getPen().pen.eraserEnd,
  run: () => setPenDevice({ eraserEnd: !getPen().pen.eraserEnd }),
});

registerCommand({
  id: 'pen.stabilizer',
  label: 'Stabilizer for this tool',
  category: 'Tools',
  description: 'Turn the stabilizer on or off for the tool you are using. It steadies a shaky hand.',
  help: 'pen-tablet',
  keywords: ['smooth', 'smoothing', 'lazy', 'steady', 'stabiliser', 'shaky', 'pull string'],
  enabled: () => currentPenTool() !== null,
  checked: () => {
    const t = currentPenTool();
    return !!t && getPen().tools[t].stabilizer > 0;
  },
  run: () => {
    const t = currentPenTool();
    if (t) setToolPen(t, { stabilizer: getPen().tools[t].stabilizer > 0 ? 0 : 40 });
  },
});

registerCommand({
  id: 'pen.check',
  label: 'Check my pen with Quill...',
  category: 'Help',
  description: 'Quill walks you through hover, pressure, tilt and the buttons, then saves a report file of what Frameling saw.',
  help: 'pen-check',
  keywords: ['tablet', 'pen', 'diagnostics', 'wacom', 'huion', 'report', 'test', 'check', 'stylus'],
  global: true,
  run: () => startPenCheck(),
});
