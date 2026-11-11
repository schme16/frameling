// File > Save as template...: a few words about the drawing, then it's kept in Your templates (and, if ticked, saved
// as a file to share).
import { useState } from 'react';
import { mountModal } from '../io/mount';
import { store } from '../core/store';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/icons';
import { openHelp } from '../ui/overlays';
import { cleanTags, guessKind, LICENCES } from './community';
import { rememberedAuthor, saveTemplate, templateDoc } from './actions';

export function openSaveTemplate(): void {
  mountModal((close) => <SaveTemplate close={close} />);
}

function SaveTemplate({ close }: { close: () => void }) {
  const doc = templateDoc();
  const you = rememberedAuthor();
  const [name, setName] = useState(doc.name || 'My template');
  const [blurb, setBlurb] = useState('');
  const [tags, setTags] = useState('');
  const [author, setAuthor] = useState(you.author);
  const [licence, setLicence] = useState(you.licence);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const kind = guessKind(doc);
  const lic = LICENCES.find((l) => l.id === licence);
  const save = async () => {
    setBusy(true);
    const frame = store().get().ui.frame;
    const ok = await saveTemplate({ name: name.trim() || 'My template', blurb, kind, tags: cleanTags(tags), author: author.trim(), licence, ...(frame > 0 && frame < doc.length ? { frame } : {}) }, share);
    setBusy(false);
    if (ok) close();
  };
  return (
    <Modal title="Save as template" size="sm" className="tpl-save" onClose={close} initialFocus="input">
      <form
        className="tpl-save-body"
        data-help="templates-yours"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="tpl-save-intro">
          Keep "{doc.name}" as a starting point. It shows up in <strong>Your templates</strong> when you start something new.
        </p>
        <label className="ui-field">
          <span>Name</span>
          <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="ui-field">
          <span>What it is, and something to try</span>
          <textarea rows={2} value={blurb} maxLength={300} placeholder="A walk cycle on twos. Try it: swap the head for your own character." onChange={(e) => setBlurb(e.target.value)} />
        </label>
        <label className="ui-field">
          <span>Tags</span>
          <input type="text" value={tags} maxLength={200} placeholder="walk, character, loop" onChange={(e) => setTags(e.target.value)} />
        </label>
        <div className="tpl-save-row">
          <label className="ui-field">
            <span>Made by</span>
            <input type="text" value={author} maxLength={80} placeholder="Your name" onChange={(e) => setAuthor(e.target.value)} />
          </label>
          <label className="ui-field">
            <span>Licence</span>
            <select value={licence} onChange={(e) => setLicence(e.target.value)}>
              {LICENCES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {lic && <p className="tpl-save-hint">{lic.detail}</p>}
        <label className="ui-check">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          <span>Also save a copy to share</span>
        </label>
        <p className="tpl-save-hint">
          <span className={`ui-badge ui-badge-${kind}`}>
            <Icon name={kind === 'pixel' ? 'pixel' : 'vector'} size={12} />
            {kind === 'pixel' ? 'Pixel' : 'Vector'}
          </span>{' '}
          {doc.width} x {doc.height}, {doc.length} {doc.length === 1 ? 'frame' : 'frames'} at {doc.fps} fps. The card shows the frame you're on.
        </p>
        <div className="ui-choice-foot">
          <button type="button" className="ui-btn ui-btn-quiet" onClick={() => openHelp('templates-yours')}>
            <Icon name="help" size={14} /> Learn more
          </button>
          <span className="ui-spacer" />
          <button type="button" className="ui-btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="ui-btn ui-btn-primary" disabled={busy}>
            <Icon name="template" size={14} /> Save template
          </button>
        </div>
      </form>
    </Modal>
  );
}
