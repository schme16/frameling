import { useEffect, useRef, useState } from 'react';
import { store, useStore } from '../core/store';
import { getCommand } from '../core/registry';
import { Icon, Logo } from './icons';
import { MenuBar } from './MenuBar';
import { commandEnabled, runCommand } from './palette';
import { openPalette } from './overlays';

function DocName() {
  const name = useStore((s) => s.doc.name);
  const dirty = useStore((s) => s.ui.dirty);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const finish = (save: boolean) => {
    setEditing(false);
    const next = draft.trim();
    if (save && next && next !== name) store().update('Rename drawing', (d) => void (d.name = next.slice(0, 80)));
  };

  if (editing)
    return (
      <input
        ref={input}
        className="ui-docname-input"
        aria-label="Drawing name"
        value={draft}
        maxLength={80}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true);
          if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
          }
        }}
        data-help="document-name"
      />
    );
  return (
    <button
      type="button"
      className="ui-docname"
      data-help="document-name"
      data-tip="Rename your drawing"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
    >
      <span className="ui-docname-text">{name}</span>
      {dirty && <span className="ui-dirty" role="img" aria-label="Unsaved changes" data-tip="You have changes that are not saved yet" />}
    </button>
  );
}

function CmdButton({ id, icon, label }: { id: string; icon: string; label: string }) {
  // Only re-render when this button's enabled state actually flips.
  const enabled = useStore(() => {
    const c = getCommand(id);
    return c ? commandEnabled(c) : false;
  });
  const c = getCommand(id);
  return (
    <button type="button" className={`ui-icon-btn${enabled ? '' : ' is-disabled'}`} aria-label={label} aria-disabled={!enabled} data-command={id} onClick={() => c && runCommand(c)}>
      <Icon name={icon} />
    </button>
  );
}

export function TopBar() {
  return (
    <header className="ui-topbar">
      <div className="ui-brand" aria-label="Frameling">
        <Logo size={32} />
        <span className="ui-brand-name">Frameling</span>
      </div>
      <MenuBar />
      <div className="ui-topbar-mid">
        <DocName />
      </div>
      <div className="ui-topbar-end">
        <CmdButton id="edit.undo" icon="undo" label="Undo" />
        <CmdButton id="edit.redo" icon="redo" label="Redo" />
        <button type="button" className="ui-icon-btn" aria-label="Find a command" data-command="view.commandPalette" onClick={openPalette}>
          <Icon name="search" />
        </button>
      </div>
    </header>
  );
}
