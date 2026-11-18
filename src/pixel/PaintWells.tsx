// Paint and Back: the two big colour wells at the top of the Palette in the Pixel workspace. Paint is in front, Back
// is behind. A click on a well opens the colour picker for it; X swaps them; a swatch click sets Paint.
import { useEffect, useRef, useState } from 'react';
import { store, useStore } from '../core/store';
import { swapPaintBack } from '../tools/wells';
import { SwapArrow } from '../canvas/panels/WellCorners';
import { ColourField } from '../ui/colour/ColourPicker';
import { usePaintRules } from './colourRules';
import './pixel.css';

function Well({ which, color }: { which: 'paint' | 'back'; color: string | null }) {
  const name = which === 'paint' ? 'Paint' : 'Back';
  const rules = usePaintRules();
  return (
    <ColourField
      className={`px-well px-well-${which}${color ? '' : ' is-none'}`}
      label={`${name} colour`}
      title={`${name} colour: ${color ?? 'none'}. Click to pick another.`}
      value={color ?? '#000000'}
      empty={!color}
      alpha={rules.alpha}
      why={rules.why}
      note={rules.note}
      onChange={(c) => store().setUi(which === 'paint' ? { color: c, strokeOn: true } : { fillColor: c })}
    />
  );
}

export function PaintWells() {
  const paint = useStore((s) => s.ui.color);
  const back = useStore((s) => s.ui.fillColor);
  // A little pop when the two trade places (X, the button, or a right-click stroke).
  const before = useRef({ paint, back });
  const [pop, setPop] = useState(0);
  useEffect(() => {
    const b = before.current;
    before.current = { paint, back };
    if (paint !== back && paint === b.back && back === b.paint) setPop((n) => n + 1);
  }, [paint, back]);
  return (
    <div className="px-wells" data-help="pixel-wells" data-quest="paint-wells">
      <div className={`px-wells-stack${pop ? ' is-pop' : ''}`} key={pop} data-overlaps>
        <Well which="back" color={back} />
        <Well which="paint" color={paint} />
        <button type="button" className="px-wells-swap" data-control="swap-colours" aria-keyshortcuts="X" aria-label="Swap Paint and Back" title="Swap Paint and Back (X)" disabled={!back} onClick={() => void swapPaintBack()}>
          <SwapArrow size={16} />
        </button>
      </div>
      <ul className="px-wells-text">
        <li>
          <strong>Paint</strong> (front) and <strong>Back</strong>
        </li>
        <li>
          <kbd>X</kbd> swaps them
        </li>
        <li>Click paints Paint, right-click paints Back</li>
        <li>
          Hold <kbd>Alt</kbd> and click to pick a colour
        </li>
        <li>
          Hold <kbd>Alt</kbd> and drag to turn the page
        </li>
      </ul>
    </div>
  );
}
