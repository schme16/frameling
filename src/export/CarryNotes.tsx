// "What carries over": one short note per format from the table in carries.ts, plus what in this document will be
// turned into pictures or left out, so nobody finds out after exporting.
import { useMemo } from 'react';
import { openHelp } from '../ui/overlays';
import type { Doc } from '../core/format';
import { CARRY, carryWarnings, docFeatures } from './carries';
import type { FormatId } from './types';

// These formats already have their own note (LayeredNotes); only the warnings are added for them.
const OWN_NOTE: FormatId[] = ['psd', 'pdf', 'ai', 'prores'];

export function CarryNotes({ format, doc }: { format: FormatId; doc: Doc }) {
  const found = useMemo(() => docFeatures(doc), [doc]);
  const warnings = carryWarnings(doc, format, found);
  const own = OWN_NOTE.includes(format);
  if (own && !warnings.length) return null;
  return (
    <fieldset className="ex-carry">
      <legend>What carries over</legend>
      {!own && (
        <p className="ex-note">
          {CARRY[format].summary}
          {CARRY[format].help && (
            <>
              {' '}
              <button type="button" className="ex-link" onClick={() => openHelp(CARRY[format].help!)}>
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
