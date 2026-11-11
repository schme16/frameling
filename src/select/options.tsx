// Tool options for Select: how it picks (box, lasso, magic wand), and what to do with the selected pixels.
import { getCommand } from '../core/registry';
import { useStore } from '../core/store';
import { ActionButton, Choice, Slider, Tip, Toggle } from '../canvas/controls';
import { maskCount } from './mask';
import { pixelSelection, usePixelSelectionVersion } from './pixel-state';
import { setSelectSettings, useSelectSettings, type SelectMode, type SelectSettings } from './settings';

const MODES: { value: SelectMode; label: string; title: string }[] = [
  { value: 'box', label: 'Box', title: 'Drag a rectangle round what you want (a marquee).' },
  { value: 'lasso', label: 'Lasso', title: 'Draw round what you want, freehand. Hold Alt as you let go to add straight sides.' },
  { value: 'wand', label: 'Magic wand', title: 'Click a colour to pick every pixel of it.' },
];

/** Box / Lasso (and Magic wand on pixel layers). */
export function SelectModeChoice({ wand }: { wand: boolean }) {
  const mode = useSelectSettings((s) => s.mode);
  const options = wand ? MODES : MODES.filter((m) => m.value !== 'wand');
  const value = !wand && mode === 'wand' ? 'box' : mode;
  return <Choice<SelectMode> label="Pick with" value={value} options={options} onChange={(v) => setSelectSettings({ mode: v })} />;
}

const run = (id: string) => () => void getCommand(id)?.run();

const ACTIONS: [string, string][] = [
  ['pixel.flipH', 'Flip left-right'],
  ['pixel.flipV', 'Flip up-down'],
  ['pixel.rotateRight', 'Turn right'],
  ['pixel.rotateLeft', 'Turn left'],
  ['pixel.rotate', 'Turn by...'],
  ['pixel.outline', 'Outline'],
  ['edit.delete', 'Delete'],
];

export function PixelSelectOptions() {
  usePixelSelectionVersion();
  // Re-read when the layer or frame changes too.
  useStore((s) => s.ui.activeLayerId);
  const mode = useSelectSettings((s) => s.mode);
  const op = useSelectSettings((s) => s.op);
  const tolerance = useSelectSettings((s) => s.tolerance);
  const contiguous = useSelectSettings((s) => s.contiguous);
  const sel = pixelSelection();
  const count = sel ? maskCount(sel) : 0;
  const how =
    mode === 'wand' ? 'Click a colour to pick it.' : mode === 'lasso' ? 'Draw round what you want.' : 'Drag a box round what you want.';
  return (
    <div className="cv-options">
      <SelectModeChoice wand />
      <Choice<SelectSettings['op']>
        label="Each new pick"
        value={op}
        options={[
          { value: 'replace', label: 'Starts afresh', title: 'A new pick replaces the old one.' },
          { value: 'add', label: 'Adds', title: 'A new pick adds to what is already selected (same as holding Shift).' },
          { value: 'subtract', label: 'Takes away', title: 'A new pick takes pixels out of the selection (same as holding Alt).' },
        ]}
        onChange={(v) => setSelectSettings({ op: v })}
      />
      {mode === 'wand' && (
        <>
          <Slider label="Colour match" value={tolerance} min={0} max={100} format={(v) => (v === 0 ? 'Exact colour' : `Close colours (${v}%)`)} onChange={(v) => setSelectSettings({ tolerance: v })} hint="How alike a colour has to be to get picked too. Exact picks only the very same colour (tolerance)." />
          <Toggle label="Only touching pixels" checked={contiguous} onChange={(v) => setSelectSettings({ contiguous: v })} hint="On: just the patch you clicked. Off: that colour everywhere on the drawing (contiguous)." />
        </>
      )}
      <Tip>
        {count ? `${count} pixel${count === 1 ? '' : 's'} selected. Drag inside to move them (Alt+drag for a copy, Ctrl+D to duplicate); arrow keys nudge. ` : `${how} `}
        Shift adds, Alt takes away. Painting stays inside the selection.
      </Tip>
      <div className="cv-row cv-wrap">
        <ActionButton onClick={run('select.all')}>Select all</ActionButton>
        <ActionButton disabled={!count} onClick={run('select.invert')}>
          Invert
        </ActionButton>
        <ActionButton disabled={!count} onClick={run('select.none')}>
          Deselect
        </ActionButton>
      </div>
      <div className="cv-row cv-wrap">
        {ACTIONS.map(([id, label]) => (
          <ActionButton key={id} disabled={!count} onClick={run(id)}>
            {label}
          </ActionButton>
        ))}
      </div>
    </div>
  );
}
