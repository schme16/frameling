// Preferences > Workspaces: switch between the workspaces that come with Frameling and your own, save the layout you
// have, rename, reorder and delete yours, and share them as files or text.
import { useState } from 'react';
import { applyWorkspace, currentWorkspace, deleteWorkspace, dock, dockEverythingBack, listWorkspaces, MAX_SAVED, moveWorkspace, renameWorkspace, saveWorkspace, workspacesFull } from './dock';
import { floatChrome, setFloatChrome, type FloatChrome } from './DockFloats';
import { Icon } from './icons';
import { toast } from './toast';
import { copyWorkspaceText, exportWorkspaceFile, importWorkspaceFile, importWorkspaceFromText, resetLayoutAndAsk } from './workspaceActions';

export function WorkspacesPage() {
  dock.use((d) => d);
  const chrome = floatChrome.use((v) => v);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const list = listWorkspaces();
  const mine = list.filter((w) => !w.builtin);
  const now = currentWorkspace();
  const sameName = mine.some((w) => w.name.toLowerCase() === name.trim().toLowerCase());
  const full = workspacesFull() && !sameName;

  const save = () => {
    const ws = saveWorkspace(name);
    if (!ws) return void toast(`You can keep ${MAX_SAVED} of your own. Delete one to make room.`, { kind: 'warn' });
    setName('');
    toast(`Saved "${ws.name}". Find it in the View menu.`, { kind: 'success' });
  };
  const rename = (id: string) => {
    renameWorkspace(id, draft);
    setEditing(null);
  };

  const row = (w: (typeof list)[number]) => {
    const own = !w.builtin;
    const at = own ? mine.indexOf(w) : -1;
    return (
      <li key={w.id} className={`ui-ws${now?.id === w.id ? ' is-chosen' : ''}`}>
        <Icon name={own ? 'heart' : 'workspace'} size={16} />
        <div className="ui-ws-text">
          {editing === w.id ? (
            <input
              className="ui-ws-edit"
              aria-label="Workspace name"
              value={draft}
              autoFocus
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => rename(w.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rename(w.id);
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditing(null);
                }
              }}
            />
          ) : (
            <span className="ui-ws-name">
              {w.name}
              {now?.id === w.id && <span className="ui-tag ui-tag-on">In use</span>}
            </span>
          )}
          {w.about && <span className="ui-ws-about">{w.about}</span>}
        </div>
        <div className="ui-ws-acts">
          {now?.id !== w.id && (
            <button type="button" className="ui-btn ui-btn-small" onClick={() => applyWorkspace(w.id)}>
              Use
            </button>
          )}
          {own && (
            <>
              <button type="button" className="ui-icon-btn" aria-label={`Move ${w.name} up`} data-tip="Move up" disabled={at === 0} onClick={() => moveWorkspace(w.id, at - 1)}>
                <Icon name="chevron-up" size={14} />
              </button>
              <button type="button" className="ui-icon-btn" aria-label={`Move ${w.name} down`} data-tip="Move down" disabled={at === mine.length - 1} onClick={() => moveWorkspace(w.id, at + 1)}>
                <Icon name="chevron-down" size={14} />
              </button>
              <button type="button" className="ui-btn ui-btn-small" onClick={() => (setDraft(w.name), setEditing(w.id))}>
                Rename
              </button>
              <button type="button" className="ui-btn ui-btn-small" data-tip="Keep the layout you have now under this name" onClick={() => (saveWorkspace(w.name), toast(`Updated "${w.name}" to the layout you have now.`, { kind: 'success' }))}>
                Update
              </button>
            </>
          )}
          <button type="button" className="ui-icon-btn" aria-label={`Save ${w.name} as a file`} data-tip="Save as a file to share" onClick={() => exportWorkspaceFile(w.id)}>
            <Icon name="export" size={15} />
          </button>
          <button type="button" className="ui-icon-btn" aria-label={`Copy ${w.name} as text`} data-tip="Copy as text to paste into a message" onClick={() => void copyWorkspaceText(w.id)}>
            <Icon name="duplicate" size={15} />
          </button>
          {own &&
            (confirm === w.id ? (
              <button
                type="button"
                className="ui-btn ui-btn-small th-danger"
                autoFocus
                onClick={() => (deleteWorkspace(w.id), setConfirm(null))}
                onBlur={() => setConfirm(null)}
              >
                Really delete?
              </button>
            ) : (
              <button type="button" className="ui-icon-btn" aria-label={`Delete ${w.name}`} data-tip={`Delete ${w.name}`} onClick={() => setConfirm(w.id)}>
                <Icon name="trash" size={15} />
              </button>
            ))}
        </div>
      </li>
    );
  };

  return (
    <>
      <h3>Workspaces</h3>
      <p className="ui-pref-intro">A workspace is a way of arranging your panels: which sides they sit on, which float in windows of their own, and how big each is. Switch between them any time.</p>
      <ul className="ui-ws-list" aria-label="Workspaces that come with Frameling">
        {list.filter((w) => w.builtin).map(row)}
      </ul>

      <h4 className="ui-ws-head">
        Yours <span>{mine.length} of {MAX_SAVED}</span>
      </h4>
      {mine.length > 0 ? (
        <ul className="ui-ws-list" aria-label="Your workspaces">
          {mine.map(row)}
        </ul>
      ) : (
        <p className="ui-pref-intro">Nothing here yet. Arrange the panels the way you like, then save them below.</p>
      )}
      <form
        className="ui-ws-save"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="ui-field ui-field-wide">
          <span>{sameName ? 'This name is taken. Saving replaces it with the layout you have now' : 'Save the layout you have now as'}</span>
          <input
            type="text"
            placeholder="My cosy corner"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              // Enter saves, even where the browser would not submit the form by itself.
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (name.trim() && !full) save();
            }}
          />
        </label>
        <button type="submit" className="ui-btn ui-btn-primary" disabled={!name.trim() || full}>
          {sameName ? 'Replace' : 'Save'}
        </button>
      </form>
      {full && <p className="ui-pref-intro">You have {MAX_SAVED} of your own, the most you can keep. Delete one to save another.</p>}

      <h4 className="ui-ws-head">Share</h4>
      <p className="ui-pref-intro">Save any workspace as a small file, or copy it as text, and send it to a friend. Add one you were sent here.</p>
      <div className="ui-ws-share">
        <button type="button" className="ui-btn" onClick={() => exportWorkspaceFile()}>
          <Icon name="export" size={14} />
          Save this layout as a file
        </button>
        <button type="button" className="ui-btn" onClick={() => void copyWorkspaceText()}>
          <Icon name="duplicate" size={14} />
          Copy this layout as text
        </button>
        <button type="button" className="ui-btn" onClick={() => void importWorkspaceFile()} disabled={workspacesFull()}>
          <Icon name="open" size={14} />
          Add a workspace file...
        </button>
      </div>
      <label className="ui-field ui-field-wide ui-ws-paste">
        <span>Or paste workspace text here</span>
        <textarea rows={3} value={pasted} placeholder='{ "format": "frameling-workspace", ... }' onChange={(e) => setPasted(e.target.value)} />
      </label>
      <button
        type="button"
        className="ui-btn"
        disabled={!pasted.trim() || workspacesFull()}
        onClick={() => {
          if (importWorkspaceFromText(pasted)) setPasted('');
        }}
      >
        Add it to my workspaces
      </button>

      <h4 className="ui-ws-head">Floating windows</h4>
      <div className="ui-pref-row">
        <div className="ui-pref-text">
          <strong>Window style</strong>
          <span>Titled shows a name on a bar with the tabs under it. Compact puts the tabs in the bar.</span>
        </div>
        <div className="ui-segmented" role="radiogroup" aria-label="Window style">
          {(['titled', 'compact'] as FloatChrome[]).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={chrome === c} className={`ui-seg${chrome === c ? ' is-chosen' : ''}`} onClick={() => setFloatChrome(c)}>
              {c === 'titled' ? 'Titled' : 'Compact'}
            </button>
          ))}
        </div>
      </div>

      <div className="ui-pref-foot">
        <button type="button" className="ui-btn" onClick={() => resetLayoutAndAsk()}>
          Reset layout
        </button>
        <button type="button" className="ui-btn" disabled={!dock.get().layout.floats.length} onClick={() => dockEverythingBack()}>
          Dock every window back
        </button>
        <span>Reset puts the panels back to how the workspace in use began.</span>
      </div>
    </>
  );
}
