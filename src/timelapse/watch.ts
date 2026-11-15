// Two small jobs at start up: find pictures left by an earlier run (so the menu can offer them), and start a timelapse
// when a drawing opens if that is switched on in Preferences > Behaviour (off until someone turns it on).
import { currentChoice } from '../core/choices';
import { store } from '../core/store';
import { notify } from '../io/notify';
import { isRecording, lookForWaiting, startRecording } from './recorder';

let started = false;

export function watchTimelapse(): void {
  if (started) return;
  started = true;
  void lookForWaiting();
  const maybeStart = (): void => {
    if (currentChoice<string>('timelapse.autoStart') !== 'on' || isRecording()) return;
    void startRecording({ auto: true }).then((ok) => ok && notify('Recording a timelapse. Press Stop on the red badge when you are done. Change this in Preferences > Behaviour.', 'info'));
  };
  store().onLoad(maybeStart);
  // The drawing that is already open when the app starts.
  window.setTimeout(maybeStart, 1500);
}

watchTimelapse();
