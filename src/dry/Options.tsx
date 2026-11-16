// Tool options for chalk and charcoal: the medium and the paper first, since those make the look, then size, edge and
// pressure for the medium you are on. Says in plain words when the grain is being made all or nothing, and why.
import { findLayer } from '../core/doc';
import { setChoice, useChoice } from '../core/choices';
import { useStore } from '../core/store';
import { ActionButton, Choice, Slider, Tip } from '../canvas/controls';
import { BrushPresetRow } from '../brushes/BrushPresetRow';
import { MirrorOptions } from '../tools/options/MirrorOptions';
import { useToolSettings } from '../tools/settings';
import { PenOptions } from '../tablet/PenOptions';
import { SOFT_EDGE_CHOICE } from '../soft/choices';
import { edgeNote } from '../soft/Options';
import { MEDIA, mediumInfo, type DryId } from './maths';
import { PAPERS, paperInfo, type PaperKind } from './paper';
import { PRESS_RANGE, SIZE_RANGE, setDryTool, setMedium, setPaper, useDry } from './settings';

function Edge() {
  const locked = useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return !!l && l.kind === 'pixel' && !!l.paletteLock;
  });
  const perfect = useToolSettings((s) => s.pixelPerfect);
  const answer = useChoice<'crisp' | 'smooth'>(SOFT_EDGE_CHOICE);
  const note = edgeNote(locked, perfect, answer, 'airbrush')?.replace('the soft edge is a pattern of dots instead of see-through pixels', 'the grain is made of whole pixels instead of see-through ones');
  if (!note) return null;
  return (
    <>
      <Tip stays>{note}</Tip>
      {!locked && (
        <ActionButton onClick={() => setChoice(SOFT_EDGE_CHOICE, 'smooth')} title="Make the grain out of see-through pixels, even with Pixel perfect on">
          Make the grain smooth instead
        </ActionButton>
      )}
    </>
  );
}

export function DryOptionsPanel() {
  const medium = useDry((s) => s.medium);
  const paper = useDry((s) => s.paper);
  const o = useDry((s) => s.tools[s.medium]);
  const info = mediumInfo(medium);
  return (
    <div className="cv-options">
      <BrushPresetRow side="pixel" />
      <Choice<DryId> label="Medium" value={medium} options={MEDIA.map((m) => ({ value: m.id, label: m.label, title: m.hint }))} onChange={setMedium} />
      <Tip>{info.hint}</Tip>
      <Choice<PaperKind> label="Paper" value={paper} options={PAPERS.map((p) => ({ value: p.id, label: p.label, title: p.hint }))} onChange={setPaper} />
      <Tip>{paperInfo(paper).hint} The paper stays put on the page, so strokes over each other meet the same bumps.</Tip>
      <Slider label="Size" value={o.size} min={SIZE_RANGE.min} max={SIZE_RANGE.max} curve format={(v) => `${v} pixel${v === 1 ? '' : 's'} across`} onChange={(v) => setDryTool(medium, { size: v })} />
      <Slider
        label="Pressure"
        value={Math.round(o.press * 100)}
        min={Math.round(PRESS_RANGE.min * 100)}
        max={100}
        format={(v) => `${v}%`}
        onChange={(v) => setDryTool(medium, { press: v / 100 })}
        hint="How hard you press. Light pressure only catches the high points of the paper, so you get specks. Hard pressure fills the dips in too. With a pen, pressing harder does it for you."
      />
      <Slider label="Edge" value={Math.round(o.hardness * 100)} min={0} max={100} format={(v) => (v === 0 ? 'Soft all through' : v === 100 ? 'Hard edge' : `${v}%`)} onChange={(v) => setDryTool(medium, { hardness: v / 100 })} hint="How much of the stick is solid before it fades. Low is dusty and wide, high is firm." />
      <MirrorOptions />
      <Edge />
      <Tip>Rub it in with the Smudge tool, or lift it out with the Soft eraser, the way you would with a finger or a putty rubber.</Tip>
      <PenOptions tool="charcoal" size flow />
    </div>
  );
}
