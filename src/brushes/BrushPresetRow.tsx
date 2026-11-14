// The saved brushes at the top of the brush options: the picker, and saving, updating, renaming and deleting the one you are using.
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
import { BrushPicker } from './BrushPicker';
import { groupNames, MAX_GROUP } from './library';
import './brushes.css';

function NameField({ mode }: { mode: 'save' | 'rename' }) {
  const [name, setName] = useState(() => (mode === 'rename' ? currentName() : suggestName()));
  // A new brush goes in the group of the one you have picked; renaming keeps its group unless you change it.
  const [group, setGroup] = useState(() => activeOwn()?.group ?? '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const go = () => {
    if (!cleanName(name)) return;
    if (mode === 'save') saveCurrentAs(name, group);
    else renameActive(name, group);
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
      <label className="bp-name-label">
        <span>
          Group <small>(optional)</small>
        </span>
        <input
          type="text"
          value={group}
          list="bp-groups"
          maxLength={MAX_GROUP}
          placeholder="My brushes"
          onChange={(e) => setGroup(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') startNaming(null);
          }}
        />
        <datalist id="bp-groups">
          {groupNames(everyBrush()).map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
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

/** The saved brushes: the picker, then what you can do to the one you are using. */
export function BrushPresetRow() {
  // Redraw when the brush in use or the list changes.
  useStore((s) => s.ui.brush);
  useBrushPresets(brushesVersion);
  const mode = useBrushPresets(namingMode);
  const { changed } = currentBrushState();
  const own = activeOwn();
  const full = myBrushes().length >= MAX_PRESETS;
  return (
    <div className="bp-row" data-testid="brush-presets">
      <BrushPicker />
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
