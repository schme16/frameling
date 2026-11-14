// The Marks tool's options: what to draw, the pen's colour and thickness, the switch that shows or hides every mark,
// and the two ways to clear them.
import { ActionButton, Choice, Field, Slider, Tip, Toggle } from '../canvas/controls';
import { setChoice, useChoice } from '../core/choices';
import { useStore } from '../core/store';
import { notify } from '../io/notify';
import { MARK_COLORS, MAX_W, MIN_W, countMarks } from './marks';
import { clearMarks } from './marksOps';
import { setMarksSaved, useMarksState, type MarkTool } from './marksState';
import type { MarksPinChoice } from './marksChoices';

/** The colour swatches, used here and in the picture of the help. */
export function MarkColours() {
  const { color } = useMarksState();
  return (
    <Field label="Pen colour">
      <div className="mk-swatches" role="radiogroup" aria-label="Pen colour">
        {MARK_COLORS.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={c.value === color} aria-label={c.name} title={c.name} className="mk-swatch" data-on={c.value === color} style={{ background: c.value }} onClick={() => setMarksSaved({ color: c.value })} />
        ))}
      </div>
    </Field>
  );
}

export function MarksOptions() {
  const { shape, w, show } = useMarksState();
  const pin = useChoice<MarksPinChoice>('marks.pin');
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const counts = countMarks(doc, frame);
  return (
    <div className="cv-options">
      <Tip>Drag to draw. Hold Shift for a straight 15 degree arrow or a true circle. Marks are for you and your reviewers: they never come out in an export.</Tip>
      <Choice<MarkTool>
        label="Draw"
        value={shape}
        options={[
          { value: 'arrow', label: 'Arrow', title: 'Drag from the tail to the tip' },
          { value: 'circle', label: 'Circle', title: 'Drag across the thing you want to ring' },
          { value: 'scribble', label: 'Sketch', title: 'Draw freehand' },
          { value: 'text', label: 'Words', title: 'Click, then type a few words' },
          { value: 'erase', label: 'Rub out', title: 'Click or drag over a mark to remove it' },
        ]}
        onChange={(v) => setMarksSaved({ shape: v })}
      />
      <MarkColours />
      <Slider label="Thickness" value={w} min={MIN_W} max={MAX_W} step={1} onChange={(v) => setMarksSaved({ w: v })} format={(v) => `${v} px`} hint="How thick the line is on screen. It stays the same however far you zoom." />
      <Choice<MarksPinChoice>
        label="New marks belong to"
        value={pin}
        options={[
          { value: 'frame', label: 'This frame', title: 'Shows only on the frame you are on' },
          { value: 'page', label: 'The page', title: 'Shows on every frame' },
          { value: 'layer', label: 'This layer', title: 'Shows on the frames where the layer has a drawing' },
        ]}
        onChange={(v) => setChoice('marks.pin', v)}
      />
      <Toggle label="Show marks" checked={show} onChange={(v) => setMarksSaved({ show: v })} hint="One switch for every mark on the canvas. They stay in the file and never come out in an export." />
      <div className="cv-row cv-wrap">
        <ActionButton
          onClick={() => {
            const n = clearMarks('frame');
            if (n) notify(`Cleared ${n} mark${n === 1 ? '' : 's'} on this frame. Undo brings ${n === 1 ? 'it' : 'them'} back.`, 'info');
          }}
          disabled={!counts.here}
          title="Remove the marks showing on this frame"
        >
          Clear this frame
        </ActionButton>
        <ActionButton
          onClick={() => {
            const n = clearMarks('all');
            if (n) notify(`Cleared ${n} mark${n === 1 ? '' : 's'}. Undo brings ${n === 1 ? 'it' : 'them'} back.`, 'info');
          }}
          disabled={!counts.all}
          title="Remove every mark on this page"
        >
          Clear all
        </ActionButton>
      </div>
    </div>
  );
}
