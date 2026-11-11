// The Versions dialog (File > Versions...): the drawing's earlier versions down the left, a big preview of the one
// picked on the right (with a slider to look through its frames), and buttons to bring it back. Also the small
// "Save a version" naming box.
import { useEffect, useRef, useState } from 'react';
import type { Doc } from '../core/format';
import { renderFrameToCanvas } from '../core/render';
import { store } from '../core/store';
import { QuillEmpty } from '../ui/mascot';
import { loadFile } from './file';
import { Modal, mountModal } from './mount';
import { timeAgo, versionLabel, type VersionMeta } from './version-rules';
import { deleteVersion, listVersions, readVersion, renameVersion, restoreVersion, takeVersion, versionsChanged } from './versions';
import { notify } from './notify';
import './versions.css';

export type VersionsLayout = 'list' | 'strip';

function sizeText(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function Preview({ v }: { v: VersionMeta }) {
  const [doc, setDoc] = useState<Doc | null | 'gone'>(null);
  const [frame, setFrame] = useState(0);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    setDoc(null);
    setFrame(0);
    void readVersion(v).then((b) => {
      if (!live) return;
      try {
        setDoc(b ? loadFile(b).doc : 'gone');
      } catch {
        setDoc('gone');
      }
    });
    return () => void (live = false);
  }, [v.id]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !doc || doc === 'gone') return;
    const box = 420;
    const scale = Math.min(box / doc.width, box / doc.height);
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(doc.width * scale * dpr));
    c.height = Math.max(1, Math.round(doc.height * scale * dpr));
    c.style.width = `${Math.round(doc.width * scale)}px`;
    c.style.height = `${Math.round(doc.height * scale)}px`;
    const g = c.getContext('2d')!;
    g.fillStyle = doc.background ?? '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    try {
      g.imageSmoothingEnabled = false;
      g.drawImage(renderFrameToCanvas(doc, frame, scale * dpr), 0, 0);
    } catch {
      // A preview that can't draw just stays blank.
    }
  }, [doc, frame]);
  if (doc === 'gone') return <p className="io-muted vh-preview-msg">This version's file is missing, so it can't be shown.</p>;
  return (
    <div className="vh-preview">
      <div className="vh-stage">{doc ? <canvas ref={ref} aria-label={`Preview of ${versionLabel(v)}, frame ${frame + 1}`} /> : <span className="io-muted">Loading...</span>}</div>
      {doc && doc.length > 1 ? (
        <label className="vh-scrub">
          <span>Frame</span>
          <input type="range" min={0} max={doc.length - 1} value={frame} onChange={(e) => setFrame(Number(e.target.value))} />
          <output>
            {frame + 1} of {doc.length}
          </output>
        </label>
      ) : null}
    </div>
  );
}

function Row({ v, picked, onPick, first }: { v: VersionMeta; picked: boolean; onPick: () => void; first: boolean }) {
  return (
    <li>
      <button type="button" className={`vh-row${picked ? ' is-picked' : ''}`} aria-pressed={picked} data-autofocus={first ? '' : undefined} onClick={onPick}>
        {v.thumb ? <img src={v.thumb} alt="" /> : <span className="io-thumb-none" aria-hidden="true" />}
        <span className="vh-row-text">
          <b className={v.name ? 'vh-named' : ''}>{versionLabel(v)}</b>
          <small>{timeAgo(v.takenAt)}</small>
        </span>
      </button>
    </li>
  );
}

function VersionsDialog({ close, layout }: { close: () => void; layout: VersionsLayout }) {
  const docId = store().rootDoc().id;
  const tick = versionsChanged.use((n) => n);
  const [items, setItems] = useState<VersionMeta[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void listVersions(docId).then((l) => {
      if (!live) return;
      setItems(l);
      setPick((p) => (p && l.some((x) => x.id === p) ? p : (l[0]?.id ?? null)));
    });
    return () => void (live = false);
  }, [docId, tick]);
  const v = items?.find((x) => x.id === pick) ?? null;

  const bringBack = async (how?: 'in-place' | 'copy') => {
    if (!v) return;
    if (await restoreVersion(v, how)) close();
  };

  return (
    <Modal title="Versions" onClose={close} wide className={`vh vh-layout-${layout}`}>
      <div className="io-body vh-body">
        {items === null ? null : items.length === 0 ? (
          <QuillEmpty anim="idle" className="io-empty">
            No versions of this drawing yet. Frameling keeps one every 10 minutes while you work and each time you save. Press Save a version now to keep one with a name.
          </QuillEmpty>
        ) : (
          <>
            <ul className="vh-list" aria-label="Versions, newest first">
              {items.map((x, i) => (
                <Row key={x.id} v={x} picked={x.id === pick} first={i === 0} onPick={() => (setPick(x.id), setNaming(null))} />
              ))}
            </ul>
            {v ? (
              <div className="vh-side">
                <Preview v={v} />
                <div className="vh-info">
                  {naming !== null ? (
                    <form
                      className="vh-name"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void renameVersion(v, naming);
                        setNaming(null);
                      }}
                    >
                      <input autoFocus aria-label="Version name" value={naming} maxLength={80} placeholder="Name this version" onChange={(e) => setNaming(e.target.value)} />
                      <button type="submit" className="io-btn io-primary">
                        Keep name
                      </button>
                    </form>
                  ) : (
                    <>
                      <b>{versionLabel(v)}</b>
                      <small className="io-muted">
                        {timeAgo(v.takenAt)}
                        {v.frames ? `, ${v.frames} frame${v.frames === 1 ? '' : 's'}` : ''}, {sizeText(v.size)}
                        {v.name ? ', kept until you delete it' : ''}
                      </small>
                    </>
                  )}
                </div>
                <div className="vh-actions">
                  <button type="button" className="io-btn io-primary" onClick={() => void bringBack()}>
                    Bring this back
                  </button>
                  <button type="button" className="io-btn" onClick={() => void bringBack('copy')}>
                    Open as a copy
                  </button>
                  <button type="button" className="io-btn" onClick={() => setNaming(v.name ?? '')}>
                    {v.name ? 'Rename' : 'Name it'}
                  </button>
                  <button type="button" className="io-btn" aria-label={`Delete version ${versionLabel(v)}`} onClick={() => void deleteVersion(v)}>
                    Delete
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div className="io-foot">
        <span className="io-muted vh-foot-note">Named versions stay until you delete them. Automatic ones are tidied away after 2 weeks.</span>
        <button type="button" className="io-btn" onClick={() => openSaveVersionDialog()}>
          Save a version now
        </button>
        <button type="button" className="io-btn io-primary" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

function SaveVersionDialog({ close }: { close: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const v = await takeVersion({ name: name.trim() || `Version ${new Date().toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` });
    close();
    if (v) notify(`Version "${v.name}" kept. Find it in File > Versions...`, 'success', { label: 'Show', run: () => openVersionsDialog() });
    else notify("That version couldn't be kept. Please try again.", 'error');
  };
  return (
    <Modal title="Save a version" onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="io-body">
          <p className="io-muted">A copy of your drawing as it is right now, kept until you delete it. Your file isn't changed.</p>
          <label className="vh-field">
            <span>Name</span>
            <input data-autofocus="" value={name} maxLength={80} placeholder="Before the big change" onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <div className="io-foot">
          <button type="button" className="io-btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="io-btn io-primary" disabled={busy}>
            Save version
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function openVersionsDialog(layout: VersionsLayout = 'list'): () => void {
  return mountModal((close) => <VersionsDialog close={close} layout={layout} />);
}

export function openSaveVersionDialog(): () => void {
  return mountModal((close) => <SaveVersionDialog close={close} />);
}
