// The Text tool's options on a pixel layer: the font, the size in whole pixels, bold, spacing and line up.
import { useMemo } from 'react';
import { Choice, Slider, Tip, Toggle } from '../../canvas/controls';
import { layoutPixelText, MAX_LINE_GAP, MAX_SCALE, MAX_SPACING, MIN_LINE_GAP, MIN_SCALE, PIXEL_FONTS, type PixelAlign, type PixelFontId, type PixelTextStyle } from './font';
import { setPixelText, usePixelText } from './settings';
import '../text.css';

const ALIGN: { value: PixelAlign; label: string; title: string }[] = [
  { value: 'left', label: 'Left', title: 'The words start at the pixel you click (align left)' },
  { value: 'center', label: 'Middle', title: 'The words are centred on the pixel you click (align centre)' },
  { value: 'right', label: 'Right', title: 'The words end at the pixel you click (align right)' },
];

const SAMPLE = 'Pixels 123';

/** The words as they will look, drawn crisp at the chosen font, size, spacing and boldness. */
export function PixelSample({ style, text = SAMPLE }: { style: PixelTextStyle; text?: string }) {
  const l = useMemo(() => layoutPixelText(text, { ...style, align: 'left', scale: 1 }), [text, style]);
  const pad = 1;
  const w = Math.max(1, l.box.w) + pad * 2;
  const h = l.box.h + pad * 2;
  return (
    <svg className="pxt-sample" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Sample: ${text}`} style={{ aspectRatio: `${w} / ${h}`, maxWidth: `${w * style.scale * 6}px` }}>
      {l.rects.map((r, i) => (
        <rect key={i} x={r.x + pad} y={r.y + pad} width={r.w} height={r.h} fill="currentColor" />
      ))}
    </svg>
  );
}

export function PixelTextOptions() {
  const t = usePixelText();
  return (
    <div className="cv-options tx-panel" data-help="pixel-text">
      <Tip>Click on the picture and type. Every letter lands on the pixel grid in the Paint colour, with no smoothing. Press Esc when you're done.</Tip>
      <Choice<PixelFontId> label="Font" value={t.font} options={PIXEL_FONTS.map((f) => ({ value: f.id, label: f.name, title: f.blurb }))} onChange={(font) => setPixelText({ font })} />
      <Slider label="Size" value={t.scale} min={MIN_SCALE} max={MAX_SCALE} format={(v) => (v === 1 ? 'Normal' : `${v} times bigger`)} onChange={(scale) => setPixelText({ scale })} hint="Whole numbers only, so every letter pixel stays one square block. Ctrl and the up and down arrows change it while you type." />
      <Toggle label="Bold" checked={t.bold} onChange={(bold) => setPixelText({ bold })} hint="Every pixel of every letter gets one more beside it." />
      <Slider label="Letter spacing" value={t.spacing} min={0} max={MAX_SPACING} format={(v) => `${v} pixel${v === 1 ? '' : 's'} extra`} onChange={(spacing) => setPixelText({ spacing })} hint="Extra empty columns between letters (tracking)." />
      <Slider label="Line spacing" value={t.lineGap} min={MIN_LINE_GAP} max={MAX_LINE_GAP} format={(v) => (v === 0 ? 'Usual' : v > 0 ? `${v} row${v === 1 ? '' : 's'} extra` : `${-v} row${v === -1 ? '' : 's'} closer`)} onChange={(lineGap) => setPixelText({ lineGap })} hint="Rows between lines (leading). Take a row or two off for lines of capitals." />
      <Choice<PixelAlign> label="Line up" value={t.align} options={ALIGN} onChange={(align) => setPixelText({ align })} />
      <PixelSample style={t} />
      <Tip>Hold Alt and press the arrow keys to nudge the words one pixel. When you finish, the words become plain pixels in the layer, so they can't be retyped later.</Tip>
    </div>
  );
}
