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
        <small>Only how you look at it. Your drawing and exports aren't changed. Alt and drag to turn it more.</small>
      </span>
      <button type="button" className="tv-chip-reset" onClick={resetTurn} data-tip={t.angle ? 'Straighten the view' : 'Unflip the view'} data-tip-desc="Put the page back the way it was. Ctrl+Shift+0 does it too.">
        {t.angle ? 'Straighten' : 'Unflip'}
      </button>
    </div>
  );
}
