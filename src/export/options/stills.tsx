// The options of the small last-mile formats: JPEG and WebP pictures, icon and favicon sets, sticker packs and the contact sheet.
import { getChoiceDef, setChoice, useChoice } from '../../core/choices';
import { CONTACT_SIDE, contactColumnsOf, contactLabelsOf, contactPageOf, contactSheetSize, contactSizeOf, type ContactPage, type ContactSize } from '../contact';
import { ExNote } from '../ExNote';
import { iconPartsOf, planFavicon, planIcons, STICKER_SERVICES, stickerPick, stickerToggle, type IconParts } from '../icons';
import type { ExportUiHookProps, ExportUiProps } from '../registry';
import { DEFAULT_JPEG_QUALITY, DEFAULT_WEBP_QUALITY, jpegQualityOf, webpLosslessOf, webpQualityOf } from '../webp';
import { hasPixelLayers } from '../plan';
import { openHelp } from '../../ui/overlays';
import '../choices';
import { Check } from './controls';
import { Loop } from './playback';

function Slider({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="ex-slider">
      <span>{label}</span>
      <input type="range" min={1} max={100} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{value}</output>
    </label>
  );
}

const HelpLink = ({ topic, children }: { topic: string; children: string }) => (
  <button type="button" className="ex-link" onClick={() => openHelp(topic)}>
    {children}
  </button>
);

export function JpegOptions({ s, set }: ExportUiProps) {
  const q = jpegQualityOf(s);
  return (
    <fieldset>
      <legend>Quality</legend>
      <Slider label="Quality" value={q} onChange={(v) => set({ jpegQuality: v })} />
      <ExNote>
        {q >= 95 ? 'Very sharp, and a bigger file.' : q >= 80 ? 'Looks the same to most eyes, with a much smaller file.' : q >= 60 ? 'Small file. Soft edges and flat colours may show a little fuzz.' : 'Very small file, but it will look rough.'}{' '}
        {q !== DEFAULT_JPEG_QUALITY && (
          <button type="button" className="ex-link" onClick={() => set({ jpegQuality: undefined })}>
            Back to {DEFAULT_JPEG_QUALITY}
          </button>
        )}
      </ExNote>
      <ExNote>
        <HelpLink topic="export-jpeg-webp-contact">How JPEG and WebP differ</HelpLink>
      </ExNote>
    </fieldset>
  );
}

export function WebpOptions(p: ExportUiProps) {
  const { s, set, doc, plan } = p;
  const lossless = webpLosslessOf(s, hasPixelLayers(doc));
  const q = webpQualityOf(s);
  return (
    <>
      {plan.count > 1 && (
        <fieldset>
          <legend>Playback</legend>
          <Loop {...p} />
        </fieldset>
      )}
      <fieldset>
        <legend>Quality</legend>
        <Check checked={lossless} onChange={(v) => set({ webpLossless: v })}>
          Lose nothing (lossless): exact pixels, a bigger file
        </Check>
        <Slider label="Quality" value={q} disabled={lossless} onChange={(v) => set({ webpQuality: v })} />
        <ExNote>
          {lossless ? 'Best for pixel art and flat colours: every pixel stays exactly as drawn.' : q !== DEFAULT_WEBP_QUALITY ? 'Lower is smaller but blurrier.' : 'A good balance of looks and size for drawings with soft shading.'}{' '}
          <HelpLink topic="export-jpeg-webp-contact">How it works</HelpLink>
        </ExNote>
      </fieldset>
    </>
  );
}

/** Whole drawing or filled square: the saved choice, always shown so nobody finds out from the files. */
export function FitPick() {
  const pref = useChoice<string>('export.iconFit');
  return (
    <>
      <div className="ex-seg" role="group" aria-label="A drawing that is not square">
        {(getChoiceDef('export.iconFit')?.options ?? []).map((o) => (
          <button key={o.value} type="button" className={pref === o.value ? 'ex-on' : ''} aria-pressed={pref === o.value} title={o.detail} onClick={() => setChoice('export.iconFit', o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <ExNote>Icons are square. {pref === 'fill' ? 'A drawing that is not square is cut off at the sides to fill it.' : 'A drawing that is not square keeps empty margins at the sides.'}</ExNote>
    </>
  );
}

const frameWords = (p: ExportUiProps): string | null => (p.doc.length > 1 ? `Uses frame ${p.plan.range.start + 1}, the one you are looking at.` : null);

export function IconOptions(p: ExportUiProps) {
  const { s, set } = p;
  const parts = iconPartsOf(s.iconFiles);
  const tick = (k: keyof IconParts) => (v: boolean) => set({ iconFiles: { ...parts, [k]: v } });
  return (
    <fieldset>
      <legend>What to make</legend>
      <Check checked={parts.png} onChange={tick('png')}>
        A PNG at every size (16 to 1024)
      </Check>
      <Check checked={parts.ico} onChange={tick('ico')}>
        Windows icon (.ico)
      </Check>
      <Check checked={parts.icns} onChange={tick('icns')}>
        Mac icon (.icns)
      </Check>
      <Check checked={parts.mobile} onChange={tick('mobile')}>
        iPhone, iPad and Android sizes
      </Check>
      <FitPick />
      {frameWords(p) && <ExNote stays>{frameWords(p)}</ExNote>}
      <ExNote>
        Every size is drawn fresh from your drawing, so the small ones stay sharp. <HelpLink topic="export-icons-favicon">What goes where</HelpLink>
      </ExNote>
    </fieldset>
  );
}

export function FaviconOptions(p: ExportUiProps) {
  return (
    <fieldset>
      <legend>What you get</legend>
      <ExNote stays>favicon.ico, small PNGs, an iPhone touch icon, the 192 and 512 icons for Android, a manifest and the lines to paste into your page.</ExNote>
      <FitPick />
      {frameWords(p) && <ExNote stays>{frameWords(p)}</ExNote>}
      <ExNote>
        <HelpLink topic="export-icons-favicon">How to put it on a website</HelpLink>
      </ExNote>
    </fieldset>
  );
}

export function StickerOptions({ s, set }: ExportUiProps) {
  const picked = new Set(stickerPick(s.stickerFor).map((x) => x.id));
  return (
    <fieldset>
      <legend>Which apps</legend>
      {STICKER_SERVICES.map((sv) => (
        <Check key={sv.id} checked={picked.has(sv.id)} onChange={(v) => set({ stickerFor: stickerToggle(s.stickerFor, sv.id, v) })}>
          {sv.title} ({sv.size} × {sv.size}, {sv.type === 'webp' ? 'WebP' : 'PNG'})
        </Check>
      ))}
      <FitPick />
      <ExNote>
        Each frame becomes one picture. Pick a clip, or &ldquo;This frame&rdquo;, for a single sticker. Apps change their rules now and then, so check yours.{' '}
        <HelpLink topic="export-stickers">How to upload them</HelpLink>
      </ExNote>
    </fieldset>
  );
}

const CONTACT_SIZES: { id: ContactSize; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

export function ContactOptions({ s, set, doc, plan }: ExportUiProps) {
  const size = contactSizeOf(s);
  const page = contactPageOf(s);
  const cols = contactColumnsOf(s);
  const auto = contactSheetSize(doc, plan.count, s).layout.columns;
  return (
    <fieldset>
      <legend>The page</legend>
      <div className="ex-seg" role="group" aria-label="Picture size">
        {CONTACT_SIZES.map((c) => (
          <button key={c.id} type="button" className={size === c.id ? 'ex-on' : ''} aria-pressed={size === c.id} title={`Each picture is ${CONTACT_SIDE[c.id]} pixels on its longest side.`} onClick={() => set({ contactSize: c.id })}>
            {c.label}
          </button>
        ))}
      </div>
      <label className="ex-grid2">
        <span>Pictures per row</span>
        <select aria-label="Pictures per row" value={cols} onChange={(e) => set({ contactColumns: Number(e.target.value) })}>
          <option value={0}>Automatic ({auto})</option>
          {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="ex-seg" role="group" aria-label="Page colour">
        {(['light', 'dark'] as ContactPage[]).map((c) => (
          <button key={c} type="button" className={page === c ? 'ex-on' : ''} aria-pressed={page === c} onClick={() => set({ contactPage: c })}>
            {c === 'light' ? 'Light page' : 'Dark page'}
          </button>
        ))}
      </div>
      <Check checked={contactLabelsOf(s)} onChange={(v) => set({ contactLabels: v })}>
        Number under each picture
      </Check>
      <ExNote>
        <HelpLink topic="export-jpeg-webp-contact">Sharing it for a review</HelpLink>
      </ExNote>
    </fieldset>
  );
}

export function iconSummary({ s, plan }: ExportUiHookProps): string | null {
  const set = planIcons(s.iconFiles, 'x');
  const files = set.pngs.length + (set.ico ? 1 : 0) + (set.icns ? 1 : 0);
  if (!files) return 'Tick at least one thing to make.';
  const lo = set.sizes[0];
  const hi = set.sizes[set.sizes.length - 1];
  return `${files} file${files === 1 ? '' : 's'}, ${lo} to ${hi} pixels, from frame ${plan.range.start + 1}`;
}

export function faviconSummary({ plan }: ExportUiHookProps): string | null {
  const f = planFavicon();
  return `${f.pngs.length + 4} files in a zip, ${f.sizes[0]} to ${f.sizes[f.sizes.length - 1]} pixels, from frame ${plan.range.start + 1}`;
}

export function stickerSummary({ s, plan }: ExportUiHookProps): string | null {
  const n = stickerPick(s.stickerFor).length;
  return `${plan.count} picture${plan.count === 1 ? '' : 's'} for each of ${n} app${n === 1 ? '' : 's'}, ${plan.count * n} in all`;
}

export function contactSummary({ doc, s, plan }: ExportUiHookProps): string | null {
  const { layout } = contactSheetSize(doc, plan.count, s);
  return `${plan.count} frame${plan.count === 1 ? '' : 's'} on one page, ${layout.width} × ${layout.height} px`;
}

