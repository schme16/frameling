// The Clip flow panel: a box for every clip, arrows for what follows what. Drag a box's dot onto another box to
// connect them, click an arrow to say when it happens, and Try it to watch the flow play.
import { useRef, useState, useSyncExternalStore } from 'react';
import type { Id } from '../core/format';
import { useStore } from '../core/store';
import { cleanFlow, flowLayout, triggerNames } from '../core/flow';
import { ActionButton, Choice, Tip } from '../canvas/controls';
import { Icon } from '../ui/icons';
import { ClipPlayFields } from '../timeline/ClipPlay';
import { playWords } from '../core/clipPlay';
import { connectClips, deleteTransition, editTransition, fireTrigger, makeStart, placeBox, startTrying, stopTrying, subscribeTry, tryingClip } from './ops';
import './flow.css';

const BOX_W = 132;
const BOX_H = 44;

type P = { x: number; y: number };

/** Where a line from box a to box b leaves a and meets b (on their edges), nudged sideways for a two-way pair. */
function arrowEnds(a: P, b: P, bend: number): { from: P; to: P; mid: P; nx: number } {
  const ca = { x: a.x + BOX_W / 2, y: a.y + BOX_H / 2 };
  const cb = { x: b.x + BOX_W / 2, y: b.y + BOX_H / 2 };
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const edge = (c: P, sx: number, sy: number) => {
    const tx = sx ? BOX_W / 2 / Math.abs(sx) : Infinity;
    const ty = sy ? BOX_H / 2 / Math.abs(sy) : Infinity;
    const t = Math.min(tx, ty);
    return { x: c.x + sx * t + nx * bend, y: c.y + sy * t + ny * bend };
  };
  const ux = dx / len;
  const uy = dy / len;
  const from = edge(ca, ux, uy);
  const to = edge(cb, -ux, -uy);
  // The label sits beside its own line, so the two lines of a two-way pair keep their labels apart.
  const off = bend ? bend + 8 : 0;
  return { from, to, mid: { x: (from.x + to.x) / 2 + nx * off, y: (from.y + to.y) / 2 + ny * off }, nx };
}

export function FlowPanel() {
  const doc = useStore((s) => s.doc);
  const trying = useSyncExternalStore(subscribeTry, tryingClip);
  const [picked, setPicked] = useState<{ kind: 'clip' | 'link'; id: Id } | null>(null);
  const [link, setLink] = useState<{ from: Id; at: P } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: Id; dx: number; dy: number; key: string; moved: boolean } | null>(null);

  if (doc.editing?.length) return <div className="cv-panel cv-options" data-help="clip-flow"><Tip>The clip flow belongs to the main scene. Go back out of the symbol to see it.</Tip></div>;
  if (!doc.clips.length) {
    return (
      <div className="cv-panel cv-options fl-panel" data-help="clip-flow">
        <Tip>Clip flow decides which clip plays first and what follows what: idle until jump, jump then land, land back to idle. Make some clips first: drag across the clip row at the top of the timeline.</Tip>
      </div>
    );
  }

  const flow = cleanFlow(doc);
  const pos = flowLayout(doc);
  const start = flow.start ?? doc.clips[0].id;
  const width = Math.max(280, ...Object.values(pos).map((p) => p.x + BOX_W + 20));
  const height = Math.max(120, ...Object.values(pos).map((p) => p.y + BOX_H + 20));
  // The graph scales down to fit a narrow panel, so pointer positions go through the SVG's own transform.
  const toSvg = (e: { clientX: number; clientY: number }): P => {
    const m = svg.current!.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const boxAt = (p: P) => doc.clips.find((c) => p.x >= pos[c.id].x && p.x <= pos[c.id].x + BOX_W && p.y >= pos[c.id].y && p.y <= pos[c.id].y + BOX_H);

  const sel = picked?.kind === 'link' ? flow.transitions.find((t) => t.id === picked.id) : undefined;
  const selClip = picked?.kind === 'clip' ? doc.clips.find((c) => c.id === picked.id) : undefined;
  const nameOf = (id: Id) => doc.clips.find((c) => c.id === id)?.name ?? '?';
  const triggersNow = trying ? flow.transitions.filter((t) => t.from === trying && t.when === 'trigger') : [];

  return (
    <div className="cv-panel cv-options fl-panel" data-help="clip-flow">
      <div className="fl-bar">
        {trying ? (
          <>
            <span className="fl-now">
              Playing <b>{nameOf(trying)}</b>
            </span>
            {triggersNow.map((t) => (
              <button key={t.id} type="button" className="fl-trigger" onClick={() => fireTrigger(t.trigger ?? 'go')} title={`Fire "${t.trigger}": go to ${nameOf(t.to)}`}>
                {t.trigger}
              </button>
            ))}
            <ActionButton onClick={() => stopTrying()}>Stop</ActionButton>
          </>
        ) : (
          <ActionButton onClick={() => startTrying()} title="Plays the first clip, then follows the arrows as clips end. Trigger buttons appear while it plays.">
            Try it
          </ActionButton>
        )}
      </div>
      <div className="fl-scroll">
        <svg
          ref={svg}
          className="fl-graph"
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={{ maxWidth: width, aspectRatio: `${width} / ${height}` }}
          role="group"
          aria-label="Clip flow"
          onPointerMove={(e) => {
            if (link) setLink({ ...link, at: toSvg(e) });
            const d = drag.current;
            if (d) {
              const p = toSvg(e);
              d.moved = true;
              placeBox(d.id, p.x - d.dx, p.y - d.dy, d.key);
            }
          }}
          onPointerUp={(e) => {
            if (link) {
              const target = boxAt(toSvg(e));
              if (target && target.id !== link.from) {
                const id = connectClips(link.from, target.id);
                if (id) setPicked({ kind: 'link', id });
              }
              setLink(null);
            }
            drag.current = null;
          }}
          onPointerDown={(e) => {
            if (e.target === svg.current) setPicked(null);
          }}
        >
          <defs>
            <marker id="fl-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" className="fl-head" />
            </marker>
          </defs>
          {flow.transitions.map((t) => {
            const a = pos[t.from];
            const b = pos[t.to];
            const twoWay = flow.transitions.some((u) => u.from === t.to && u.to === t.from);
            const { from, to, mid, nx } = arrowEnds(a, b, twoWay ? 7 : 0);
            const anchor = twoWay && nx > 0.3 ? 'start' : twoWay && nx < -0.3 ? 'end' : 'middle';
            const on = picked?.kind === 'link' && picked.id === t.id;
            const label = t.when === 'end' ? 'at the end' : `on ${t.trigger}`;
            return (
              <g
                key={t.id}
                className="fl-link"
                data-on={on}
                tabIndex={0}
                role="button"
                aria-pressed={on}
                aria-label={`${nameOf(t.from)} to ${nameOf(t.to)}, ${label}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPicked({ kind: 'link', id: t.id });
                  }
                }}
                onPointerDown={(e) => { e.stopPropagation(); setPicked({ kind: 'link', id: t.id }); }}
              >
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="fl-hit" />
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="fl-line" markerEnd="url(#fl-head)" strokeDasharray={t.when === 'trigger' ? '5 4' : undefined} />
                <text x={mid.x} y={twoWay ? mid.y + 4 : mid.y - 5} className="fl-label" textAnchor={anchor} aria-hidden="true">
                  {label}
                </text>
              </g>
            );
          })}
          {link && (
            <line x1={pos[link.from].x + BOX_W} y1={pos[link.from].y + BOX_H / 2} x2={link.at.x} y2={link.at.y} className="fl-line fl-drafting" markerEnd="url(#fl-head)" />
          )}
          {doc.clips.map((c) => {
            const p = pos[c.id];
            const on = picked?.kind === 'clip' && picked.id === c.id;
            return (
              <g
                key={c.id}
                className="fl-box"
                data-on={on}
                data-playing={trying === c.id}
                transform={`translate(${p.x} ${p.y})`}
                tabIndex={0}
                role="button"
                aria-pressed={on}
                aria-label={`${c.name} ${Math.abs(c.end - c.start) + 1} frames${playWords(c) ? ', ' + playWords(c) : ''}${c.id === start ? ', plays first' : ''}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPicked({ kind: 'clip', id: c.id });
                  }
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const q = toSvg(e);
                  (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                  drag.current = { id: c.id, dx: q.x - p.x, dy: q.y - p.y, key: `flow-box-${c.id}-${Date.now()}`, moved: false };
                  setPicked({ kind: 'clip', id: c.id });
                }}
              >
                <rect width={BOX_W} height={BOX_H} rx={10} className="fl-rect" />
                {c.id === start && (
                  <text x={10} y={18} className="fl-star" aria-hidden="true">
                    ★
                  </text>
                )}
                {/* One text with a real space between the lines, so the visible words read the same as its name. */}
                <text>
                  <tspan x={c.id === start ? 26 : 12} y={19} className="fl-name">
                    {c.name.length > 14 ? c.name.slice(0, 13) + '…' : c.name}
                  </tspan>{' '}
                  <tspan x={12} y={35} className="fl-sub">
                    {Math.abs(c.end - c.start) + 1} frames{c.loop ? ', loops' : ''}
                  </tspan>
                </text>
                <circle
                  cx={BOX_W}
                  cy={BOX_H / 2}
                  r={7}
                  className="fl-port"
                  aria-hidden="true"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                    setLink({ from: c.id, at: toSvg(e) });
                  }}
                >
                  <title>Drag onto another clip to go there next</title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
      {sel ? (
        <div className="fl-edit">
          <div className="fl-edit-head">
            <b>{nameOf(sel.from)}</b> <Icon name="tween" size={14} /> <b>{nameOf(sel.to)}</b>
          </div>
          <Choice
            label="Goes there"
            value={sel.when}
            options={[
              { value: 'end', label: 'At the end', title: `When ${nameOf(sel.from)} finishes (a looping clip finishes each time round)` },
              { value: 'trigger', label: 'On a trigger', title: 'When the game or Interactives fires a named trigger (a key press, a jump, a hit)' },
            ]}
            onChange={(v) => editTransition(sel.id, { when: v })}
          />
          {sel.when === 'trigger' && (
            <label className="fl-trigger-name">
              <span>Trigger name</span>
              <input
                type="text"
                value={sel.trigger ?? ''}
                list="fl-trigger-names"
                aria-label="Trigger name"
                onChange={(e) => editTransition(sel.id, { trigger: e.target.value }, `trigger-${sel.id}`)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <datalist id="fl-trigger-names">
                {triggerNames(doc).map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
          )}
          <div className="cv-row cv-wrap">
            <ActionButton onClick={() => { deleteTransition(sel.id); setPicked(null); }}>Remove this arrow</ActionButton>
          </div>
        </div>
      ) : selClip ? (
        <div className="fl-edit">
          <div className="fl-edit-head">
            <b>{selClip.name}</b>
          </div>
          <div className="cv-row cv-wrap">
            {selClip.id !== start ? <ActionButton onClick={() => makeStart(selClip.id)}>Play this one first</ActionButton> : <Tip>This clip plays first (the star).</Tip>}
          </div>
          <ClipPlayFields clip={selClip} />
          {doc.clips.length > 1 && (
            <label className="fl-trigger-name">
              <span>Then go to</span>
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value && connectClips(selClip.id, e.target.value);
                  if (id) setPicked({ kind: 'link', id });
                }}
              >
                <option value="">Pick a clip...</option>
                {doc.clips
                  .filter((c) => c.id !== selClip.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <Tip>Drag its dot onto another clip to say what comes next, or pick one in Then go to.</Tip>
        </div>
      ) : (
        <Tip>Drag a clip's dot onto another clip to say what comes next. Click an arrow to choose when: at the end, or on a trigger like "jump". The star plays first.</Tip>
      )}
    </div>
  );
}
