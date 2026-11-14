// "Picture size" for joined shots: the first shot's, the largest shot's, or a size typed in. Shared by the Export
// dialog's "All in order, as one" and by Play all in order.
import { useEffect, useState } from 'react';
import { setChoice, useChoice } from '../core/choices';
import { MAX_PICTURE_SIDE, customPicture, pictureSizeFor, setCustomPicture, type PicSize, type PictureSize } from './fit';

const MODES: { id: PictureSize; label: string; title: string }[] = [
  { id: 'first', label: 'First shot', title: 'The picture is the size of the first shot' },
  { id: 'largest', label: 'Largest shot', title: 'The picture is the size of the biggest shot, so none of them has to shrink' },
  { id: 'custom', label: 'Custom', title: 'Type the width and height you want' },
];

function Side({ label, value, onCommit }: { label: string; value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && n >= 1) onCommit(n);
    else setText(String(value));
  };
  return (
    <label className="ab-pic-side">
      <span>{label}</span>
      <input type="number" min={1} max={MAX_PICTURE_SIDE} step={1} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </label>
  );
}

/** `sizes` are the shots' sizes in order (the first one stands in for a custom size nobody has typed yet). */
export function PictureSizeControl({ sizes }: { sizes: readonly PicSize[] }) {
  const mode = useChoice<PictureSize>('artboards.pictureSize');
  const custom = customPicture.use((c) => c);
  const shown = pictureSizeFor(sizes, mode, custom);
  return (
    <div className="ab-pic">
      <span className="ab-pic-label" id="ab-pic-label">
        Picture size
      </span>
      <div className="ex-seg" role="group" aria-labelledby="ab-pic-label">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={mode === m.id ? 'ex-on' : ''} aria-pressed={mode === m.id} title={m.title} onClick={() => setChoice('artboards.pictureSize', m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'custom' && (
        <div className="ab-pic-custom">
          <Side label="Width" value={shown.width} onCommit={(n) => setCustomPicture({ width: n, height: shown.height })} />
          <span aria-hidden>×</span>
          <Side label="Height" value={shown.height} onCommit={(n) => setCustomPicture({ width: shown.width, height: n })} />
          <span className="ex-note">px</span>
        </div>
      )}
    </div>
  );
}
