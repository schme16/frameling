// The Lip sync panel: the mouth on each frame around the playhead as a strip, and a button for every mouth to change it.
import { useState } from 'react';
import { store, useStore } from '../core/store';
import { getCommand } from '../core/registry';
import { goTo } from '../timeline/playback';
import { Icon } from '../ui/icons';
import { openHelp, openSheet } from '../ui/overlays';
import { mouthForLabel, mouthInfo, normLabel } from './chart';
import { layerLabels, layerMouthSymbol, mouthFrameAt, mouthLayers, pickMouthLayer, setMouthAt } from './apply';
import { SymbolThumb } from '../symbols/LibraryPanel';
import './lipsync.css';

const REACH = 5;
const NEXT_KEY = 'frameling.lipsync.next';

/** A colour for each mouth frame, spread round the wheel so neighbours differ. */
export const mouthHue = (index: number): number => (index * 47 + 12) % 360;

/** The short text on a strip cell: "A I" is "AI", "M B P" is "MBP", a long name is cut short. */
export function shortLabel(label: string): string {
  const n = label.replace(/\s+/g, '');
  return n.length > 3 ? n.slice(0, 3) : n;
}

function readNext(): boolean {
  try {
    return localStorage.getItem(NEXT_KEY) === '1';
  } catch {
    return false;
  }
}

function Empty() {
  return (
    <div className="ls-empty">
      <Icon name="mouth" size={28} />
      <p>
        <strong>No mouth yet.</strong> A mouth is a symbol whose frames have names, like <em>A</em>, <em>E</em>, <em>O</em> and <em>M B P</em>. The quickest way to get one is the Lip sync template.
      </p>
      <div className="ls-row">
        <button type="button" className="io-btn io-primary" onClick={() => openSheet('new')}>
          Start from the template
        </button>
        <button type="button" className="io-btn" onClick={() => openHelp('lip-sync')}>
          How it works
        </button>
      </div>
    </div>
  );
}

export function LipSyncPanel() {
  const doc = useStore((s) => s.doc);
  const frame = useStore((s) => s.ui.frame);
  const activeId = useStore((s) => s.ui.activeLayerId);
  const [chosen, setChosen] = useState<string | null>(null);
  const [next, setNext] = useState(readNext);
  if (doc.editing?.length) return <div className="ls-root"><p className="ls-note">Press Done at the top of the canvas to go back to the scene, then lip sync.</p></div>;
  const layers = mouthLayers(doc);
  if (!layers.length) {
    return (
      <div className="ls-root">
        <Empty />
      </div>
    );
  }
  const layer = layers.find((l) => l.id === chosen) ?? pickMouthLayer(doc, activeId)!;
  const labels = layerLabels(doc, layer);
  const mouthId = layerMouthSymbol(doc, layer);
  const here = mouthFrameAt(doc, layer, frame);
  const cells: number[] = [];
  for (let f = frame - REACH; f <= frame + REACH; f++) cells.push(f);

  const pick = (index: number) => {
    store().update(`Mouth on frame ${frame + 1}`, (d) => void setMouthAt(d, layer.id, frame, index));
    if (next && frame + 1 < doc.length) goTo(frame + 1);
  };
  const has = !!doc.audio?.length;

  return (
    <div className="ls-root">
      <div className="ls-head">
        {layers.length > 1 ? (
          <select value={layer.id} onChange={(e) => setChosen(e.target.value)} aria-label="Mouth layer">
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="ls-layer" title="The layer with the mouth">
            <Icon name="mouth" size={14} /> {layer.name}
          </span>
        )}
        <button type="button" className="io-btn ls-auto" disabled={!has} title={has ? 'Listen to the sound and put a mouth on every frame' : 'Add a sound first (File > Import sound)'} onClick={() => getCommand('lipsync.auto')?.run()}>
          Auto lip sync
        </button>
      </div>

      <div className="ls-strip" role="listbox" aria-label="Mouth on each frame around the playhead">
        {cells.map((f) => {
          const idx = f >= 0 && f < doc.length ? mouthFrameAt(doc, layer, f) : -1;
          const label = idx >= 0 ? (labels[idx] ?? `${idx + 1}`) : '';
          return (
            <button
              key={f}
              type="button"
              role="option"
              aria-selected={f === frame}
              disabled={f < 0 || f >= doc.length}
              className={`ls-cell${f === frame ? ' is-now' : ''}${idx < 0 ? ' is-none' : ''}`}
              style={idx >= 0 ? ({ '--hue': mouthHue(idx) } as React.CSSProperties) : undefined}
              title={f >= 0 && f < doc.length ? `Frame ${f + 1}: ${label || 'no mouth'}` : ''}
              onClick={() => goTo(f)}
            >
              <i>{f >= 0 && f < doc.length ? f + 1 : ''}</i>
              <b>{shortLabel(label)}</b>
            </button>
          );
        })}
      </div>

      <p className="ls-now">
        Frame {frame + 1}: <strong>{here >= 0 ? (labels[here] ?? `frame ${here + 1}`) : 'no mouth'}</strong>
        {here >= 0 && mouthForLabel(labels[here] ?? '') ? <span className="io-muted"> ({mouthInfo(mouthForLabel(labels[here])!).sounds})</span> : null}
      </p>

      <div className="ls-buttons" role="group" aria-label="Pick a mouth for this frame">
        {labels.map((label, i) => {
          if (!normLabel(label)) return null;
          const m = mouthForLabel(label);
          return (
            <button
              key={i}
              type="button"
              className={`ls-mouth${mouthId ? ' has-pic' : ''}${here === i ? ' is-on' : ''}`}
              style={{ '--hue': mouthHue(i) } as React.CSSProperties}
              aria-pressed={here === i}
              aria-label={label}
              title={m ? `${label}: ${mouthInfo(m).sounds}` : `${label}: frame ${i + 1} of the mouth`}
              onClick={() => pick(i)}
            >
              {mouthId && <SymbolThumb doc={doc} id={mouthId} frame={i} size={40} className="ls-pic" />}
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <label className="ls-check">
        <input
          type="checkbox"
          checked={next}
          onChange={(e) => {
            setNext(e.target.checked);
            try {
              localStorage.setItem(NEXT_KEY, e.target.checked ? '1' : '0');
            } catch {
              // Not remembered, still works.
            }
          }}
        />
        <span>Go to the next frame after each pick</span>
      </label>
      <p className="ls-note">Click a frame in the strip, then a mouth. Playing the animation shows how it reads.</p>
      <button type="button" className="ls-words" disabled={!has} title="Type what is said, and the mouths line up with the words" onClick={() => getCommand('lipsync.autoWords')?.run()}>
        Know what they say? Type the words...
      </button>
    </div>
  );
}
