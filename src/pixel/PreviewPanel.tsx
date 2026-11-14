// The Preview panel: the animation playing at real size (1x, 2x, 3x or the biggest that fits), crisp, in a loop,
// while you draw. Each frame is drawn once at art size and kept until the document changes, then scaled up with
// nearest neighbour, so playing costs almost nothing.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Doc } from '../core/format';
import { renderFrame } from '../core/render';
import { store, useStore } from '../core/store';
import { rootDoc, sceneOf } from '../core/symbols';
import { activeId, artboardDoc, artboardsOf } from '../artboards/model';
import { goToBoard } from './boards';
import { Icon } from '../ui/icons';
import { Quill, useQuillShown } from '../ui/mascot';
import { line } from '../ui/mascot/lines';
import { QUILL_ART_HEIGHT, quillFits, framesDue, previewIndex, previewPosition, notePreviewFrame, previewBase, previewFrames, previewScale, previewSettings, setPreview, type PreviewZoom } from './preview';
import { boardSlots, boardsBox, pickSprite, pinnedBoard, previewKind, previewPin, slotAt, slotsLength } from './previewBoards';
import './pixel.css';

type Frames = Map<string, OffscreenCanvas>;

/** The frame drawn at art size (one canvas pixel per art pixel), crisp, without reference layers. */
function artFrame(doc: Doc, frame: number, base: number): OffscreenCanvas {
  const c = new OffscreenCanvas(Math.max(1, Math.round(doc.width * base)), Math.max(1, Math.round(doc.height * base)));
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.scale(base, base);
  renderFrame(g, doc, frame, { layerFilter: (l) => !l.reference });
  return c;
}

const artboardsList = (d: Doc) => artboardsOf(d).map((a) => ({ id: a.id, name: a.name, label: a.name }));

function boardTitle(kind: string, name: string, open: boolean, own: boolean): string {
  if (kind === 'sprites') return open ? `${name}: the open sprite. Click another sprite to play it here.` : `Play ${name} here. Click again to follow the open sprite.`;
  return own ? `${name}: jump the preview here` : `${name}: open this board`;
}

const ZOOMS: { value: PreviewZoom; label: string; title: string }[] = [
  { value: 1, label: '1x', title: 'Real size: one art pixel is one screen pixel, as it looks in a game' },
  { value: 2, label: '2x', title: 'Twice the real size' },
  { value: 3, label: '3x', title: 'Three times the real size' },
  { value: 'fit', label: 'Fit', title: 'As big as fits the panel, in whole steps so pixels stay square' },
];

export function PreviewPanel() {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const inset = useRef<HTMLCanvasElement>(null);
  const settings = previewSettings.use((s) => s);
  const doc = useStore((s) => s.doc);
  const mainFrame = useStore((s) => s.ui.frame);
  const mainPlaying = useStore((s) => s.ui.playing);
  const quillOn = useQuillShown();
  const [shown, setShown] = useState(0);
  const [boxSize, setBoxSize] = useState({ w: 240, h: 200 });
  const [jump, setJump] = useState(0);

  // Frames on boards play in order as one animation; on a sheet the picker chooses which sprite plays.
  const root = rootDoc(doc);
  const kind = previewKind(root);
  const slots = useMemo(() => (kind === 'boards' ? boardSlots(root) : []), [root, kind]);
  const total = slotsLength(slots);
  const openId = activeId(root);
  const pin = previewPin.use((p) => p);
  const pinned = kind === 'sprites' ? pinnedBoard(root, pin) : null;
  const playId = pinned && pinned !== openId ? pinned : null;
  const scene = sceneOf(doc, mainFrame);
  const sdoc = playId ? artboardDoc(root, playId) : scene.doc;
  const openSlot = slots.find((b) => b.id === openId);
  // Where the timeline is, in the long animation (boards) or on the sprite being played.
  const atFrame = kind === 'boards' ? (openSlot?.start ?? 0) + Math.min(scene.frame, (openSlot?.length ?? 1) - 1) : playId ? 0 : scene.frame;
  const range = kind === 'boards' ? { start: 0, end: Math.max(0, total - 1), clip: null } : previewFrames(sdoc, settings.range, atFrame);
  const base = previewBase(sdoc);
  const box0 = kind === 'boards' ? boardsBox(root) : { w: sdoc.width, h: sdoc.height };
  const artW = Math.max(1, Math.round(box0.w * base));
  const artH = Math.max(1, Math.round(box0.h * base));
  const source = kind === 'boards' ? root : sdoc;
  // Frames on boards play at the document's speed; a sprite plays at the speed of its own artboard.
  const fps = kind === 'boards' ? root.fps : sdoc.fps;
  const scale = previewScale(settings.zoom, artW, artH, boxSize.w - 16, boxSize.h - 16);
  const showQuill = quillOn && settings.quillForScale && quillFits(scale, artW, artH, boxSize.w, boxSize.h);

  // The panel's size, for Fit.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Frames drawn at art size, thrown away when the document changes.
  const cache = useRef<{ doc: Doc | null; frames: Frames }>({ doc: null, frames: new Map() });
  /** The drawing behind frame `f` of what the preview plays, read fresh from the store. */
  const resolve = (f: number): { owner: Doc; d: Doc; local: number; key: string } => {
    const st = store().get();
    const r = rootDoc(st.doc);
    if (kind === 'boards') {
      const sl = boardSlots(r);
      const at = slotAt(sl, f);
      const id = sl[at.index].id;
      return { owner: r, d: artboardDoc(r, id), local: at.local, key: `${id}:${at.local}` };
    }
    const d = playId ? artboardDoc(r, playId) : sceneOf(st.doc, st.ui.frame).doc;
    const local = Math.max(0, Math.min(d.length - 1, f));
    return { owner: d, d, local, key: String(local) };
  };
  const frameCanvas = (r: { owner: Doc; d: Doc; local: number; key: string }): OffscreenCanvas => {
    if (cache.current.doc !== r.owner) cache.current = { doc: r.owner, frames: new Map() };
    let c = cache.current.frames.get(r.key);
    if (!c) {
      c = artFrame(r.d, r.local, previewBase(r.d));
      cache.current.frames.set(r.key, c);
    }
    return c;
  };

  // Paint one frame onto the visible canvas, scaled up crisply.
  const paint = (f: number) => {
    const el = canvas.current;
    if (!el) return;
    const art = frameCanvas(resolve(f));
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.round(art.width * scale));
    const cssH = Math.max(1, Math.round(art.height * scale));
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    el.style.width = `${cssW}px`;
    el.style.height = `${cssH}px`;
    const g = el.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Pixel art stays crisp; a drawing shrunk to fit is smoothed so it doesn't shimmer.
    g.imageSmoothingEnabled = scale < 1;
    g.clearRect(0, 0, w, h);
    g.drawImage(art, 0, 0, w, h);
    // The little real-size copy in the corner, when the big one isn't already 1x.
    const small = inset.current;
    if (small && scale !== 1) {
      const sw = Math.round(art.width * dpr);
      const sh = Math.round(art.height * dpr);
      if (small.width !== sw || small.height !== sh) {
        small.width = sw;
        small.height = sh;
      }
      small.style.width = `${art.width}px`;
      small.style.height = `${art.height}px`;
      const sg = small.getContext('2d')!;
      sg.imageSmoothingEnabled = false;
      sg.clearRect(0, 0, sw, sh);
      sg.drawImage(art, 0, 0, sw, sh);
    }
  };

  // Playing: step through the range at the document's speed. Paused, or while the timeline itself plays: show the
  // timeline's frame.
  const own = settings.playing && !mainPlaying;
  const frameRef = useRef(range.start);
  useEffect(() => {
    if (!own) {
      frameRef.current = atFrame;
      paint(atFrame);
      setShown(atFrame);
      return;
    }
    if (frameRef.current < range.start || frameRef.current > range.end) frameRef.current = previewPosition(0, range, settings.loop).frame;
    paint(frameRef.current);
    setShown(frameRef.current);
    // Steps taken so far, counted the way the clip plays (backward and back and forth have their own order).
    let idx = previewIndex(frameRef.current, range);
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      const { steps, rest } = framesDue(carry + (now - last), fps);
      carry = rest;
      last = now;
      if (steps) {
        idx += steps;
        const st = previewPosition(idx, range, settings.loop);
        const f = st.frame;
        frameRef.current = f;
        notePreviewFrame();
        paint(f);
        setShown(f);
        if (st.done) {
          // The last pass is done: stop on the frame it holds.
          setPreview({ playing: false });
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own, source, atFrame, jump, range.start, range.end, range.direction, range.plays, settings.loop, scale]);

  const togglePlay = () => setPreview({ playing: !settings.playing });
  const clipNote = range.clip ? `${range.clip}, ` : '';

  // The board strip: which board is playing. Boards: click to jump there (or open it, when paused). Sheet: pick the sprite.
  const playing = kind === 'boards' ? slots[slotAt(slots, shown).index] : undefined;
  const strip = kind === 'boards' ? slots.map((b) => ({ id: b.id, label: b.name.match(/\d+\s*$/)?.[0].trim() ?? '', name: b.name })) : kind === 'sprites' ? artboardsList(root) : [];
  const stripOn = kind === 'boards' ? playing?.id : playId ?? openId;
  const pickBoard = (id: string) => {
    if (kind === 'sprites') {
      frameRef.current = 0;
      pickSprite(root, openId, id);
    } else if (own) {
      frameRef.current = slots.find((b) => b.id === id)?.start ?? 0;
      setJump((j) => j + 1);
    } else {
      goToBoard(id);
    }
  };
  const nameNow = kind === 'boards' ? (slots.every((b) => b.length === 1) ? '' : playing?.name) : kind === 'sprites' ? (artboardsList(root).find((b) => b.id === stripOn)?.name ?? '') : '';
  const lengthNow = kind === 'boards' ? total : sdoc.length;
  const infoText = `${nameNow ? `${nameNow}, ` : ''}${clipNote}frame ${shown + 1} of ${lengthNow}, ${fps} fps, ${artW} x ${artH} ${base !== 1 ? 'art pixels' : 'pixels'}${mainPlaying ? '. Following the timeline.' : ''}`;

  return (
    <div className="cv-panel px-preview" data-help="pixel-preview">
      <div
        className="px-preview-stage"
        ref={box}
        role="button"
        tabIndex={0}
        aria-label={settings.playing ? 'Pause the preview' : 'Play the preview'}
        title={settings.playing ? 'Click to pause' : 'Click to play'}
        onClick={togglePlay}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            togglePlay();
          }
        }}
      >
        <div className="px-preview-row">
          <canvas ref={canvas} className="px-preview-canvas" aria-hidden="true" />
          {showQuill && (
            <span className="px-preview-quill" title={line('pixel.scale.hover')} style={{ height: QUILL_ART_HEIGHT * scale }}>
              <Quill anim="idle" size={QUILL_ART_HEIGHT * scale} />
            </span>
          )}
        </div>
        {scale !== 1 && artW <= 256 && artH <= 256 && (
          <span className="px-preview-inset" title="Real size: one art pixel is one screen pixel">
            <canvas ref={inset} className="px-preview-canvas" aria-hidden="true" />
            <span>1x</span>
          </span>
        )}
      </div>
      {strip.length > 1 && (
        <div className="px-preview-boards" role="group" aria-label={kind === 'boards' ? 'Boards in the preview' : 'Sprite to preview'} data-kind={kind}>
          {strip.map((b, i) => (
            <button key={b.id} type="button" className="px-preview-board" aria-pressed={b.id === stripOn} data-on={b.id === stripOn} data-open={kind === 'sprites' && b.id === openId} title={boardTitle(kind, b.name, b.id === openId, own)} aria-label={b.name} onClick={() => pickBoard(b.id)}>
              {kind === 'boards' ? b.label || i + 1 : b.name}
            </button>
          ))}
        </div>
      )}
      <div className="px-preview-bar">
        <button type="button" className="px-preview-play" aria-pressed={settings.playing} title={settings.playing ? 'Pause the preview' : 'Play the preview'} aria-label={settings.playing ? 'Pause the preview' : 'Play the preview'} data-command="pixel.previewPlay" onClick={togglePlay}>
          <Icon name={settings.playing ? 'pause' : 'play'} size={16} />
        </button>
        <div className="cv-choice px-preview-zoom" role="radiogroup" aria-label="Preview size">
          {ZOOMS.map((z) => (
            <button key={String(z.value)} type="button" role="radio" aria-checked={settings.zoom === z.value} data-on={settings.zoom === z.value} className="cv-choice-btn" title={z.title} onClick={() => setPreview({ zoom: z.value })}>
              {z.label}
            </button>
          ))}
        </div>
        {quillOn && (
          <button type="button" className="px-preview-loop px-preview-scale" aria-pressed={settings.quillForScale} data-on={settings.quillForScale} title="Quill for scale: a tiny Quill stands next to your sprite at the same scale, so you can feel how big it is" aria-label="Quill for scale" onClick={() => setPreview({ quillForScale: !settings.quillForScale })}>
            <Icon name="heart" size={16} />
          </button>
        )}
        <button type="button" className="px-preview-loop" aria-pressed={settings.loop} data-on={settings.loop} title={settings.loop ? 'Looping. Click to play once and stop.' : 'Playing once. Click to loop.'} aria-label="Loop the preview" onClick={() => setPreview({ loop: !settings.loop, playing: true })}>
          <Icon name="loop" size={16} />
        </button>
      </div>
      {kind !== 'boards' && (
      <div className="cv-choice" role="radiogroup" aria-label="What the preview plays">
        <button type="button" role="radio" aria-checked={settings.range === 'all'} data-on={settings.range === 'all'} className="cv-choice-btn" title="Play every frame" onClick={() => setPreview({ range: 'all' })}>
          All frames
        </button>
        <button type="button" role="radio" aria-checked={settings.range === 'clip'} data-on={settings.range === 'clip'} className="cv-choice-btn" disabled={!sdoc.clips.length} title={sdoc.clips.length ? 'Play only the clip the playhead is in (idle, run...)' : 'This animation has no clips yet. Add one in the timeline.'} onClick={() => setPreview({ range: 'clip' })}>
          This clip
        </button>
      </div>
      )}
      {/* One line that never wraps, so the panel keeps its height as the numbers grow. When it is tight, the extras go in
          this order: "Following the timeline", the name and clip, the size, the speed; the frame number stays. */}
      <p className="px-preview-info" aria-live="off" data-one-line title={infoText}>
        {nameNow || clipNote ? (
          <span className="pi-name">
            {nameNow ? `${nameNow}, ` : ''}
            {clipNote}
          </span>
        ) : null}
        <span className="pi-frame">
          frame <span className="pi-n" style={{ minWidth: `${String(lengthNow).length}ch` }}>{shown + 1}</span> of {lengthNow}
        </span>
        <span className="pi-fps">, {fps} fps</span>
        <span className="pi-size">, {artW} x {artH} {base !== 1 ? 'art pixels' : 'pixels'}</span>
        {mainPlaying ? <span className="pi-follow">. Following the timeline.</span> : null}
      </p>
    </div>
  );
}
