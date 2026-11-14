/**
 * The detailed timeline's rows: a layer's drawings as key, hold and empty cells with diamond keys, its tweens with
 * their easing drawn in, and the property rows under an opened layer. The clean timeline uses Grid.tsx's GridRow.
 */
import { memo } from 'react';
import type { Cel, Easing, Layer } from '../core/format';
import { easeLabel, tweenEase } from '../core/ease';
import { nextKey } from '../core/symbols';
import { holdWords, movedWords } from './geometry';
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
  return `${layer.name}: drawing at frame ${c.start + 1}${span}${tw}.${moved} Drag the diamond to retime it, drag the block to move it, drag its end to hold it longer.`;
}

/** One layer's row: keys (solid cell with a diamond), holds (a band with an end cap), tweens (an arrow with the easing). */
export const DetailRow = memo(function DetailRow({ layer, cw, from, to, active, picked, fxKeys, h }: { layer: Layer; cw: number; from: number; to: number; active: boolean; picked: ReadonlySet<string>; fxKeys: Track[] | null; h: number }) {
  const shown: Cel[] = [];
  for (const c of layer.cels) {
    if (c.start > to) break;
    if (c.start + c.length >= from) shown.push(c);
  }
  return (
    <div className={`tl-row tl-drow ${layerColorClass(layer)}${active ? ' is-active' : ''}${layer.visible ? '' : ' is-hidden'}${layer.locked ? ' is-locked' : ''}`} style={{ height: h }} data-layer={layer.id}>
      {shown.map((c) => {
        const next = c.tween ? nextKey(layer, c) : undefined;
        const tweened = !!(c.tween && next);
        const ref = celRef(layer.id, c.id);
        const w = c.length * cw;
        const auto = c.autoHold && c.length > 1;
        return (
          <div
            key={c.id}
            className={`tl-cel tl-dcel${auto ? ' is-auto' : ''}${tweened ? (c.tween?.kind === 'shape' ? ' is-shape' : ' is-tween') : c.tween ? ' is-broken' : ''}${c.length === 1 ? ' is-single' : ''}${c.offset ? ' is-moved' : ''}`}
            data-cel={c.id}
            style={{ left: c.start * cw, width: w }}
            title={celTitle(layer, c, tweened)}
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
            <span className="tl-cel-handle" title="Drag to hold this drawing for longer or shorter" />
          </div>
        );
      })}
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
