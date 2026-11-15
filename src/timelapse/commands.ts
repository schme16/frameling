// Timelapse: palette commands, keys and the menu. Start and stop are always on and say so when they have nothing to do,
// rather than going grey.
import { registerCommands } from '../core/registry';
import { registerMenuItems } from '../ui/menus';
import { notify } from '../io/notify';
import { isRecording, pauseRecording, pictureCount, toggleRecording, clearPictures } from './recorder';
import { openTimelapseExport } from './open';

const KEYWORDS = ['time lapse', 'time-lapse', 'record my drawing', 'record the session', 'screen recording', 'stream clip', 'speed painting', 'speedpaint', 'process video', 'drawing video', 'watch me draw', 'record screen', 'start timelapse', 'stop timelapse'];

registerCommands([
  {
    id: 'timelapse.record',
    label: 'Record a timelapse',
    category: 'Export',
    keys: ['Mod+Alt+Shift+R'],
    description: 'Starts keeping small pictures of your drawing as you work, then press it again to stop. A red badge shows the whole time, and nothing is saved in your drawing file.',
    keywords: KEYWORDS,
    help: 'timelapse',
    checked: () => isRecording(),
    run: () => toggleRecording(),
  },
  {
    id: 'timelapse.pause',
    label: 'Pause or carry on the timelapse',
    category: 'Export',
    keys: ['Mod+Alt+Shift+P'],
    description: 'Stops taking pictures for a bit (a private moment, a break), then carries on. What you draw while paused is not in the video.',
    keywords: [...KEYWORDS, 'resume'],
    help: 'timelapse',
    run: () => (isRecording() ? pauseRecording() : notify('No timelapse is recording. Press Record a timelapse to start one.', 'info')),
  },
  {
    id: 'timelapse.export',
    label: 'Make a timelapse video',
    category: 'Export',
    keys: ['Mod+Alt+Shift+V'],
    description: 'Turns the pictures from your timelapse into a short video (MP4, WebM or GIF). You pick how long it should be.',
    keywords: KEYWORDS,
    help: 'timelapse',
    run: () => openTimelapseExport(),
  },
  {
    id: 'timelapse.clear',
    label: 'Throw away the timelapse pictures',
    category: 'Export',
    description: 'Clears the pictures kept from your timelapse, to free the space.',
    keywords: KEYWORDS,
    help: 'timelapse',
    run: async () => {
      if (isRecording()) return void notify('Stop the timelapse first.', 'info');
      const n = pictureCount();
      await clearPictures();
      notify(n ? 'Threw away the timelapse pictures.' : 'There were no timelapse pictures to throw away.', 'info');
    },
  },
]);

registerMenuItems('sub:export', ['heading:Timelapse of a session', 'timelapse.record', 'timelapse.pause', 'timelapse.export', 'timelapse.clear']);
