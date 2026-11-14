// The Clip flow panel: a box for every clip, arrows for what follows what. Drag a box's dot onto another box to
// connect them, click an arrow to say when it happens, and Try it to watch the flow play.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FLOW_ANY, MAX_FLOW_BLEND, type FlowCondition, type Id } from '../core/format';
import { useStore } from '../core/store';
import { arrowShort, arrowWords, cleanFlow, flowLayout, flowProblems, triggerNames } from '../core/flow';
import { ActionButton, Choice, Tip } from '../canvas/controls';
import { Icon } from '../ui/icons';
import { ClipPlayFields } from '../timeline/ClipPlay';
import { playWords } from '../core/clipPlay';
import { addFlowCondition, addFlowInput, connectClips, deleteFlowCondition, deleteFlowInput, deleteTransition, editFlowCondition, editFlowInput, editTransition, fireTrigger, makeStart, placeBox, setAnyFirstNow, setTryInput, startTrying, stopTrying, subscribeTry, tryingClip, tryValues } from './ops';
import './flow.css';
import { ix } from '../features/flags';

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

const OP_WORDS: { value: FlowCondition['op']; label: string }[] = [
  { value: '>', label: 'is above' },
  { value: '>=', label: 'is at least' },
  { value: '<', label: 'is below' },
  { value: '<=', label: 'is at most' },
  { value: '==', label: 'is' },
  { value: '!=', label: 'is not' },
];

/** A number box that lets you type "0." on the way to "0.5": it only tells the document when what is typed is a number. */
function NumField({ value, onChange, label, min, max, step = 'any' }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number | 'any' }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // Only follow the document when it changed from outside (undo, another arrow).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      className="fl-num"
      aria-label={label}
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

/** The checks on one arrow, each a row: input, how it compares, and what to. */
function Conditions({ id, conditions, inputs }: { id: Id; conditions: FlowCondition[]; inputs: { name: string; kind: 'toggle' | 'number' }[] }) {
  return (
    <div className="fl-conds">
      {conditions.map((c, i) => {
        const known = inputs.some((x) => x.name === c.input);
        const kind = inputs.find((x) => x.name === c.input)?.kind ?? (typeof c.value === 'boolean' ? 'toggle' : 'number');
        const on = typeof c.value === 'boolean' ? (c.op === '!=' ? !c.value : c.value) : true;
        return (
          <div className="fl-cond" key={i} role="group" aria-label={`Check ${i + 1}`}>
            <select aria-label="Input to check" value={c.input} onChange={(e) => editFlowCondition(id, i, { input: e.target.value })}>
              {!known && <option value={c.input}>{c.input} (gone)</option>}
              {inputs.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.name}
                </option>
              ))}
            </select>
            {kind === 'toggle' ? (
              <select aria-label="On or off" value={on ? 'on' : 'off'} onChange={(e) => editFlowCondition(id, i, { op: '==', value: e.target.value === 'on' })}>
                <option value="on">is on</option>
                <option value="off">is off</option>
              </select>
            ) : (
              <>
                <select aria-label="How it compares" value={c.op} onChange={(e) => editFlowCondition(id, i, { op: e.target.value as FlowCondition['op'] })}>
                  {OP_WORDS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <NumField label="The number to compare with" value={typeof c.value === 'number' ? c.value : 0} onChange={(v) => editFlowCondition(id, i, { value: v }, `cond-${id}-${i}`)} />
              </>
            )}
            <button type="button" className="fl-x" aria-label={`Remove check ${i + 1}`} title="Remove this check" onClick={() => deleteFlowCondition(id, i)}>
              <Icon name="close" size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function FlowPanel() {
  const doc = useStore((s) => s.doc);
  const trying = useSyncExternalStore(subscribeTry, tryingClip);
  const [picked, setPicked] = useState<{ kind: 'clip' | 'link'; id: Id } | null>(null);
  const [link, setLink] = useState<{ from: Id; at: P } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: Id; dx: number; dy: number; key: string; moved: boolean } | null>(null);

  if (doc.editing?.length) return <div className="cv-panel cv-options" data-help="clip-flow"><Tip stays>The clip flow belongs to the main scene. Go back out of the symbol to see it.</Tip></div>;
  if (!doc.clips.length) {
    return (
      <div className="cv-panel cv-options fl-panel" data-help="clip-flow">
        <Tip stays>Clip flow decides which clip plays first and what follows what: idle until jump, jump then land, land back to idle. Make some clips first: drag across the clip row at the top of the timeline.</Tip>
      </div>
    );
  }

  const flow = cleanFlow(doc);
  const pos = flowLayout(doc);
  const start = flow.start ?? doc.clips[0].id;
  // The "Any clip" box is there only while an arrow starts from it.
  const anyShown = flow.transitions.some((t) => t.from === FLOW_ANY);
  const shown = Object.entries(pos).filter(([id]) => id !== FLOW_ANY || anyShown).map(([, p]) => p);
  const width = Math.max(280, ...shown.map((p) => p.x + BOX_W + 20));
  const height = Math.max(120, ...shown.map((p) => p.y + BOX_H + 20));
  const inputs = flow.inputs ?? [];
  const values = trying ? tryValues() : {};
  const problems = flowProblems(doc);
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
  const nameOf = (id: Id) => (id === FLOW_ANY ? 'Any clip' : doc.clips.find((c) => c.id === id)?.name ?? '?');
  const triggersNow = trying ? flow.transitions.filter((t) => (t.from === trying || (t.from === FLOW_ANY && t.to !== trying)) && t.when === 'trigger') : [];
  const triggerList = [...new Set(triggersNow.map((t) => t.trigger ?? 'go'))];

  return (
    <div className="cv-panel cv-options fl-panel" data-help="clip-flow">
      <div className="fl-bar">
        {trying ? (
          <>
            <span className="fl-now">
              Playing <b>{nameOf(trying)}</b>
            </span>
            {triggerList.map((name) => (
              <button key={name} type="button" className="fl-trigger" onClick={() => fireTrigger(name)} title={`Fire "${name}"`}>
                {name}
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
      {trying && inputs.length > 0 && (
        <div className="fl-bar fl-try-inputs" role="group" aria-label="Inputs">
          {inputs.map((i) =>
            i.kind === 'toggle' ? (
              <button key={i.name} type="button" className="fl-trigger fl-switch" aria-pressed={values[i.name] === true} onClick={() => setTryInput(i.name, values[i.name] !== true)} title={`Turn ${i.name} ${values[i.name] === true ? 'off' : 'on'}`}>
                {i.name}: {values[i.name] === true ? 'on' : 'off'}
              </button>
            ) : (
              <label key={i.name} className="fl-try-num">
                <span>{i.name}</span>
                <NumField label={`Set ${i.name}`} value={typeof values[i.name] === 'number' ? (values[i.name] as number) : 0} step={0.1} onChange={(v) => setTryInput(i.name, v)} />
              </label>
            ),
          )}
        </div>
      )}
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
            const words = arrowWords(t);
            const short = arrowShort(t);
            const label = short.length > 26 ? short.slice(0, 25) + '…' : short;
            const fade = (t.blend ?? 0) > 0 ? `, fades over ${t.blend} seconds` : '';
            return (
              <g
                key={t.id}
                className="fl-link"
                data-on={on}
                tabIndex={0}
                role="button"
                aria-pressed={on}
                aria-label={`${nameOf(t.from)} to ${nameOf(t.to)}, ${words}${fade}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPicked({ kind: 'link', id: t.id });
                  }
                }}
                onPointerDown={(e) => { e.stopPropagation(); setPicked({ kind: 'link', id: t.id }); }}
              >
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="fl-hit" />
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="fl-line" markerEnd="url(#fl-head)" strokeDasharray={t.when === 'end' ? undefined : '5 4'} />
                <text x={mid.x} y={twoWay ? mid.y + 4 : mid.y - 5} className="fl-label" textAnchor={anchor} aria-hidden="true">
                  {label}
                </text>
              </g>
            );
          })}
          {link && (
            <line x1={pos[link.from].x + BOX_W} y1={pos[link.from].y + BOX_H / 2} x2={link.at.x} y2={link.at.y} className="fl-line fl-drafting" markerEnd="url(#fl-head)" />
          )}
          {anyShown && (
            <g
              className="fl-box fl-any"
              data-on={picked?.kind === 'clip' && picked.id === FLOW_ANY}
              transform={`translate(${pos[FLOW_ANY].x} ${pos[FLOW_ANY].y})`}
              tabIndex={0}
              role="button"
              aria-pressed={picked?.kind === 'clip' && picked.id === FLOW_ANY}
              aria-label="Any clip: arrows from here play from whichever clip is playing"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setPicked({ kind: 'clip', id: FLOW_ANY });
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const q = toSvg(e);
                (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                drag.current = { id: FLOW_ANY, dx: q.x - pos[FLOW_ANY].x, dy: q.y - pos[FLOW_ANY].y, key: `flow-box-any-${Date.now()}`, moved: false };
                setPicked({ kind: 'clip', id: FLOW_ANY });
              }}
            >
              <rect width={BOX_W} height={BOX_H} rx={10} className="fl-rect" strokeDasharray="6 4" />
              <text>
                <tspan x={12} y={19} className="fl-name">
                  Any clip
                </tspan>{' '}
                <tspan x={12} y={35} className="fl-sub">
                  from every clip
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
                  setLink({ from: FLOW_ANY, at: toSvg(e) });
                }}
              >
                <title>Drag onto a clip to play it from any clip</title>
              </circle>
            </g>
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
              ...(sel.from === FLOW_ANY ? [] : [{ value: 'end' as const, label: 'At the end', title: `When ${nameOf(sel.from)} finishes (a looping clip finishes each time round)` }]),
              { value: 'trigger' as const, label: 'On a trigger', title: ix('When the game or Interactives fires a named trigger (a key press, a jump, a hit)', 'When the game fires a named trigger (a key press, a jump, a hit)') },
              { value: 'now' as const, label: 'As soon as', title: 'The moment every check below holds (speed above 0.5, grounded is on)' },
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
          <div className="fl-block">
            <div className="fl-block-head">{sel.when === 'now' ? 'When' : 'Only if'}</div>
            {sel.conditions?.length ? <Conditions id={sel.id} conditions={sel.conditions} inputs={inputs} /> : <p className="cv-tip">{sel.when === 'now' ? 'Add a check, like speed is above 0.5. With none, this arrow never goes.' : 'No checks: it always goes.'}</p>}
            <div className="cv-row cv-wrap">
              <ActionButton onClick={() => addFlowCondition(sel.id)} disabled={!inputs.length} title={inputs.length ? 'Add a check on one of your inputs' : 'Add an input first (below the graph)'}>
                Add a check
              </ActionButton>
            </div>
          </div>
          <label className="fl-trigger-name">
            <span>Fade (seconds)</span>
            <NumField label="Fade between the clips, in seconds" value={sel.blend ?? 0} min={0} max={MAX_FLOW_BLEND} step={0.05} onChange={(v) => editTransition(sel.id, { blend: v }, `blend-${sel.id}`)} />
          </label>
          <Tip>0 is a straight cut. A fade mixes the old clip into the new one. Godot and Interactives fade; Try it cuts.</Tip>
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
            {selClip.id !== start ? <ActionButton onClick={() => makeStart(selClip.id)}>Play this one first</ActionButton> : <Tip stays>This clip plays first (the star).</Tip>}
          </div>
          <div className="cv-row cv-wrap">
            <ActionButton onClick={() => { const id = connectClips(FLOW_ANY, selClip.id); if (id) setPicked({ kind: 'link', id }); }} title="Draws an arrow from Any clip to this one, so it can play from anywhere (a hurt clip)">
              Play this from any clip
            </ActionButton>
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
      ) : picked?.kind === 'clip' && picked.id === FLOW_ANY ? (
        <div className="fl-edit">
          <div className="fl-edit-head">
            <b>Any clip</b>
          </div>
          <Tip stays>Arrows from here play from whichever clip is playing, like a hurt clip. Drag its dot onto a clip, or click an arrow to say when.</Tip>
          {flow.transitions.some((t) => t.from !== FLOW_ANY) && (
            <Choice
              label="If a clip's own arrow is ready too"
              value={flow.anyFirst === false ? 'own' : 'any'}
              options={[
                { value: 'any', label: 'Any clip goes first', title: 'Hurt cuts in on whatever is playing' },
                { value: 'own', label: "The clip's own goes first", title: 'A clip finishes its own business first' },
              ]}
              onChange={(v) => setAnyFirstNow(v === 'any')}
            />
          )}
        </div>
      ) : (
        <Tip>Drag a clip's dot onto another clip to say what comes next. Click an arrow to choose when: at the end, on a trigger like "jump", or as soon as an input says so. The star plays first.</Tip>
      )}
      <div className="fl-block fl-inputs" role="group" aria-label="Inputs">
        <div className="fl-block-head">Inputs</div>
        {inputs.length === 0 && <p className="cv-tip">Inputs are values your game sets while it plays, like speed or grounded. Arrows can check them.</p>}
        {inputs.map((i) => (
          <div className="fl-input" key={i.name}>
            <input
              type="text"
              className="fl-input-name"
              title={i.kind === 'toggle' ? 'An on/off input' : 'A number input'}
              aria-label={`Name of the ${i.kind === 'toggle' ? 'on/off' : 'number'} input ${i.name}`}
              defaultValue={i.name}
              key={i.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== i.name && editFlowInput(i.name, { name: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
            />
            {i.kind === 'toggle' ? (
              <label className="fl-input-start">
                <input type="checkbox" checked={i.start === true} onChange={(e) => editFlowInput(i.name, { start: e.target.checked })} />
                <span>starts on</span>
              </label>
            ) : (
              <label className="fl-input-start">
                <span>starts at</span>
                <NumField label={`What ${i.name} starts as`} value={typeof i.start === 'number' ? i.start : 0} onChange={(v) => editFlowInput(i.name, { start: v }, `start-${i.name}`)} />
              </label>
            )}
            <button type="button" className="fl-x" aria-label={`Remove input ${i.name}`} title="Remove this input" onClick={() => deleteFlowInput(i.name)}>
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
        <div className="cv-row cv-wrap">
          <ActionButton onClick={() => addFlowInput('toggle')} title="A switch the game sets: grounded, hurt, crouching">
            Add on/off
          </ActionButton>
          <ActionButton onClick={() => addFlowInput('number')} title="A number the game sets: speed, health">
            Add number
          </ActionButton>
        </div>
      </div>
      {problems.map((w) => (
        <p key={w} className="cv-tip fl-problem" role="status">
          {w}
        </p>
      ))}
    </div>
  );
}
