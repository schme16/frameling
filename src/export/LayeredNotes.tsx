// What the PSD, PDF, Illustrator and ProRes exports keep, in a sentence or two, with a link to the full help.
import type { Doc } from '../core/format';
import { openHelp } from '../ui/overlays';
import { flatPlan, pictureCount } from './layered';
import type { FormatId } from './types';

const NOTES: Partial<Record<FormatId, { legend: string; text: string; help: string; link: string }>> = {
  psd: {
    legend: 'For Photoshop',
    text: 'Every layer becomes a Photoshop layer with its name, blend mode, opacity and visibility. Folders become groups and clipped layers stay clipped. Effects are baked into the pixels.',
    help: 'export-psd',
    link: 'What comes across',
  },
  pdf: {
    legend: 'PDF',
    text: 'Shapes stay sharp vectors, and each layer is a PDF layer you can turn on and off in Acrobat. A page for every frame (pick "This frame" for one page).',
    help: 'export-pdf',
    link: 'What comes across',
  },
  ai: {
    legend: 'For Illustrator',
    text: 'Illustrator opens it as its own file, with every shape editable, your layers and folders as real Illustrator layers, and gradients as gradients. Hidden layers and folders come in hidden. Other programs read it as a PDF without them.',
    help: 'export-illustrator',
    link: 'How to open it',
  },
  prores: {
    legend: 'ProRes',
    text: 'Apple ProRes 4444 in a .mov, for video editors. Tick Transparent background to keep the see-through parts. Made with FFmpeg on this computer.',
    help: 'export-prores',
    link: 'More about ProRes',
  },
};

export function LayeredNotes({ format, doc }: { format: FormatId; doc: Doc }) {
  const n = NOTES[format];
  if (!n) return null;
  const pictures = format === 'pdf' || format === 'ai' ? pictureCount(flatPlan(doc, 0, format === 'ai')) : 0;
  return (
    <fieldset>
      <legend>{n.legend}</legend>
      <p className="ex-note">
        {n.text}{' '}
        <button type="button" className="ex-link" onClick={() => openHelp(n.help)}>
          {n.link}
        </button>
      </p>
      {pictures > 0 && <p className="ex-note">{pictures === 1 ? 'One layer has' : `${pictures} layers have`} pixels, effects, clipping, a mask or bending on bones, so {pictures === 1 ? 'it comes' : 'they come'} in as {pictures === 1 ? 'a picture' : 'pictures'} rather than shapes.</p>}
    </fieldset>
  );
}
