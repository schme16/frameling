import { useState } from 'react';
import { getCommand, type Command } from '../core/registry';
import { store } from '../core/store';
import { pickedClip } from '../audio/ops';
import { mountModal, Modal } from '../io/mount';
import { showPanel } from '../ui/dock';
import { openSheet } from '../ui/overlays';
import { toast } from '../ui/toast';
import { mouthLayers, pickMouthLayer } from './apply';
import { openNameFrames } from './NameFrames';
import './lipsync.css';

const inSymbol = () => !!store().get().doc.editing?.length;

/** The line typed for each sound, kept for the session so running it again does not mean typing it again. */
const typed = new Map<string, string>();

function Picker({ close, onGo }: { close: () => void; onGo: (clipId: string, layerId: string, text: string) => void }) {
  const { doc, ui } = store().get();
  const clips = doc.audio ?? [];
  const layers = mouthLayers(doc);
  const [clipId, setClipId] = useState(pickedClip()?.id ?? clips[0]?.id ?? '');
  const [layerId, setLayerId] = useState(pickMouthLayer(doc, ui.activeLayerId)?.id ?? layers[0]?.id ?? '');
  const [text, setText] = useState(typed.get(clipId) ?? '');
  return (
    <Modal title="Lip sync" onClose={close}>
      <div className="io-body ls-dialog">
        <label className="ls-field">
          <span>Which sound should the mouth follow?</span>
          <select value={clipId} onChange={(e) => {
                setClipId(e.target.value);
                setText(typed.get(e.target.value) ?? '');
              }} data-autofocus>
            {clips.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="ls-field">
          <span>Which layer has the mouth?</span>
          <select value={layerId} onChange={(e) => setLayerId(e.target.value)}>
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="ls-field">
          <span>What do they say? (optional)</span>
          <textarea className="ls-say" rows={2} value={text} placeholder="Type the words here and the mouths line up with them more exactly." onChange={(e) => setText(e.target.value)} />
        </label>
        <p className="io-muted">Frameling listens to the sound and puts a mouth on each frame. It replaces the mouth keys under the sound, and you can undo it in one step.</p>
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="io-btn io-primary"
          onClick={() => {
            typed.set(clipId, text);
            close();
            onGo(clipId, layerId, text);
          }}
        >
          Lip sync it
        </button>
      </div>
    </Modal>
  );
}

async function go(clipId: string, layerId: string, text = ''): Promise<void> {
  // The listening code and its model are a big download, only needed once someone lip syncs.
  const { lipSync } = await import('./run');
  const r = await lipSync(clipId, layerId, text);
  if (!r.ok) {
    toast(r.why, { kind: 'warn' });
    return;
  }
  store().setUi({ frame: r.first, playing: false });
  showPanel('lipsync');
  toast(`Lip sync done: ${r.keys} mouth keys over ${r.frames} frames. Play it, then fix any mouth in the Lip sync panel.`, { kind: 'success', action: { label: 'Undo', run: () => store().undo() }, quill: 'cheer' });
}

/** Works out which sound and layer to use, asking only when there is more than one of either. */
export function startLipSync(forceAsk = false): void {
  const { doc, ui } = store().get();
  if (inSymbol()) return void toast('Go back to the scene first (press Done at the top of the canvas), then lip sync.', { kind: 'warn' });
  if (!doc.audio?.length) {
    toast('Add a sound first, then Frameling can match a mouth to it.', { kind: 'warn', action: { label: 'Import sound', run: () => void getCommand('audio.import')?.run() } });
    return;
  }
  const layers = mouthLayers(doc);
  if (!layers.length) {
    toast("There's no mouth to move yet. Start from the Lip sync template, or give a symbol's frames names like A, E, O.", { kind: 'warn', action: { label: 'Show templates', run: () => openSheet('new') } });
    return;
  }
  const layer = pickMouthLayer(doc, ui.activeLayerId)!;
  if (!forceAsk && doc.audio.length === 1 && layers.length === 1) return void go(doc.audio[0].id, layer.id, typed.get(doc.audio[0].id) ?? '');
  // Several sounds or mouths: if one is picked or active, still ask once so nobody lip syncs the wrong one.
  mountModal((close) => <Picker close={close} onGo={(c, l, t) => void go(c, l, t)} />);
}

/** What Lip sync adds to the command palette and menus. */
export const lipsyncCommands: Command[] = [
  {
    id: 'lipsync.auto',
    label: 'Auto lip sync...',
    category: 'Lip sync',
    description: 'Listen to a sound and put a mouth shape on every frame of the talking.',
    help: 'lip-sync',
    keywords: ['lipsync', 'lip sync', 'mouth', 'phoneme', 'talking', 'speech', 'dialogue', 'mouth chart', 'visemes'],
    run: () => startLipSync(),
  },
  {
    id: 'lipsync.autoWords',
    label: 'Auto lip sync with the words...',
    category: 'Lip sync',
    description: 'Type what is said, and the mouths are lined up with the words. Often more exact than listening alone.',
    help: 'lip-sync',
    keywords: ['lipsync', 'lip sync', 'mouth', 'words', 'text', 'script', 'transcript', 'align', 'dialogue'],
    run: () => startLipSync(true),
  },
  {
    id: 'lipsync.nameFrames',
    label: "Name a symbol's frames (make a mouth)...",
    category: 'Lip sync',
    description: 'Give each frame of a symbol a name like A, E or M B P, so Auto lip sync can use it as a mouth.',
    help: 'lip-sync',
    keywords: ['mouth', 'frame names', 'labels', 'mouth chart', 'phoneme', 'custom character'],
    run: openNameFrames,
  },
];
