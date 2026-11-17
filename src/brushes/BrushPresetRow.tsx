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
  deleteActive,
  everyBrush,
  myBrushes,
  namingMode,
  renameActive,
  revertActive,
  saveBrushesFile,
  saveCurrentAs,
  startNaming,
  stateFor,
  updateActive,
  useBrushPresets,
  type Side,
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

/** The picker alone, with an optional title above it (the same look as the Tip title). */
export function BrushPresetPicker({ side = 'vector', title }: { side?: Side; title?: string }) {
  // Redraw when the brush in use or the list changes.
  useStore((s) => s.ui.brush);
  useStore((s) => s.ui.tool);
  useBrushPresets(brushesVersion);
  return (
    <div className="bp-row" data-testid="brush-presets" data-control="brush-picker">
      {title && <div className="tp-label">{title}</div>}
      <BrushPicker side={side} />
    </div>
  );
}

/** What you can do to the brush in use: keep it, update it, put it back, rename it, delete it, and share your brushes. */
export function BrushPresetActions({ side = 'vector', revert = true }: { side?: Side; revert?: boolean }) {
  useStore((s) => s.ui.brush);
  useStore((s) => s.ui.tool);
  useBrushPresets(brushesVersion);
  const mode = useBrushPresets(namingMode);
  const { changed } = stateFor(side);
  const own = activeOwn(side);
  const full = myBrushes().length >= MAX_PRESETS;
  return (
    <div className="bp-row" data-testid="brush-keep">
      {mode ? (
        <NameField key={mode} mode={mode} />
      ) : (
        <div className="bp-actions">
          <ActionButton control="save-as" onClick={() => startNaming('save')} disabled={full} title="Keep the brush you are using, with a name of your own">
            Save as...
          </ActionButton>
          {own && changed && (
            <ActionButton control="update" onClick={() => void updateActive()} title={`Put your changes into "${own.name}"`}>
              Update
            </ActionButton>
          )}
          {changed && revert && (
            <ActionButton control="revert" onClick={() => void revertActive()} title="Go back to this brush as it was saved">
              Back to how it came
            </ActionButton>
          )}
          {own && (
            <>
              <ActionButton control="rename" onClick={() => startNaming('rename')} title={`Give "${own.name}" another name`}>
                Rename
              </ActionButton>
              <ActionButton control="delete" onClick={() => void deleteActive()} title={`Delete "${own.name}". Undo is on the message that appears.`}>
                Delete
              </ActionButton>
            </>
          )}
        </div>
      )}
      <details className="bp-fold" data-control="share">
        <summary>Share your brushes</summary>
        <p className="bp-fold-hint">Save them as a file or text to send to a friend, or add ones you were sent.</p>
        <div className="bp-share">
          <ActionButton control="share-save-file" onClick={() => void saveBrushesFile()}>Save as a file</ActionButton>
          <ActionButton control="share-copy-text" onClick={() => void copyBrushesText()}>Copy as text</ActionButton>
          <ActionButton control="share-add-file" onClick={() => void addBrushesFromFile()}>Add from a file...</ActionButton>
          <ActionButton control="share-paste-text" onClick={() => void addBrushesFromClipboard()}>Paste from text</ActionButton>
        </div>
      </details>
    </div>
  );
}

/** The saved brushes in one block: the picker, then what you can do to the one you are using. The other brush panels use this. */
export function BrushPresetRow({ side = 'vector' }: { side?: Side }) {
  useStore((s) => s.ui.brush);
  useStore((s) => s.ui.tool);
  useBrushPresets(brushesVersion);
  return (
    <div className="bp-row" data-testid="brush-presets" data-control="brush-picker">
      <BrushPicker side={side} />
      <BrushPresetActions side={side} />
    </div>
  );
}
