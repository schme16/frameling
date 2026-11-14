// The row of saved brushes at the top of the brush options: pick one, save the one you are using, update or delete it.
import { useEffect, useRef, useState } from 'react';
import { ActionButton } from '../canvas/controls';
import { useStore } from '../core/store';
import { cleanName, MAX_NAME, MAX_PRESETS } from './model';
import {
  activeOwn,
  addBrushesFromClipboard,
  addBrushesFromFile,
  applyPreset,
  brushesVersion,
  copyBrushesText,
  currentBrushState,
  deleteActive,
  everyBrush,
  myBrushes,
  namingMode,
  renameActive,
  revertActive,
  saveBrushesFile,
  saveCurrentAs,
  startNaming,
  updateActive,
  useBrushPresets,
} from './presets';
import { useMockRow } from './mockSlot';
import './brushes.css';

/** The dot beside a name: as wide as the brush, up to a point, so the row can be read at a glance. */
export const dotSize = (size: number): number => Math.round(Math.min(14, Math.max(4, 3 + size * 0.35)));

function NameField({ mode }: { mode: 'save' | 'rename' }) {
  const [name, setName] = useState(() => (mode === 'rename' ? currentName() : suggestName()));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const go = () => {
    if (!cleanName(name)) return;
    if (mode === 'save') saveCurrentAs(name);
    else renameActive(name);
  };
  return (
    <form
      className="bp-name"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <label className="bp-name-label">
        <span>{mode === 'save' ? 'Save this brush as' : 'Rename this brush to'}</span>
        <input
          ref={ref}
          type="text"
          value={name}
          maxLength={MAX_NAME}
          placeholder="Soft shading"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') startNaming(null);
          }}
        />
      </label>
      <div className="bp-name-go">
        <ActionButton onClick={go} disabled={!cleanName(name)}>
          {mode === 'save' ? 'Save' : 'Rename'}
        </ActionButton>
        <ActionButton onClick={() => startNaming(null)}>Cancel</ActionButton>
      </div>
    </form>
  );
}

const currentName = (): string => activeOwn()?.name ?? '';
const suggestName = (): string => {
  const taken = everyBrush().map((p) => p.name.toLowerCase());
  for (let n = 1; ; n++) {
    const s = n === 1 ? 'My brush' : `My brush ${n}`;
    if (!taken.includes(s.toLowerCase())) return s;
  }
};

/** The saved brushes. With ?debug a layout mockup can stand in for it (brand/ab/brush-library). */
export function BrushPresetRow() {
  const mock = useMockRow();
  return mock ? <>{mock()}</> : <RealBrushPresetRow />;
}

function RealBrushPresetRow() {
  // Redraw when the brush in use or the list changes.
  useStore((s) => s.ui.brush);
  useBrushPresets(brushesVersion);
  const all = everyBrush();
  const mode = useBrushPresets(namingMode);
  const { activeId, changed } = currentBrushState();
  const own = activeOwn();
  const full = myBrushes().length >= MAX_PRESETS;
  return (
    <div className="bp-row" data-testid="brush-presets">
      <div className="bp-chips" role="group" aria-label="Saved brushes">
        {all.map((p) => {
          const on = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              className="bp-chip"
              data-on={on}
              data-changed={on && changed}
              aria-pressed={on}
              title={on && changed ? `${p.name}, changed since you picked it. Update keeps the change.` : p.builtin ? `${p.name}, comes with Frameling` : p.name}
              onClick={() => applyPreset(p.id)}
            >
              <span className="bp-dot" style={{ width: dotSize(p.brush.size), height: dotSize(p.brush.size) }} />
              <span className="bp-chip-name">{p.name}</span>
              {on && changed && <span className="bp-changed" aria-label="changed" />}
            </button>
          );
        })}
      </div>
      {mode ? (
        <NameField key={mode} mode={mode} />
      ) : (
        <div className="bp-actions">
          <ActionButton onClick={() => startNaming('save')} disabled={full} title="Keep the brush you are using, with a name of your own">
            Save as...
          </ActionButton>
          {own && changed && (
            <ActionButton onClick={() => void updateActive()} title={`Put your changes into "${own.name}"`}>
              Update
            </ActionButton>
          )}
          {changed && (
            <ActionButton onClick={() => void revertActive()} title="Go back to this brush as it was saved">
              Revert
            </ActionButton>
          )}
          {own && (
            <>
              <ActionButton onClick={() => startNaming('rename')} title={`Give "${own.name}" another name`}>
                Rename
              </ActionButton>
              <ActionButton onClick={() => void deleteActive()} title={`Delete "${own.name}". Undo is on the message that appears.`}>
                Delete
              </ActionButton>
            </>
          )}
        </div>
      )}
      <details className="bp-fold">
        <summary>Share your brushes</summary>
        <p className="bp-fold-hint">Save them as a file or text to send to a friend, or add ones you were sent.</p>
        <div className="bp-share">
          <ActionButton onClick={() => void saveBrushesFile()}>Save as a file</ActionButton>
          <ActionButton onClick={() => void copyBrushesText()}>Copy as text</ActionButton>
          <ActionButton onClick={() => void addBrushesFromFile()}>Add from a file...</ActionButton>
          <ActionButton onClick={() => void addBrushesFromClipboard()}>Paste from text</ActionButton>
        </div>
      </details>
    </div>
  );
}
