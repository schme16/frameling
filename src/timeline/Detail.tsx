/**
 * The detailed timeline's rows: a layer's drawings as key, hold and empty cells with diamond keys, its tweens with
 * their easing drawn in, and the property rows under an opened layer. The clean timeline uses Grid.tsx's GridRow.
 */
import { memo } from 'react';
import type { Cel, Easing, Id, Layer } from '../core/format';
import type { DrawingUse } from '../core/sharedDrawings';
import { easeLabel, tweenEase } from '../core/ease';
import { nextKey } from '../core/symbols';
import { celLabelBox, holdWords, MIN_LABEL_W, movedWords, thinCels } from './geometry';
import { InlineName } from './Menu';
import * as ops from './ops';
import { setTl, useTl } from './state';
import { SharedMark, sharedTitle } from './SharedMark';
import { celRef, type Track } from './tracks';

/** The colour class for a layer: its label, or its kind's own colour. */
export function layerColorClass(layer: Layer): string {
  if (layer.label) return `tl-lc-${layer.label}`;
  if (layer.kind === 'vector' && layer.rig) return 'tl-lc-bones';
  return `tl-lc-${layer.kind}`;
}

/** The easing as a little curve, drawn inside a tween span (or bigger elsewhere). */
export function EaseCurve({ ease: e, slice, width, height = 12 }: { ease: Easing | undefined; slice?: [number, number]; width: number; height?: number }) {
  const n = Math.max(6, Math.min(40, Math.round(width / 5)));
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const v = tweenEase({ ease: e ?? 'linear', slice }, t);
    pts.push(`${(t * width).toFixed(1)},${(1 + (height - 2) * (1 - v)).toFixed(1)}`);
  }
  return (
    <svg className="tl-ease" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.join(' ')} />
    </svg>
  );
}

function celTitle(layer: Layer, c: Cel, tweened: boolean): string {
  const span = c.length > 1 ? `, held for ${holdWords(c.length)}` : '';
  const tw = tweened && c.tween ? `. ${c.tween.kind === 'shape' ? 'Melts into the next drawing (shape tween)' : 'Moves to the next drawing (tween)'}, ${easeLabel(c.tween.ease).toLowerCase()}` : '';
  const moved = c.offset ? ` ${movedWords(c.offset)}` : '';
  return `${layer.name}: ${c.name ? '"' + c.name + '", ' : ''}drawing at frame ${c.start + 1}${span}${tw}.${moved} Drag the diamond to retime it, drag the block to move it, drag its end to hold it longer.`;
}

/** One layer's row: keys (solid cell with a diamond), holds (a band with an end cap), tweens (an arrow with the easing). */
/**
 * A drawing's name on its row, just after the key. It sits beside the cel (not in it) so it can run on over the empty
 * frames after a short drawing; a click goes through it to the frame. Being renamed it is a name box.
 */
export function CelName({ layer, cel, next, cw }: { layer: Layer; cel: Cel; next: Cel | undefined; cw: number }) {
  const editing = useTl((t) => t.editing?.kind === 'cel' && t.editing.id === cel.id);
  const box = celLabelBox(cel, next?.start, cw);
  if (editing) {
    return (
      <span className="tl-cel-name is-editing" style={{ left: box.left - 3, width: Math.max(box.width, 120) }}>
        <InlineName
          label="Drawing name"
          value={cel.name ?? ''}
          onDone={(v) => {
            setTl({ editing: null });
            if (v !== null) ops.renameCel(layer.id, cel.id, v);
          }}
        />
      </span>
    );
  }
  if (!cel.name || box.width < MIN_LABEL_W) return null;
  return (
    <span className="tl-cel-name" style={{ left: box.left, maxWidth: box.width }} aria-hidden="true">
      {cel.name}
    </span>
  );
}

export const DetailRow = memo(function DetailRow({ layer, cw, from, to, active, picked, fxKeys, h, shared }: { layer: Layer; cw: number; from: number; to: number; active: boolean; picked: ReadonlySet<string>; fxKeys: Track[] | null; h: number; shared: ReadonlyMap<Id, DrawingUse> }) {
  const shown: Cel[] = [];
  for (const c of layer.cels) {
    if (c.start > to) break;
    if (c.start + c.length >= from) shown.push(c);
  }
  return (
    <div className={`tl-row tl-drow ${layerColorClass(layer)}${active ? ' is-active' : ''}${layer.visible ? '' : ' is-hidden'}${layer.locked ? ' is-locked' : ''}`} style={{ height: h }} data-layer={layer.id}>
      {thinCels(shown, cw).map((p) => {
        const c = p.cel;
        // A band of tiny drawings is drawn as one plain block: no diamond, no tween arrow.
        if (p.dense)
          return <div key={c.id} className="tl-cel tl-dcel is-dense" data-cel={c.id} style={{ left: p.left, width: p.right - p.left }} title={`${p.count} short drawings. Zoom in to see each one.`} />;
        const next = c.tween ? nextKey(layer, c) : undefined;
        const tweened = !!(c.tween && next);
        const ref = celRef(layer.id, c.id);
        const w = p.right - p.left;
        const auto = c.autoHold && c.length > 1;
        const use = shared.get(c.drawingId);
        return (
          <div
            key={c.id}
            className={`tl-cel tl-dcel${auto ? ' is-auto' : ''}${use ? ' is-shared' : ''}${c.offset ? ' is-moved' : ''}${tweened ? (c.tween?.kind === 'shape' ? ' is-shape' : ' is-tween') : c.tween ? ' is-broken' : ''}${c.length === 1 ? ' is-single' : ''}${w < 8 ? ' is-thin' : ''}`}
            data-cel={c.id}
            style={{ left: p.left, width: w }}
            title={sharedTitle(use, celTitle(layer, c, tweened))}
          >
            <span className={`tl-dkey-cell${picked.has(ref) ? ' is-picked' : ''}`} style={{ width: cw }} data-key={ref}>
              <span className={`tl-dkey${picked.has(ref) ? ' is-picked' : ''}`} />
            </span>
            {tweened && w - cw > 26 ? (
              <span className="tl-dspan" style={{ left: cw, width: w - cw }}>
                <EaseCurve ease={c.tween!.ease} slice={c.tween!.slice} width={Math.max(8, w - cw - 10)} />
              </span>
            ) : null}
            {!tweened && c.length > 1 ? <span className="tl-dend" style={{ width: Math.min(cw, 10) }} /> : null}
            {use ? <SharedMark use={use} width={w} at={cw + 3} /> : null}
            <span className="tl-cel-handle" title="Drag to hold this drawing for longer or shorter" />
          </div>
        );
      })}
      {thinCels(shown, cw)
        .filter((p) => !p.dense)
        .map((p, i, list) => (
          <CelName key={`n${p.cel.id}`} layer={layer} cel={p.cel} next={list[i + 1]?.cel} cw={cw} />
        ))}
      {fxKeys
        ? fxKeys.flatMap((t) =>
            t.keys
              .filter((k) => k.frame >= from && k.frame <= to)
              .map((k) => <span key={k.ref} className={`tl-fxdot${picked.has(k.ref) ? ' is-picked' : ''}`} data-key={k.ref} style={{ left: (k.frame + 0.5) * cw }} title={`${t.label} key at frame ${k.frame + 1}: ${k.value}. Open the layer (the arrow) to see its row.`} />),
          )
        : null}
    </div>
  );
});

/** A property row under an opened layer: its keys as diamonds, with a line (and the easing) where it changes smoothly. */
export const PropRow = memo(function PropRow({ layer, track, cw, from, to, picked, h, last }: { layer: Layer; track: Track; cw: number; from: number; to: number; picked: ReadonlySet<string>; h: number; last: boolean }) {
  return (
    <div className={`tl-row tl-prow ${layerColorClass(layer)}${layer.visible ? '' : ' is-hidden'}${last ? ' is-last' : ''}`} style={{ height: h }} data-layer={layer.id} data-track={track.id}>
      {track.spans
        .filter((s) => s.to >= from && s.from <= to)
        .map((s) => {
          const w = (s.to - s.from) * cw;
          return (
            <span key={`s${s.from}`} className={`tl-pspan is-${s.kind}`} style={{ left: (s.from + 0.5) * cw, width: w }} title={s.kind === 'even' ? 'Changes evenly between these keys' : `In-betweens: ${s.ease ? easeLabel(s.ease).toLowerCase() : 'steady'}`}>
              {s.kind !== 'even' && w > 30 ? <EaseCurve ease={s.ease} slice={s.slice} width={w - 14} height={10} /> : null}
            </span>
          );
        })}
      {track.keys
        .filter((k) => k.frame >= from && k.frame <= to)
        .map((k) => (
          <span
            key={k.ref + k.frame}
            className={`tl-pkey${picked.has(k.ref) ? ' is-picked' : ''}${k.ref.startsWith('c:') ? ' is-drawing' : ''}`}
            data-key={k.ref}
            style={{ left: (k.frame + 0.5) * cw }}
            title={`${track.label} at frame ${k.frame + 1}: ${k.value}.${k.ref.startsWith('c:') ? ' This key belongs to the drawing there, so moving it moves the whole drawing.' : ''} Drag to retime, Shift+click to pick more, Delete removes.`}
          />
        ))}
    </div>
  );
});
