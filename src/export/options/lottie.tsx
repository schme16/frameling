// What a Lottie export asks: the kind of file, the dotLottie layout and how pictures made from effects are stored.
import type { ExportUiProps } from '../registry';
import { bakesEffects, docFeatures, hasSoftOrShadow } from '../carries';
import { FILE_CHOICES, LAYOUT_CHOICES, PICTURE_CHOICES } from '../lottie-choices';
import { Check } from './controls';
import { Loop } from './playback';

export function LottieOptions(p: ExportUiProps) {
  const { s, set, doc } = p;
  return (
    <>
      <p className="ex-note">No size to pick: shapes stay shapes, so a Lottie player draws it sharp at whatever size it's shown.</p>
      <fieldset>
        <legend>File type</legend>
        <div className="ex-seg">
          {FILE_CHOICES.map((c) => (
            <button key={c.id} type="button" className={(s.lottieFile ?? 'json') === c.id ? 'ex-on' : ''} aria-pressed={(s.lottieFile ?? 'json') === c.id} onClick={() => set({ lottieFile: c.id })}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="ex-note">{FILE_CHOICES.find((c) => c.id === (s.lottieFile ?? 'json'))!.note}</p>
      </fieldset>
      {s.lottieFile === 'dotlottie' && (
        <fieldset>
          <legend>dotLottie layout</legend>
          <div className="ex-seg">
            {LAYOUT_CHOICES.map((c) => (
              <button key={c.id} type="button" className={(s.dotLottieVersion ?? 2) === c.id ? 'ex-on' : ''} aria-pressed={(s.dotLottieVersion ?? 2) === c.id} onClick={() => set({ dotLottieVersion: c.id === 2 ? undefined : c.id })}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="ex-note">{LAYOUT_CHOICES.find((c) => c.id === (s.dotLottieVersion ?? 2))!.note}</p>
        </fieldset>
      )}
      {s.lottieFile === 'dotlottie' && (
        <fieldset>
          <legend>Playback</legend>
          <Loop {...p} />
        </fieldset>
      )}
      {hasSoftOrShadow(docFeatures(doc)) && (
        <Check checked={s.lottieSoft === 'pictures'} onChange={(v) => set({ lottieSoft: v ? 'pictures' : undefined })}>
          Draw Soften and Shadow as pictures, so every player shows them (a bigger file)
        </Check>
      )}
      {(bakesEffects(doc, 'lottie') || (s.lottieSoft === 'pictures' && hasSoftOrShadow(docFeatures(doc)))) && (
        <fieldset>
          <legend>Pictures from effects</legend>
          <div className="ex-seg">
            {PICTURE_CHOICES.map((c) => (
              <button key={c.id} type="button" className={(s.lottiePictures ?? 'balanced') === c.id ? 'ex-on' : ''} aria-pressed={(s.lottiePictures ?? 'balanced') === c.id} onClick={() => set({ lottiePictures: c.id })}>
                {c.label}
              </button>
            ))}
          </div>
          <p className="ex-note">{PICTURE_CHOICES.find((c) => c.id === (s.lottiePictures ?? 'balanced'))!.note}</p>
        </fieldset>
      )}
    </>
  );
}
