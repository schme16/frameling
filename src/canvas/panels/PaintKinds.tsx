// What the box in front is made of, as one row of named pictures: None, Solid, Linear, Radial, Angular, Diamond, each
// painted in the colour you have now. It is a grid, not a `Choice`: a Choice drops to one button per line when its words
// don't fit (src/ui/fitRow.ts), and six padded words never fit a docked panel, so it used to become a tall list. The tiles
// go six to a line, or three and three in a narrow panel, and never stack one to a line.
import { store, useStore } from '../../core/store';
import { endGradientGesture, setPaintKind, usePaintView, wellIsNone } from '../../tools/gradient-wells';
import { usePaintWells } from '../../tools/pixelWells';
import { noteColorUsed } from '../../tools/recent';
import { activeColor, setActiveColor, setActiveNone } from '../../tools/wells';
import { tilePicture, tilesFor, tileIsOn, type KindChoice } from '../paintKinds';
import { usePaintColour } from './usePaintColour';

/** `inOptions`: in a tool's options the row only shows where there are Fill and Stroke boxes; Paint and Back (the Pixel workspace) have no kinds there. */
// The palette command that does the same job as a tile, so the tile and the command are known to be one (None is the / key).
const COMMANDS: Partial<Record<KindChoice, string>> = { none: 'colors.none', angular: 'colors.angular', diamond: 'colors.diamond' };

export function PaintKinds({ inOptions = false }: { inOptions?: boolean } = {}) {
  const well = useStore((s) => s.ui.activeWell);
  const view = usePaintView(well);
  const colour = usePaintColour();
  const box = useStore((s) => activeColor(s.ui));
  const paintWells = !!usePaintWells();
  if (inOptions && paintWells) return null;
  const none = wellIsNone(view, box);
  const mixed = view.from === 'differ' || view.from === 'colours';
  const g = 'style' in view ? view.style : null;
  const now = { none: !mixed && none, kind: mixed ? ('' as const) : (g?.kind ?? ('solid' as const)) };
  const name = well === 'fill' ? 'Fill' : 'Stroke';
  const tiles = tilesFor(paintWells);
  const choose = (id: KindChoice) => {
    if (id === 'none') return setActiveNone();
    // Solid on a box that has nothing: give it the colour in the picker, which is how a bare side gets one.
    if (id === 'solid' && now.none) {
      setActiveColor(colour);
      noteColorUsed(colour);
      return;
    }
    setPaintKind(store().get().ui.activeWell, id);
    endGradientGesture();
  };
  return (
    <div className="cv-kinds" role="radiogroup" aria-label={`${name}: what it is made of`} data-control="paint-kind" data-well={well} data-count={tiles.length}>
      {tiles.map((t) => {
        const on = tileIsOn(t.id, now);
        return (
          <button key={t.id} type="button" role="radio" aria-checked={on} className="cv-kind" data-on={on} data-command={COMMANDS[t.id]} data-control={t.control} title={t.title} onClick={() => choose(t.id)}>
            <i className="cv-kind-pic" data-none={t.id === 'none'} style={t.id === 'none' ? undefined : { background: tilePicture(t.id, colour) }} aria-hidden="true" />
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
