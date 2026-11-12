// Loop and colour options of the formats that play by themselves: GIF, APNG and the moving SVG.
import { openHelp } from '../../ui/overlays';
import { GIF_MAX_FPS } from '../gif';
import type { ExportUiProps } from '../registry';
import { Check, LoopNote } from './controls';

const Loop = ({ s, set, doc, plan }: ExportUiProps) => (
  <>
    <Check checked={plan.loop} onChange={(v) => set({ loop: v, loopTouched: true })}>
      Loop forever
    </Check>
    <LoopNote doc={doc} s={s} plan={plan} onFollow={() => set({ loopTouched: false })} />
  </>
);

export function SvgAnimOptions(p: ExportUiProps) {
  return (
    <fieldset>
      <legend>Playback</legend>
      <Loop {...p} />
      <p className="ex-note">
        It plays by itself in any browser, also in an image tag.{' '}
        <button type="button" className="ex-link" onClick={() => openHelp('export-svg-animated')}>
          How it works
        </button>
      </p>
    </fieldset>
  );
}

export function ApngOptions(p: ExportUiProps) {
  return (
    <fieldset>
      <legend>Playback</legend>
      <Loop {...p} />
    </fieldset>
  );
}

export function GifOptions(p: ExportUiProps) {
  const { s, set, doc } = p;
  return (
    <fieldset>
      <legend>Playback</legend>
      <Loop {...p} />
      <Check checked={s.dither} onChange={(v) => set({ dither: v })}>
        Smooth colours (dither), for gradients and soft shading
      </Check>
      {doc.fps > GIF_MAX_FPS && <p className="ex-note">GIFs can&apos;t go faster than {GIF_MAX_FPS} frames per second, so this one will play a little slower.</p>}
      <p className="ex-note">GIFs use up to 256 colours, chosen from your whole animation.</p>
    </fieldset>
  );
}
