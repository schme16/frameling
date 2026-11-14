// Performance: the commands. The page is GpuPage.tsx (Preferences > Performance), the settings are in settings.ts and the
// plain-words reading of what the computer reports is in describe.ts.
import { registerCommand } from '../core/registry';
import { openPrefs } from '../ui/overlays';
import { copyGpuReport } from './copy';
import { getPerf, setPerf } from './settings';
import './help';

registerCommand({
  id: 'view.performance',
  label: 'Performance...',
  category: 'View',
  description: 'See which graphics card Frameling is using, and the settings to try when it feels slow.',
  help: 'performance',
  keywords: ['gpu', 'graphics card', 'hardware acceleration', 'slow', 'lag', 'renderer', 'vram', 'cache', 'memory', 'vulkan', 'opengl', 'software', 'speed', 'fps'],
  global: true,
  run: () => openPrefs('performance'),
});

registerCommand({
  id: 'perf.copyReport',
  label: 'Copy my drawing report',
  category: 'Help',
  description: 'Copy which card Frameling is using, how it draws and your performance settings, to paste into a bug report.',
  help: 'performance',
  keywords: ['gpu', 'bug report', 'graphics', 'driver', 'renderer', 'system info', 'copy'],
  global: true,
  run: () => void copyGpuReport(),
});

registerCommand({
  id: 'perf.quickScrub',
  label: 'Quick scrubbing',
  category: 'Timeline',
  description: 'Leave the onion skins and ghosts out while you drag along the timeline, so it keeps up. They come back when you let go.',
  help: 'performance',
  keywords: ['scrub', 'draft', 'preview quality', 'fast', 'slow', 'lag', 'performance'],
  checked: () => getPerf().scrub === 'quick',
  run: () => setPerf({ scrub: getPerf().scrub === 'quick' ? 'full' : 'quick' }),
});
