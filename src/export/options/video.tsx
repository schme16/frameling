import { getChoiceDef, setChoice, useChoice } from '../../core/choices';
import type { ExportUiProps } from '../registry';
import '../choices';

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
      <p className="ex-note">{v?.ok ? `Making this one with ${v.codec === 'av1' ? 'AV1' : v.codec === 'vp9' ? 'VP9' : 'VP8'}${s.transparent && v.alphaCodec && v.alphaCodec !== v.codec ? ` (${v.alphaCodec.toUpperCase()} for the see-through background)` : ''}.` : 'Also in Preferences > Behaviour.'}</p>
    </fieldset>
  );
}
