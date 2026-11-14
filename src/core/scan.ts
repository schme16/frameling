// Reads a whole document for what it holds anywhere: on the open stage, in symbols, in closed artboards and in what
// variations add to their original. Used by features to tell whether a file uses them.
import type { Artboard, Doc, Layer } from './format';

const overridesOf = (doc: Doc): Artboard['overrides'][] => (doc.artboards ?? []).map((a) => a.overrides);

/** Every layer a document holds: the stage's, the symbols', the artboards' and the ones variations add. */
export function eachLayer(doc: Doc): Layer[] {
  return [
    ...doc.layers,
    ...Object.values(doc.symbols ?? {}).flatMap((s) => s.layers),
    ...(doc.artboards ?? []).flatMap((a) => a.content?.layers ?? []),
    ...overridesOf(doc).flatMap((o) => o?.layers?.added ?? []),
  ];
}

/** True when the stage, an artboard or a variation has sound clips. */
export function anyAudio(doc: Doc): boolean {
  return !!doc.audio?.length || (doc.artboards ?? []).some((a) => !!a.content?.audio?.length || !!a.overrides?.audio?.added?.length);
}

/** True when the stage, an artboard or a variation has a clip flow. */
export function anyFlow(doc: Doc): boolean {
  return !!doc.flow || (doc.artboards ?? []).some((a) => !!a.content?.flow || !!a.overrides?.stage?.set?.flow);
}
