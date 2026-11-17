// Tool options for the soft paint tools: size, hardness and flow, the pen switches, and a plain-words line whenever the
// soft edge is being dithered (and why), so a locked palette or Pixel perfect never changes the look without saying so.
import type { ComponentType } from 'react';
import { findLayer } from '../core/doc';
import { setChoice, useChoice } from '../core/choices';
import { useStore } from '../core/store';
import { ActionButton, Slider, Tip, Toggle } from '../canvas/controls';
import { BrushPresetRow } from '../brushes/BrushPresetRow';
import { MirrorOptions } from '../tools/options/MirrorOptions';
import { useToolSettings } from '../tools/settings';
import { PenOptions } from '../tablet/PenOptions';
import { SOFT_EDGE_CHOICE } from './choices';
import { edgeFor, type SoftKind } from './maths';
import { FLOW_RANGE, setHoldBuilds, setSoftTool, SIZE_RANGE, useSoft } from './settings';

/** What each tool's flow slider is called, and what it does, in plain words. */
const FLOW_WORDS: Record<SoftKind, { label: string; hint: string }> = {
  airbrush: { label: 'Flow', hint: 'How much paint one pass lays down. Low flow is light and builds up as you go over it again.' },
  'soft-brush': { label: 'Flow', hint: 'How much paint one stroke lays down. Low flow is see-through, and builds up as you go over it with another stroke.' },
  'soft-eraser': { label: 'Strength', hint: 'How much one stroke takes away. Low strength fades what is there, and goes further when you rub again.' },
  highlighter: { label: 'Strength', hint: 'How strongly the colour goes on. The line underneath shows through at any strength.' },
  smudge: { label: 'Strength', hint: 'How far the colour is pushed. Low strength drags a light, short smear; high strength drags it a long way.' },
};

const TIPS: Record<SoftKind, string> = {
  airbrush: 'Spray soft colour. Go slowly, or hold still, to build it up.',
  'soft-brush': 'A round brush whose edge fades out. Slide Hardness up for a firmer edge.',
  'soft-eraser': 'Rubs out with a soft edge, so what is left fades away instead of stopping.',
  highlighter: 'Lays colour over your lines without covering them, like a marker over print.',
  smudge: 'Press where the colour is and drag. It pushes that colour along, like a finger in wet paint. Smudge ignores mirror drawing.',
};

/** The line that says why the soft edge is dithered, or null when it is smooth. */
export function edgeNote(locked: boolean, pixelPerfect: boolean, answer: 'crisp' | 'smooth', kind: SoftKind): string | null {
  const e = edgeFor({ locked, pixelPerfect, crispAnswer: answer });
  const what = kind === 'smudge' ? 'smudge moves whole pixels instead of blending them' : 'the soft edge is a pattern of dots instead of see-through pixels';
  if (e.why === 'locked') return `This layer keeps to its palette, so ${what}. Every pixel stays one of your palette colours.`;
  if (e.why === 'perfect') return `Pixel perfect is on, so ${what}. Every pixel stays whole.`;
  return null;
}

function Edge({ kind }: { kind: SoftKind }) {
  const locked = useStore((s) => {
    const l = findLayer(s.doc, s.ui.activeLayerId) ?? s.doc.layers[s.doc.layers.length - 1];
    return !!l && l.kind === 'pixel' && !!l.paletteLock;
  });
  const perfect = useToolSettings((s) => s.pixelPerfect);
  const answer = useChoice<'crisp' | 'smooth'>(SOFT_EDGE_CHOICE);
  const note = edgeNote(locked, perfect, answer, kind);
  if (!note) return null;
  return (
    <>
      <Tip stays>{note}</Tip>
      {!locked && (
        <ActionButton
          control="edge-smooth-button"
          onClick={() => {
            setChoice(SOFT_EDGE_CHOICE, 'smooth');
          }}
          title="Make soft edges out of see-through pixels, even with Pixel perfect on"
        >
          Make the edge smooth instead
        </ActionButton>
      )}
    </>
  );
}

function Options({ kind }: { kind: SoftKind }) {
  const o = useSoft((s) => s.tools[kind]);
  const hold = useSoft((s) => s.holdBuilds);
  const words = FLOW_WORDS[kind];
  return (
    <div className="cv-options">
      <BrushPresetRow side="pixel" />
      <Slider control="size" label="Size" value={o.size} min={SIZE_RANGE.min} max={SIZE_RANGE.max} curve format={(v) => `${v} pixel${v === 1 ? '' : 's'} across`} onChange={(v) => setSoftTool(kind, { size: v })} />
      {kind !== 'smudge' && <Slider control="hardness" label="Hardness" value={Math.round(o.hardness * 100)} min={0} max={100} format={(v) => (v === 0 ? 'Soft all through' : v === 100 ? 'Hard edge' : `${v}%`)} onChange={(v) => setSoftTool(kind, { hardness: v / 100 })} hint="How much of the brush is solid before it starts to fade. Low is soft and airy, high is firm with a thin fade." />}
      <Slider control="flow" label={words.label} value={Math.round(o.flow * 100)} min={Math.round(FLOW_RANGE.min * 100)} max={100} format={(v) => `${v}%`} onChange={(v) => setSoftTool(kind, { flow: v / 100 })} hint={words.hint} />
      {kind === 'airbrush' && <Toggle control="builds-up" label="Builds up while you hold still" checked={hold} onChange={setHoldBuilds} hint="Keep the pen or mouse down in one place and the colour gets denser, like a real airbrush." />}
      {kind !== 'smudge' && <MirrorOptions />}
      <Edge kind={kind} />
      <Tip>{TIPS[kind]}</Tip>
      <PenOptions tool={kind} size flow />
    </div>
  );
}

const made = new Map<SoftKind, ComponentType>();
/** The options panel for one tool (one component per tool, so the panel keeps its identity between renders). */
export function SoftOptionsFor(kind: SoftKind): ComponentType {
  let c = made.get(kind);
  if (!c) {
    c = function SoftToolOptions() {
      return <Options kind={kind} />;
    };
    made.set(kind, c);
  }
  return c;
}

