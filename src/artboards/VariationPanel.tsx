// The Artboards panel's part for variations: what the open variation follows, its size cuts, and the list of
// differences from the original (click one to jump to it, Reset to take it back).
import { useMemo } from 'react';
import type { Id } from '../core/format';
import { store, useStore } from '../core/store';
import { useChoice } from '../core/choices';
import { ActionButton, Tip } from '../canvas/controls';
import { Section } from '../symbols/PropertiesPanel';
import { Icon } from '../ui/icons';
import { activeId, findArtboard, sizeOf } from './model';
import { goToArtboard } from './ops';
import { openArtboardExport } from './exportDialog';
import { setArtboardExport } from './export';
import { detachVariationById, jumpToDifference, makeVariationOf, presetSize, reframeVariation, resetDifferenceById, resetVariationById, sizeVariation, SIZE_PRESETS } from './variationOps';
import { familyIds, listDifferences, sourceOf, variationsOf, type DiffItem } from './variations';
import type { FitMode } from './fit';

/** The small "Variation" tag on a list row. */
export function VariationBadge({ of }: { of: string }) {
  return (
    <span className="ab-badge" title={`A variation (linked copy) of ${of}. It follows ${of} except for what you change in it.`}>
      <Icon name="link" size={11} />
      Variation
    </span>
  );
}

/** Opens the Export dialog set to the open artboard and all its variations, each as its own file. */
export function exportFamily(id: Id): void {
  const ids = familyIds(store().get().doc, id);
  openArtboardExport('each');
  if (ids.length) setArtboardExport({ mode: 'each', ids });
}

/** What goes under the artboards list: for a variation, its size cuts and differences; for an original, its variations. */
export function VariationSection() {
  const doc = useStore((s) => s.doc);
  const frame = useChoice<FitMode>('variations.frame');
  const open = findArtboard(doc, activeId(doc));
  const root = open && sourceOf(doc, open);
  const diffs = useMemo(() => (open?.variationOf ? listDifferences(doc, open.id) : []), [doc, open?.id, open?.variationOf]);
  if (!open) return null;

  if (!open.variationOf || !root) {
    const mine = variationsOf(doc, open.id);
    return (
      <Section title="Variations (linked copies)">
        {mine.length === 0 ? (
          <Tip>A variation follows this artboard and keeps only what you change in it: another colour scheme, a different size, a different take. Edit this one and every variation follows along.</Tip>
        ) : (
          <p className="ab-var-note">
            {mine.length} {mine.length === 1 ? 'variation follows' : 'variations follow'} this artboard.
          </p>
        )}
        <div className="cv-row cv-wrap">
          <ActionButton onClick={() => void makeVariationOf(open.id)} title="A linked copy of this artboard that keeps only what you change in it">
            Make a variation
          </ActionButton>
          {mine.length > 0 && (
            <ActionButton onClick={() => exportFamily(open.id)} title="Export this artboard and all its variations, each as its own file">
              Export all variations
            </ActionButton>
          )}
        </div>
      </Section>
    );
  }

  const { w, h } = sizeOf(doc, open);
  const rootSize = sizeOf(doc, root);
  const groups = new Map<string, DiffItem[]>();
  for (const d of diffs) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
  return (
    <Section title="This variation (linked copy)">
      <p className="ab-var-note">
        <Icon name="link" size={13} /> Follows{' '}
        <button type="button" className="ab-linkish" onClick={() => goToArtboard(root.id, true)} title="Open the original">
          {root.name}
        </button>
        . Change it there and this follows along, except for the things listed below.
      </p>
      <div className="ab-var-size">
        <span className="ab-var-label" id="ab-var-size-label">
          Size
        </span>
        <div className="ex-seg" role="group" aria-labelledby="ab-var-size-label">
          {SIZE_PRESETS.map((p, i) => {
            const s = presetSize({ w: rootSize.w, h: rootSize.h }, p.id);
            // The first preset that gives this size is the lit one (a wide original's "Wide" is its own size).
            const on = SIZE_PRESETS.findIndex((q) => {
              const t = presetSize({ w: rootSize.w, h: rootSize.h }, q.id);
              return t.width === w && t.height === h;
            }) === i;
            return (
              <button key={p.id} type="button" className={on ? 'ex-on' : ''} aria-pressed={on} title={`${p.title} (${s.width} x ${s.height})`} onClick={() => void sizeVariation(open.id, p.id)}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      {(w !== rootSize.w || h !== rootSize.h) && (
        <div className="ab-var-size">
          <span className="ab-var-label" id="ab-var-frame-label">
            Framing
          </span>
          <div className="ex-seg" role="group" aria-labelledby="ab-var-frame-label">
            <button type="button" className={frame === 'fill' ? 'ex-on' : ''} aria-pressed={frame === 'fill'} title="Fill the picture and crop what hangs over" onClick={() => reframeVariation(open.id, 'fill')}>
              Fill (crop)
            </button>
            <button type="button" className={frame === 'bars' ? 'ex-on' : ''} aria-pressed={frame === 'bars'} title="Show the whole original" onClick={() => reframeVariation(open.id, 'bars')}>
              Fit (show it all)
            </button>
          </div>
        </div>
      )}
      <h4 className="ab-var-head">Differences from {root.name}{diffs.length ? ` (${diffs.length})` : ''}</h4>
      {diffs.length === 0 ? (
        <Tip>Nothing differs yet. Change a colour, a key or the size here and it shows up in this list.</Tip>
      ) : (
        <div className="ab-diffs" role="list" aria-label="Differences from the original">
          {[...groups].map(([group, items]) => (
            <div key={group} role="listitem" className="ab-diff-group">
              <div className="ab-diff-title">{group}</div>
              <ul>
                {items.map((d) => (
                  <li key={d.key} className="ab-diff">
                    {d.colors && (
                      <span className="ab-diff-chips" aria-hidden="true">
                        <i style={{ background: d.colors[0] }} />
                        <i style={{ background: d.colors[1] }} />
                      </span>
                    )}
                    <button type="button" className="ab-diff-go" title={d.layer ? 'Go to it' : undefined} disabled={!d.layer} onClick={() => jumpToDifference(open.id, d)}>
                      {d.label}
                    </button>
                    <button type="button" className="ab-diff-reset" aria-label={`Reset to the original: ${d.label}`} title="Take this change back: it follows the original again" onClick={() => resetDifferenceById(open.id, d.reset)}>
                      Reset
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="cv-row cv-wrap">
        <ActionButton onClick={() => void import('./RecolourVariationDialog').then((m) => m.openRecolourVariation())} title="Pick colours and change them on every frame of this variation, and only here">
          Recolour this variation
        </ActionButton>
        <ActionButton onClick={() => void makeVariationOf(open.id)} title="Another linked copy, starting with the same changes">
          Make a variation
        </ActionButton>
        <ActionButton onClick={() => void resetVariationById(open.id)} disabled={diffs.length === 0} title="Take every change back: this variation shows the original again, and follows it">
          Reset all to original
        </ActionButton>
        <ActionButton onClick={() => void detachVariationById(open.id)} title="Make it a plain artboard: it keeps what it shows and stops following the original">
          Detach (plain copy)
        </ActionButton>
        <ActionButton onClick={() => exportFamily(open.id)} title="Export the original and all its variations, each as its own file">
          Export all variations
        </ActionButton>
      </div>
    </Section>
  );
}
