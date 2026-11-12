// "Pixel time! What are we making?": Quill's chooser for a new pixel file. Four answers with tiny diagrams (One picture,
// An animation, Frames on boards, Sprites on a sheet), then a size row. Each answer builds a ready document. With
// Quill off, the New sheet shows the same four as starter cards instead (PixelStarters).
import { useState } from 'react';
import type { SpriteWay } from '../core/format';
import { store } from '../core/store';
import { askAboutUnsavedChanges } from '../io/document';
import { Modal, mountModal } from '../io/mount';
import { Quill, QuillSays, useQuillShown } from '../ui/mascot';
import { line } from '../ui/mascot/lines';
import { openSheet } from '../ui/overlays';
import { toast } from '../ui/toast';
import { newSpriteDoc, SIZE_CHOICES, WAYS, type WayInfo } from './way';
import { WayDiagram } from './WayDiagrams';
import './way.css';

/** Makes the sprite and opens it (asking about unsaved changes first). Returns false when the person said no. */
export async function startSprite(way: SpriteWay, width: number, height: number): Promise<boolean> {
  if (!(await askAboutUnsavedChanges())) return false;
  store().load(newSpriteDoc({ way, width, height }));
  toast(line('pixel.chooser.ready'), { kind: 'success' });
  return true;
}

/** Quill's line for the card you picked. */
function pickedLine(way: SpriteWay): string {
  switch (way) {
    case 'picture':
      return line('pixel.chooser.picture');
    case 'animation':
      return line('pixel.chooser.animation');
    case 'boards':
      return line('pixel.chooser.boards');
    default:
      return line('pixel.chooser.sheet');
  }
}

const ASK: Record<SpriteWay, string> = {
  picture: 'How big is the picture?',
  animation: 'How big is each frame?',
  boards: 'How big is each frame?',
  sheet: 'How big is each sprite?',
};

const clamp = (n: number) => (Number.isFinite(n) ? Math.max(1, Math.min(512, Math.round(n))) : 32);

/** The four cards, used by the chooser and by the starter cards. */
export function WayCards({ value, onPick, onStart }: { value: SpriteWay | null; onPick: (w: SpriteWay) => void; onStart?: (w: SpriteWay) => void }) {
  return (
    <div className="px-way-cards" role="radiogroup" aria-label="What are we making?">
      {WAYS.map((w: WayInfo) => (
        <button
          key={w.id}
          type="button"
          role="radio"
          aria-checked={value === w.id}
          className={`px-way-card${value === w.id ? ' is-chosen' : ''}`}
          data-way={w.id}
          onClick={() => onPick(w.id)}
          onDoubleClick={() => onStart?.(w.id)}
        >
          <span className="px-way-art">
            <WayDiagram way={w.id} size={150} />
          </span>
          <strong>{w.name}</strong>
          {w.tag && <span className="px-way-tag">{w.tag}</span>}
          <span className="px-way-blurb">{w.blurb}</span>
        </button>
      ))}
    </div>
  );
}

/** The size row: chips for the usual sizes, and your own. */
export function SizeRow({ label, size, onSize }: { label: string; size: { w: number; h: number }; onSize: (s: { w: number; h: number }) => void }) {
  const preset = SIZE_CHOICES.some((c) => c.w === size.w && c.h === size.h);
  const [own, setOwn] = useState(!preset);
  return (
    <div className="px-size-row">
      <span className="px-size-label">{label}</span>
      <div className="px-size-chips" role="radiogroup" aria-label={label}>
        {SIZE_CHOICES.map((c) => (
          <button key={c.w} type="button" role="radio" aria-checked={!own && size.w === c.w && size.h === c.h} className="px-size-chip" onClick={() => (setOwn(false), onSize({ w: c.w, h: c.h }))}>
            {c.w} x {c.h}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={own} className="px-size-chip" onClick={() => setOwn(true)}>
          Your own size
        </button>
      </div>
      {own && (
        <span className="px-size-own">
          <input type="number" min={1} max={512} aria-label="Width in pixels" value={size.w || ''} onChange={(e) => onSize({ ...size, w: Number(e.target.value) })} />
          <span aria-hidden="true">x</span>
          <input type="number" min={1} max={512} aria-label="Height in pixels" value={size.h || ''} onChange={(e) => onSize({ ...size, h: Number(e.target.value) })} />
          <span className="io-muted">pixels</span>
        </span>
      )}
    </div>
  );
}

function Chooser({ close }: { close: () => void }) {
  const quill = useQuillShown();
  const [way, setWay] = useState<SpriteWay | null>(null);
  const [size, setSize] = useState({ w: 32, h: 32 });
  const start = async (w: SpriteWay | null = way) => {
    if (await startSprite(w ?? 'animation', clamp(size.w), clamp(size.h))) close();
  };
  return (
    <Modal title="New pixel art" onClose={close} wide className="px-chooser">
      <div className="px-chooser-head">
        {quill && <Quill anim={[{ anim: 'wave', hold: 1600 }, { anim: 'idle' }]} size={96} />}
        <div>
          <h2>{line('pixel.chooser.title')}</h2>
          <p>{line('pixel.chooser.lead')}</p>
        </div>
      </div>
      <div className="io-body">
        <WayCards
          value={way}
          onPick={setWay}
          onStart={(w) => {
            setWay(w);
            void start(w);
          }}
        />
        <SizeRow label={ASK[way ?? 'animation']} size={size} onSize={setSize} />
        <QuillSays side="left" anim={way ? 'cheer' : 'think'} size={56} className="px-chooser-says">
          <span aria-live="polite">{way ? pickedLine(way) : line('pixel.chooser.unsure')}</span>
        </QuillSays>
      </div>
      <div className="io-foot">
        <button
          type="button"
          className="io-btn"
          onClick={() => {
            close();
            openSheet('new');
          }}
        >
          Back
        </button>
        <button type="button" className="io-btn io-primary" data-autofocus="" disabled={!way} onClick={() => void start()}>
          Start
        </button>
      </div>
    </Modal>
  );
}

/** Opens Quill's pixel chooser. */
export function openPixelChooser(): void {
  mountModal((close) => <Chooser close={close} />);
}

/** With Quill off: the same four ways as plain starter cards on the New sheet, with a size row. */
export function PixelStarters({ onMade }: { onMade: () => void }) {
  const [size, setSize] = useState({ w: 32, h: 32 });
  return (
    <section className="px-starters" aria-label="Pixel art starters" data-help="pixel-new">
      <h3>Pixel art</h3>
      <WayCards
        value={null}
        onPick={(w) => void startSprite(w, clamp(size.w), clamp(size.h)).then((ok) => ok && onMade())}
      />
      <SizeRow label="How big?" size={size} onSize={setSize} />
    </section>
  );
}
