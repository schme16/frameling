// The note that sits on the canvas while the view is turned or flipped, so nobody mistakes a mirror for the drawing.
import { Icon } from '../ui/icons';
import { describeTurn, isTurned, resetTurn, useTurn } from './turn';

export function TurnChip() {
  const t = useTurn();
  if (!isTurned(t)) return null;
  return (
    <div className="tv-chip" role="status" aria-label={`The view is ${describeTurn(t)}. Your drawing is not changed.`}>
      <Icon name={t.flip ? 'mirror' : 'rotate'} size={14} />
      <span>
        View {describeTurn(t)}
        <small>Only how you look at it. Your drawing and exports aren't changed.</small>
      </span>
      <button type="button" className="tv-chip-reset" onClick={resetTurn} data-tip="Reset view" data-tip-desc="Turn it back to straight.">
        Reset
      </button>
    </div>
  );
}
