// A small picture of the real app drawn with one theme's colours: top bar, tool strip, canvas with a little
// drawing, and a timeline with a gold chosen chip. The theme's tokens are set on the element itself, so the preview
// never touches the real app.
import { themeStyle } from './model';
import type { Theme } from './builtIn';

export function ThemePreview({ theme, className = '' }: { theme: Pick<Theme, 'tokens' | 'mode'>; className?: string }) {
  return (
    <div className={`th-prev ${className}`} style={themeStyle(theme) as React.CSSProperties} aria-hidden="true">
      <div className="th-prev-top">
        <i className="th-prev-dot" />
        <i className="th-prev-dot" />
        <i className="th-prev-dot" />
        <b className="th-prev-title" />
        <b className="th-prev-pill" />
      </div>
      <div className="th-prev-mid">
        <div className="th-prev-tools">
          <i />
          <i className="is-chosen" />
          <i />
          <i />
        </div>
        <div className="th-prev-canvas">
          <div className="th-prev-stage">
            <svg viewBox="0 0 60 36" width="100%" height="100%">
              <circle cx="30" cy="18" r="11" fill="var(--sunny)" stroke="#2a2533" strokeWidth="2" />
              <circle cx="26.5" cy="16" r="1.4" fill="#2a2533" />
              <circle cx="33.5" cy="16" r="1.4" fill="#2a2533" />
              <path d="M26 21 Q30 24.5 34 21" fill="none" stroke="#2a2533" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <div className="th-prev-side">
          <b className="th-prev-line" />
          <b className="th-prev-line is-soft" />
          <b className="th-prev-line is-faint" />
          <b className="th-prev-btn" />
        </div>
      </div>
      <div className="th-prev-time">
        <span className="th-prev-chip">Draw</span>
        <span className="th-prev-cels">
          <i />
          <i className="is-key" />
          <i className="is-hold" />
          <i className="is-hold" />
          <i className="is-key" />
          <i />
        </span>
        <u className="th-prev-playhead" />
      </div>
    </div>
  );
}
