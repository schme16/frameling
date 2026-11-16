// What stands where the timeline goes on a drawing with no animation: one friendly card with one button. The Animate room
// shows it big; anywhere the Timeline panel is opened by hand shows it too, so the panel is never an empty box.
import './animation.css';
import { Icon } from '../ui/icons';
import { runCommandById } from './run';

export function AddAnimationCard() {
  return (
    <div className="anim-card" data-testid="animation.card" role="region" aria-label="Add animation">
      <Icon name="film" size={28} />
      <div className="anim-card-words">
        <strong>This drawing is a still picture.</strong>
        <span>Add animation to give it frames, a timeline, playback and onion skin. What you have drawn stays as frame 1.</span>
      </div>
      <button type="button" className="ui-btn ui-btn-primary" data-testid="animation.add" onClick={() => runCommandById('animation.add')}>
        Add animation
      </button>
    </div>
  );
}
