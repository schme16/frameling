import { Icon } from '../ui/icons';
import { runCmd, tip } from '../timeline/cmd';

/** The timeline header's "Sound" button: bring a sound in. */
export function SoundButton() {
  return (
    <span className="tl-group" role="group" aria-label="Sound">
      <button type="button" className="tl-btn" title={tip('audio.import', 'Add a sound: speech, music or effects to line your drawings up with')} aria-label="Add a sound" onClick={() => runCmd('audio.import')}>
        <Icon name="sound" size={16} />
      </button>
    </span>
  );
}
