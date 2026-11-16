// "Swap fonts": every font the open drawing's text uses, with how much text and where, a note on the ones this computer
// lacks, and a replacement to pick for each (or one for all). The drawing is shown before and after, and the swap is one
// undo step. The sums are in fontSwap.ts.
import { useMemo, useState } from 'react';
import { produce } from 'immer';
import { currentChoice, setChoice } from '../core/choices';
import type { Doc } from '../core/format';
import { store } from '../core/store';
import { mountModal, Modal } from '../io/mount';
import { Preview } from '../tools/RecolourDialog';
import { toast } from '../ui/toast';
import { fontIsHere, replacementFonts } from './fonts';
import { applyFontSwap, collectFontUses, fontKey, placesNote, planSwaps, swapItemCount, swapTargets, type SwapScope } from './fontSwap';
import { fontFamilyCss, SHIPPED_FONTS } from './model';
import './text.css';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function FontOptions({ list }: { list: { shipped: string[]; system: string[] } }) {
  return (
    <>
      <optgroup label="Comes with Frameling (looks the same everywhere)">
        {list.shipped.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </optgroup>
      {list.system.length > 0 && (
        <optgroup label="On this computer">
          {list.system.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

function FontSwapDialog({ close }: { close: () => void }) {
  const { doc, ui } = store().get();
  const uses = useMemo(() => collectFontUses(doc, fontIsHere), [doc]);
  const anyMissing = uses.some((u) => u.missing);
  const [asked, setAsked] = useState<SwapScope>(() => currentChoice<SwapScope>('text.fontSwapScope'));
  // With nothing missing there is nothing for "only the missing ones" to do, so start on every font.
  const scope: SwapScope = anyMissing ? asked : 'all';
  const pickScope = (s: SwapScope) => {
    setAsked(s);
    setChoice('text.fontSwapScope', s === 'missing' ? undefined : s);
  };
  const [picked, setPicked] = useState<Record<string, string>>({});
  const list = useMemo(() => replacementFonts(uses.map((u) => u.font)), [uses]);
  const inScope = (missing: boolean) => scope === 'all' || missing;
  const plan = useMemo(() => planSwaps(uses, picked, scope), [uses, picked, scope]);
  const count = swapItemCount(uses, plan);
  const targets = useMemo(() => swapTargets(doc), [doc]);
  const after = useMemo(() => (plan.size ? produce(doc, (d) => void applyFontSwap(d as Doc, plan, targets)) : doc), [doc, plan, targets]);

  const setAll = (to: string) => setPicked(Object.fromEntries(uses.filter((u) => inScope(u.missing) && fontKey(u.font) !== fontKey(to)).map((u) => [u.font, to])));

  const apply = () => {
    if (!plan.size) return;
    const first = [...plan.entries()][0];
    const label = plan.size === 1 ? `Swap font ${uses.find((u) => fontKey(u.font) === first[0])?.font ?? first[0]} for ${first[1]}` : `Swap ${plan.size} fonts`;
    store().update(label, (d) => void applyFontSwap(d as Doc, plan, targets));
    toast(`Swapped the font on ${plural(count, 'text')}. Undo puts it back.`, { kind: 'success' });
    close();
  };

  const missingCount = uses.filter((u) => u.missing).length;

  return (
    <Modal title="Swap fonts" onClose={close} wide>
      <div className="io-body cv-recolour fs-body">
        {!uses.length ? (
          <p className="io-muted" data-testid="fontswap-none">
            There is no text in this drawing, so there are no fonts to swap. Add some with the Text tool (T) and come back.
          </p>
        ) : (
          <>
            <p className="io-muted">
              {anyMissing
                ? `${plural(missingCount, 'font')} in this drawing ${missingCount === 1 ? 'is' : 'are'} not on this computer, so the text shows in a stand-in. Pick a replacement for each, or for all at once.`
                : 'Every font in this drawing is on this computer. Pick a replacement for any of them to change that text to match.'}
            </p>
            {anyMissing && (
              <div className="cv-recolour-where" role="group" aria-label="Which fonts to swap">
                <span className="cv-field-label">Swap</span>
                <div className="ex-seg">
                  <button type="button" className={scope === 'missing' ? 'ex-on' : ''} aria-pressed={scope === 'missing'} onClick={() => pickScope('missing')} data-testid="fontswap.scope.missing" title="Leave the fonts that are here alone">
                    Only the missing fonts
                  </button>
                  <button type="button" className={scope === 'all' ? 'ex-on' : ''} aria-pressed={scope === 'all'} onClick={() => pickScope('all')} data-testid="fontswap.scope.all" title="Any font in the list can be swapped">
                    Every font
                  </button>
                </div>
              </div>
            )}
            <ul className="fs-list" aria-label="Fonts in this drawing">
              {uses.map((u) => {
                const on = inScope(u.missing);
                const to = picked[u.font];
                const here = SHIPPED_FONTS.some((f) => fontKey(f.name) === fontKey(u.font)) ? 'Comes with Frameling' : 'On this computer';
                return (
                  <li key={fontKey(u.font)} className="fs-row" data-missing={u.missing} data-off={!on} data-testid={`fontswap.row.${u.font}`}>
                    <div className="fs-main">
                      <div className="fs-name">
                        <strong>{u.font}</strong>
                        {u.missing ? <span className="fs-badge fs-bad">Not on this computer</span> : <span className="fs-badge">{here}</span>}
                      </div>
                      <div className="fs-uses io-muted">
                        {plural(u.items, 'text')} on {placesNote(u.places)}
                      </div>
                      <div className="fs-samples" aria-hidden="true">
                        <span className="fs-sample" title={u.missing ? 'The stand-in the drawing shows now' : 'As it looks now'} style={{ fontFamily: fontFamilyCss(u.font) }}>
                          {u.sample || 'Sample'}
                        </span>
                        {to && inScope(u.missing) && (
                          <>
                            <span className="fs-arrow">becomes</span>
                            <span className="fs-sample fs-after" style={{ fontFamily: fontFamilyCss(to) }}>
                              {u.sample || 'Sample'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <label className="fs-pick">
                      <span className="cv-field-label">Swap to</span>
                      <select className="sy-select" value={to ?? ''} disabled={!on} aria-label={`Replacement for ${u.font}`} data-testid={`fontswap.to.${u.font}`} onChange={(e) => setPicked({ ...picked, [u.font]: e.target.value })}>
                        <option value="">{on ? 'Keep it as it is' : 'Left alone (it is here)'}</option>
                        <FontOptions list={list} />
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
            {uses.filter((u) => inScope(u.missing)).length > 1 && (
              <label className="fs-all">
                <span className="cv-field-label">Or use one font for all of these</span>
                <select className="sy-select" value="" aria-label="One replacement for every font in the list" data-testid="fontswap.all" onChange={(e) => e.target.value && setAll(e.target.value)}>
                  <option value="">Pick a font...</option>
                  <FontOptions list={list} />
                </select>
              </label>
            )}
            {plan.size > 0 && (
              <div className="cv-recolour-previews">
                <Preview doc={doc} frame={ui.frame} label="Now" />
                <Preview doc={after} frame={ui.frame} label="After" />
              </div>
            )}
            <p className="io-muted" aria-live="polite" data-testid="fontswap-note">
              {plan.size ? `Swaps ${plural(plan.size, 'font')} on ${plural(count, 'text')}. One undo puts it all back.` : 'Pick a replacement for at least one font.'} Size, weight and colour stay as they are.
            </p>
          </>
        )}
      </div>
      <div className="io-foot">
        <button type="button" className="io-btn" onClick={close}>
          {uses.length ? 'Cancel' : 'Close'}
        </button>
        {uses.length > 0 && (
          <button type="button" className="io-btn io-primary" onClick={apply} disabled={!plan.size} data-testid="fontswap.apply">
            Swap fonts
          </button>
        )}
      </div>
    </Modal>
  );
}

export function openFontSwap(): void {
  mountModal((close) => <FontSwapDialog close={close} />);
}
