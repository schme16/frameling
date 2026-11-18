// The two small buttons that sit in the free corners of the overlapped fill and stroke boxes, as in Photoshop and
// Affinity: a curved arrow to swap them (top right) and a tiny black and white pair for the default colours (bottom
// left). The picture is small but the button is bigger than it, so it is easy to hit (see .cv-corner in canvas.css).
/** A curved arrow with a head at each end. */
export function SwapArrow({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 3.5 H7.5 A3.5 3.5 0 0 1 11 7 V10.5" />
      <path d="M6 1.5 L3.5 3.5 L6 5.5" />
      <path d="M9 8.5 L11 11 L13 8.5" />
    </svg>
  );
}

export function SwapCorner({ onClick, label = 'Swap fill and stroke colours', title = 'Swap fill and stroke', keys = 'Shift+X', command = 'colors.swap', disabled }: { onClick: () => void; label?: string; title?: string; keys?: string; command?: string; disabled?: boolean }) {
  return (
    <button type="button" className="cv-corner cv-corner-swap" data-command={command} data-control="swap-colours" title={title} aria-label={label} aria-keyshortcuts={keys} disabled={disabled} onClick={onClick}>
      <SwapArrow />
    </button>
  );
}

export function DefaultCorner({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="cv-corner cv-corner-default" data-command="colors.reset" data-control="default-colours" title="Default colours: the theme's fill and a black stroke" aria-label="Default colours" aria-keyshortcuts="Shift+D" onClick={onClick}>
      <span className="cv-pair" aria-hidden="true" />
    </button>
  );
}
