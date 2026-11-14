import { getChoiceDef, setChoice, useChoice } from '../../core/choices';
import { ExNote } from '../ExNote';
import type { ExportUiProps } from '../registry';
import '../choices';

/** The line under the codec buttons: which codec this WebM is made with (it can differ from the pick when this computer cannot make that one). */
export function webmCodecNote(codec: string | null, alphaCodec: string | null | undefined): string {
  const name = codec === 'av1' ? 'AV1' : codec === 'vp9' ? 'VP9' : 'VP8';
  const alpha = alphaCodec && alphaCodec !== codec ? ` (${alphaCodec.toUpperCase()} for the see-through background)` : '';
  return `Making this one with ${name}${alpha}.`;
}

/** What each codec is for, always shown so nobody finds out from a video that will not play. */
export const WEBM_CODEC_WORDS = 'VP9 plays almost everywhere. AV1 makes smaller files, but some players and browsers cannot play it.';

/** WebM: which codec, and the one this computer will use. */
export function WebmOptions({ s, support }: ExportUiProps) {
  const webmPref = useChoice<string>('export.webmCodec');
  const v = support?.video;
  return (
    <fieldset>
      <legend>Video codec</legend>
      <div className="ex-seg">
        {(getChoiceDef('export.webmCodec')?.options ?? []).map((o) => (
          <button key={o.value} type="button" className={webmPref === o.value ? 'ex-on' : ''} aria-pressed={webmPref === o.value} title={o.detail} onClick={() => setChoice('export.webmCodec', o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="ex-note">{v?.ok ? webmCodecNote(v.codec, s.transparent ? v.alphaCodec : null) : 'Also in Preferences > Behaviour.'}</p>
      <ExNote>{WEBM_CODEC_WORDS}</ExNote>
    </fieldset>
  );
}
