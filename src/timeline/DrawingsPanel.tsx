// The Drawings panel: every distinct drawing of the clip you are working in, once each, with its name under it. Held
// frames are skipped, so a clip at 100 fps is a handful of pictures, not thousands. Click one to go there; double-click
// the name to change it; type in the box to find a drawing by name (the list you can jump from).
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Doc, Id } from '../core/format';
import { artboardsOf } from '../artboards/model';
import { useStore, store } from '../core/store';
import { clipSpan, keyFrames, keyHolds, keyLabel, keyMatches, workingClip, type KeyFrame } from '../core/clipScope';
import { renderFrame } from '../core/render';
import { poseAt } from '../core/symbols';
import { paintThumbBackdrop } from '../canvas/thumbBackdrop';
import { Tip } from '../canvas/controls';
import { InlineName } from './Menu';
import * as ops from './ops';
import { goTo } from './playback';
import { consumeFind } from './drawingsFind';
import { setTl, useTl } from './state';
import './drawings.css';

/** The longest side of a picture, in CSS pixels. */
const SIDE = 88;

/** One picture of the clip, drawn when it scrolls into view and again only when one of its drawings changes. */
const Thumb = memo(function Thumb({ doc, frame }: { doc: Doc; frame: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const cv = ref.current;
    if (seen || !cv) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: '120px' });
    io.observe(cv);
    return () => io.disconnect();
  }, [seen]);
  // What is on screen at this frame: when none of these change, the picture is the same.
  const shown = doc.layers.map((l) => (l.visible ? poseAt(doc, l, frame) : undefined));
  const prev = useRef({ shown, version: 0 });
  if (prev.current.shown.length !== shown.length || shown.some((d, i) => d !== prev.current.shown[i])) prev.current = { shown, version: prev.current.version + 1 };
  const version = prev.current.version;
  const k = Math.min(SIDE / doc.width, SIDE / doc.height);
  const w = Math.max(1, Math.round(doc.width * k));
  const h = Math.max(1, Math.round(doc.height * k));
  useEffect(() => {
    const cv = ref.current;
    if (!seen || !cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    // Pixel art stays crisp; drawn art is smoothed.
    g.imageSmoothingEnabled = !doc.layers.every((l) => l.kind === 'pixel');
    renderFrame(g, doc, frame);
    g.setTransform(1, 0, 0, 1, 0, 0);
    paintThumbBackdrop(cv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, w, h, frame, version, doc.layers, doc.background, doc.folders]);
  return <canvas ref={ref} className="dr-thumb" style={{ width: w, height: h }} aria-hidden="true" />;
});

/** The drawing a name belongs to when a picture has several: the active layer's, else the topmost. */
export function celToName(k: KeyFrame, activeLayerId: Id | null): { layerId: Id; celId: Id } | undefined {
  return k.starts.find((r) => r.layerId === activeLayerId) ?? k.starts[0];
}

function Tile({ doc, k, current, activeLayerId, editing, onEdit }: { doc: Doc; k: KeyFrame; current: boolean; activeLayerId: Id | null; editing: boolean; onEdit: (on: boolean) => void }) {
  const label = keyLabel(k, activeLayerId);
  const target = celToName(k, activeLayerId);
  const all = k.named.map((n) => `${n.name} (${n.layerName})`).join(', ');
  const go = () => {
    goTo(k.frame);
    // Land on the layer the name belongs to, so what you picked is what you draw on.
    const to = k.named.find((n) => n.layerId === activeLayerId) ?? k.named[0];
    if (to && to.layerId !== activeLayerId) store().setUi({ activeLayerId: to.layerId });
  };
  return (
    <li className={`dr-tile${current ? ' is-current' : ''}`} data-frame={k.frame}>
      <button type="button" className="dr-pic" onClick={go} aria-current={current || undefined} aria-label={`${label || 'Drawing'}, frame ${k.frame + 1}`} title={`${all || 'Not named yet'}. Frame ${k.frame + 1}${k.end > k.frame ? `, held to frame ${k.end + 1}` : ''}.`}>
        <Thumb doc={doc} frame={k.frame} />
      </button>
      {editing && target ? (
        <InlineName
          label="Drawing name"
          value={k.named.find((n) => n.celId === target.celId)?.name ?? ''}
          onDone={(v) => {
            onEdit(false);
            if (v !== null) ops.renameCel(target.layerId, target.celId, v);
          }}
        />
      ) : (
        <button type="button" className={`dr-name${label ? '' : ' is-none'}`} onClick={go} onDoubleClick={() => onEdit(true)} title="Double-click to name this drawing">
          {label || `frame ${k.frame + 1}`}
        </button>
      )}
    </li>
  );
}

export function DrawingsPanel() {
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const activeLayerId = useStore((s) => s.ui.activeLayerId);
  const pickedClip = useTl((t) => t.clipId);
  const all = useTl((t) => t.drawingsAll);
  const tick = useTl((t) => t.findTick);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const box = useRef<HTMLInputElement>(null);

  // "Find a drawing" lands here with the cursor in the box.
  useEffect(() => {
    if (consumeFind()) {
      box.current?.focus();
      box.current?.select();
    }
  }, [tick]);

  const clip = workingClip(doc, frame, pickedClip);
  const scoped = clip && !all ? clip : undefined;
  const span = scoped ? clipSpan(scoped) : undefined;
  const list = useMemo(() => keyFrames(doc, span), [doc.layers, doc.length, span?.start, span?.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = query.trim() ? list.filter((k) => keyMatches(k, query)) : list;
  const named = list.filter((k) => k.named.length).length;
  // The picture on screen now: the last one that started at or before this frame.
  const now = list.filter((k) => keyHolds(k, frame)).map((k) => k.frame)[0];
  const boards = artboardsOf(doc).length > 1;

  return (
    <div className="cv-panel dr-panel" data-help="timeline-drawings">
      <div className="dr-head">
        <b>{scoped ? scoped.name : 'The whole animation'}</b>
        <span className="cv-tip">
          {list.length} {list.length === 1 ? 'drawing' : 'drawings'}
          {named ? `, ${named} named` : ''}
        </span>
      </div>
      <div className="cv-row dr-bar">
        <input ref={box} type="search" className="dr-find" aria-label="Find a drawing by name" placeholder="Find a drawing by name" value={query} onChange={(e) => setQuery(e.target.value)} />
        {clip ? (
          <button type="button" className="dr-scope" aria-pressed={all} onClick={() => setTl({ drawingsAll: !all })} title={all ? `Show only the drawings in ${clip.name}` : 'Show every drawing, not just this clip'}>
            {all ? 'This clip' : 'Everything'}
          </button>
        ) : null}
      </div>
      {list.length === 0 ? (
        <Tip stays>Nothing drawn here yet. Each new drawing you make will show up here once, however long you hold it.</Tip>
      ) : shown.length === 0 ? (
        <Tip stays>
          No drawing called "{query.trim()}"{scoped ? ` in ${scoped.name}` : ''}. {scoped ? 'Press Everything to look in the whole animation.' : 'Name one by double-clicking the words under its picture.'}
        </Tip>
      ) : (
        <ul className="dr-grid" aria-label={scoped ? `Drawings in ${scoped.name}` : 'Drawings'}>
          {shown.map((k) => (
            <Tile key={k.frame} doc={doc} k={k} current={k.frame === now} activeLayerId={activeLayerId} editing={editing === k.frame} onEdit={(on) => setEditing(on ? k.frame : null)} />
          ))}
        </ul>
      )}
      {list.length > 0 && !named ? <Tip stays>Double-click the words under a picture to name it, like "eyes sad", then find it again here by name.</Tip> : null}
      {boards && !scoped ? <Tip stays>Each artboard has its own drawings. This is the one that is open.</Tip> : null}
    </div>
  );
}
