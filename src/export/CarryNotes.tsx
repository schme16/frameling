// "What carries over": one short note per format from the table in carries.ts, plus what in this document will be
// turned into pictures or left out, so nobody finds out after exporting.
import { useMemo } from 'react';
import { openHelp } from '../ui/overlays';
import type { Doc } from '../core/format';
import { carryOf, carryWarnings, docFeatures } from './carries';

// A format with a note of its own (LayeredNotes) only gets the warnings added here.
export function CarryNotes({ format, doc, own }: { format: string; doc: Doc; own: boolean }) {
  const found = useMemo(() => docFeatures(doc), [doc]);
  const warnings = carryWarnings(doc, format, found);
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
