// Draw on: how much of the picked line shows, and the one-click ways to make it draw itself. The sliders write to the key
// at the playhead (a key is cut there when the playhead is not on one), so moving them while scrubbing animates the line.
import { useState } from 'react';
import { useStore } from '../core/store';
import { ActionButton, Choice, Slider, Tip } from '../canvas/controls';
import { Num, Section } from '../symbols/Num';
import { TweenSection } from '../symbols/PropertiesPanel';
import { trimView } from './model';
import { drawFrames, drawPickedLine, setDrawFrames, setPickedTrim, showWholeLine } from './ops';
import type { OrderChoice } from './choices';
import '../symbols/symbols.css';

const pct = (v: number) => `${Math.round(v * 10) / 10}%`;

const ORDER: { value: OrderChoice; label: string; title: string }[] = [
  { value: 'together', label: 'All at once', title: 'Every outline draws at the same time, each by the same amount' },
  { value: 'inOrder', label: 'One after another', title: 'The outlines draw in turn, as if they were one long line' },
];

export function TrimPanel() {
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const sel = useStore((s) => s.ui.selection);
  const layerId = useStore((s) => s.ui.activeLayerId);
  const playing = useStore((s) => s.ui.playing);
  const [frames, setFrames] = useState<number | null>(null);
  const v = trimView(doc, layerId, frame, sel);
  const shownFrames = frames ?? drawFrames();
  return (
    <div className="cv-options sy-props" data-help="draw-on">
      <Section title="Draw on">
        {!v ? (
          <Tip stays>Pick a line on the canvas (a brush line, or a shape with an outline) and it can draw itself in: Start and End say how much of it shows, and they can change over time.</Tip>
        ) : (
          <>
            {v.mixed && <Tip stays>The picked lines show different amounts. Moving a slider sets them all the same.</Tip>}
            <Slider label="Start" value={Math.round(v.now.start * 10) / 10} min={0} max={100} step={1} format={pct} onChange={(n) => setPickedTrim({ start: n }, 'Change where the line starts')} hint="Where the visible part begins, as a share of the line's length. Hides everything before it." />
            <Slider label="End" value={Math.round(v.now.end * 10) / 10} min={0} max={100} step={1} format={pct} onChange={(n) => setPickedTrim({ end: n }, 'Change where the line ends')} hint="Where the visible part stops. At 0% nothing shows; at 100% all of it does. Move it from 0 to 100 and the line draws itself." />
            <Slider label="Offset" value={Math.round(v.now.offset * 10) / 10} min={-100} max={100} step={1} format={pct} onChange={(n) => setPickedTrim({ offset: n }, 'Slide the drawn part of the line')} hint={v.loops ? 'Slides the visible part along the line. On a loop it wraps round, so a ring can spin.' : 'Slides the visible part along the line. On an open line it stops at the ends.'} />
            {!v.onKey && !playing && (
              <Tip stays>
                You are partway through a key, on frame {frame + 1}. Moving a slider adds a key here, so the line is {v.glides ? 'blended up to this frame and changes from here' : 'a different amount from here on'}.
              </Tip>
            )}
            {v.outlines > 1 && <Choice<OrderChoice> label="Several outlines" value={v.order} options={ORDER} onChange={(o) => setPickedTrim({ order: o }, 'Change how the outlines draw')} />}
            <div className="cv-row cv-wrap">
              <ActionButton onClick={() => drawPickedLine('on')} title="Hide the line here and draw it in by the next key (Ctrl+Alt+W)">
                Draw it on
              </ActionButton>
              <ActionButton onClick={() => drawPickedLine('off')} title="Start whole and rub the line out by the next key">
                Rub it out
              </ActionButton>
              <ActionButton onClick={() => showWholeLine()} title="Take Start, End and Offset off, on every key">
                Show it all
              </ActionButton>
            </div>
            <div className="sy-grid">
              <Num
                label="Takes (frames)"
                value={shownFrames}
                step={1}
                title="How many frames Draw it on and Rub it out take when there is no next key yet"
                onChange={(n) => {
                  setDrawFrames(n);
                  setFrames(drawFrames());
                }}
              />
            </div>
          </>
        )}
      </Section>
      <TweenSection />
    </div>
  );
}
