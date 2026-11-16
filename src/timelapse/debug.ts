// With ?debug in the page address, expose the timelapse so scripts/e2e/timelapse.cjs can drive it in the real app: the
// same start, stop and export the commands use. Never on in normal use.
import { library } from '../platform/library';
import { exportTimelapse } from './export';
import { captureStats, clearPictures, findKept, recorder, setLimitsForTests, startRecording, stopRecording, pauseRecording } from './recorder';
import type { TimelapseFormat } from './plan';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingTimelapse: unknown }).__framelingTimelapse = {
    start: (gapMs?: number) => startRecording({ auto: true, gapMs }),
    stop: () => stopRecording(),
    pause: () => pauseRecording(),
    state: () => recorder.get(),
    stats: () => ({ ...captureStats }),
    kept: async () => (await findKept())?.pictures ?? [],
    clear: () => clearPictures(),
    persistent: () => library.persistent(),
    setLimits: (pictures: number, bytes: number) => setLimitsForTests({ pictures, bytes }),
    export: (format: TimelapseFormat, seconds: number | null) => exportTimelapse({ format, seconds, signal: new AbortController().signal, onProgress: () => undefined }),
  };
}
