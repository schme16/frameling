// "What carries over": one short note per format from the table in carries.ts, plus what in this document will be
// turned into pictures or left out, so nobody finds out after exporting.
import { useMemo } from 'react';
import { openHelp } from '../ui/overlays';
import type { Doc } from '../core/format';
import { useChoices } from '../core/choices';
import { carryOf, carryWarnings, docFeatures } from './carries';
import { SVG_TOOTH_CHOICE, type SvgToothPref } from './choices';

// A format with a note of its own (LayeredNotes) only gets the warnings added here.
export function CarryNotes({ format, doc, own, range }: { format: string; doc: Doc; own: boolean; range?: { start: number; end: number } }) {
  const found = useMemo(() => docFeatures(doc), [doc]);
  // What the SVG will do with chalk and charcoal on paper: the remembered answer, or (none yet) that it will ask.
  const toothAnswer = useChoices()[SVG_TOOTH_CHOICE] as SvgToothPref | undefined;
  const warnings = carryWarnings(doc, format, found, range, toothAnswer ?? 'ask');
  const carry = carryOf(format);
  if (own && !warnings.length) return null;
  return (
    <fieldset className="ex-carry">
      <legend>What carries over</legend>
      {!own && (
        <p className="ex-note">
          {carry.summary}
          {carry.help && (
            <>
              {' '}
              <button type="button" className="ex-link" onClick={() => openHelp(carry.help!)}>
                More
              </button>
            </>
          )}
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className="ex-note ex-warn">
          {w}
        </p>
      ))}
    </fieldset>
  );
}
