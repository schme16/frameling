// Frameling's icon set: original, rounded and a little cute. 24 x 24 grid, 2px round strokes, `currentColor` for
// everything so an icon takes the colour of its button. Filled bits (play, dots) use fill="currentColor".
import type { ReactNode } from 'react';

const dot = (cx: number, cy: number, r = 1.2) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

const ICONS: Record<string, ReactNode> = {
  // drawing tools
  brush: (
    <>
      <path d="M19.8 4.2a1.8 1.8 0 0 0-2.5 0L11.2 10.3l2.5 2.5 6.1-6.1a1.8 1.8 0 0 0 0-2.5z" />
      <path d="M10.4 11.2l2.4 2.4c.2 3.4-2.1 6-7.3 6 1.2-.8 1.6-1.8 1.7-2.8.2-3 1.6-5.2 3.2-5.6z" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l1-4.2L16.3 4.5a2.1 2.1 0 0 1 3 3L8 18.8z" />
      <path d="M14.5 6.4l3.1 3.1" />
    </>
  ),
  eraser: (
    <>
      <path d="M4.6 15.2l8.8-8.8a2 2 0 0 1 2.8 0l2.4 2.4a2 2 0 0 1 0 2.8l-6.4 6.4H7.5z" />
      <path d="M9 10.8l5.2 5.2M12.5 19.6H20" />
    </>
  ),
  fill: (
    <>
      <path d="M10.4 3.9L19.7 13a1.6 1.6 0 0 1 0 2.3l-4.5 4.4a1.6 1.6 0 0 1-2.3 0L4.2 11.2a1.6 1.6 0 0 1 0-2.3z" transform="translate(-0.5 0)" />
      <path d="M4.4 11.6h14.5" />
      <path d="M20.6 17.4c.9 1.1 1.4 1.9 1.4 2.5a1.5 1.5 0 0 1-3 0c0-.6.6-1.4 1.6-2.5z" fill="currentColor" />
    </>
  ),
  rect: <rect x="4" y="6" width="16" height="12" rx="3.2" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />,
  line: (
    <>
      <path d="M6.5 17.5L17.5 6.5" />
      <circle cx="5" cy="19" r="1.8" fill="currentColor" />
      <circle cx="19" cy="5" r="1.8" fill="currentColor" />
    </>
  ),
  select: <path d="M6.2 4.4l11.6 6-5.1 1.6-2.1 5.2z" />,
  hand: <path d="M9 11.5V5.7a1.5 1.5 0 0 1 3 0V10m0-1.8a1.5 1.5 0 0 1 3 0v2.3m0-.8a1.5 1.5 0 0 1 3 0v4.6a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.7-2.3l-3-3.9a1.5 1.5 0 0 1 2.3-1.9L9 14.2" />,
  zoom: (
    <>
      <circle cx="10.5" cy="10.5" r="6.3" />
      <path d="M15.3 15.3L20 20M8 10.5h5M10.5 8v5" />
    </>
  ),
  eyedropper: (
    <>
      <path d="M13.4 8.3l3.3 3.3-8 8H5.2v-3.5z" />
      <path d="M15.6 6.1l1.5-1.5a2.1 2.1 0 0 1 3 3l-1.5 1.5" />
      <path d="M14.2 7.4l3.4 3.4" />
    </>
  ),
  // things in the document
  layers: (
    <>
      <path d="M12 3.6l8.4 4.4-8.4 4.4L3.6 8z" />
      <path d="M3.6 12l8.4 4.4 8.4-4.4" />
      <path d="M3.6 16l8.4 4.4 8.4-4.4" />
    </>
  ),
  timeline: (
    <>
      <rect x="3" y="4.5" width="18" height="9" rx="2.6" />
      <path d="M8.5 4.5v9M14 4.5v9M4 18.5h16" />
      <circle cx="14" cy="18.5" r="1.7" fill="currentColor" />
    </>
  ),
  onion: (
    <>
      <circle cx="9.3" cy="12" r="5.6" />
      <circle cx="14.7" cy="12" r="5.6" strokeDasharray="1.2 3" />
    </>
  ),
  clip: (
    <>
      <rect x="4" y="9" width="16" height="10.5" rx="2.6" />
      <path d="M4.6 9l-.4-3.4 15 -1.2.7 3.6" />
      <path d="M8.6 8.3l-.8-3.2M14.1 7.4l-.9-3" />
    </>
  ),
  marker: <path d="M6.5 20.5V4M6.5 5h11l-2.6 3.6 2.6 3.6h-11" />,
  key: <path d="M12 3.8l7.8 8.2-7.8 8.2L4.2 12z" fill="currentColor" />,
  hold: (
    <>
      <rect x="3.5" y="7" width="17" height="10" rx="2.8" />
      <path d="M7.5 12h8.5M13.4 9.4L16 12l-2.6 2.6" />
    </>
  ),
  pixel: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.4" fill="currentColor" />
      <rect x="13" y="13" width="7" height="7" rx="1.4" fill="currentColor" />
      <rect x="13" y="4" width="7" height="7" rx="1.4" />
      <rect x="4" y="13" width="7" height="7" rx="1.4" />
    </>
  ),
  vector: (
    <>
      <path d="M6.5 16.5C8 5 15 19 17.5 7.5" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="6" r="2" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.6c-4.7 0-8.4 3.4-8.4 7.9 0 4.2 3.3 7.3 7.2 7.3 1.4 0 2-.9 2-1.8 0-1.2-1-1.5-1-2.7 0-1 .8-1.7 1.9-1.7H17c2 0 3.5-1.4 3.5-3.4 0-3.3-3.8-5.6-8.5-5.6z" />
      {dot(7.8, 10.2)}
      {dot(11.5, 7.5)}
      {dot(15.8, 9.4)}
    </>
  ),
  // playback
  play: <path d="M8.2 5.8v12.4a1 1 0 0 0 1.5.8l9.6-6.2a1 1 0 0 0 0-1.7L9.7 5a1 1 0 0 0-1.5.8z" fill="currentColor" />,
  pause: (
    <>
      <rect x="6.2" y="5" width="3.8" height="14" rx="1.4" fill="currentColor" />
      <rect x="14" y="5" width="3.8" height="14" rx="1.4" fill="currentColor" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2.6" fill="currentColor" />,
  prev: <path d="M16.2 6.2v11.6a.9.9 0 0 1-1.4.7l-7.6-5.8a.9.9 0 0 1 0-1.4l7.6-5.8a.9.9 0 0 1 1.4.7z" fill="currentColor" />,
  next: <path d="M7.8 6.2v11.6a.9.9 0 0 0 1.4.7l7.6-5.8a.9.9 0 0 0 0-1.4L9.2 5.5a.9.9 0 0 0-1.4.7z" fill="currentColor" />,
  first: (
    <>
      <path d="M5.5 5.5v13" />
      <path d="M18.4 6.4v11.2a.9.9 0 0 1-1.4.7l-7-5.6a.9.9 0 0 1 0-1.4l7-5.6a.9.9 0 0 1 1.4.7z" fill="currentColor" />
    </>
  ),
  last: (
    <>
      <path d="M18.5 5.5v13" />
      <path d="M5.6 6.4v11.2a.9.9 0 0 0 1.4.7l7-5.6a.9.9 0 0 0 0-1.4l-7-5.6a.9.9 0 0 0-1.4.7z" fill="currentColor" />
    </>
  ),
  loop: <path d="M17 3.8l3 3.2-3 3.2M20 7H8a4 4 0 0 0-4 4v.8M7 20.2L4 17l3-3.2M4 17h12a4 4 0 0 0 4-4v-.8" />,
  // small actions
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7M10 11v5.4M14 11v5.4" />,
  eye: (
    <>
      <path d="M2.8 12S6 5.8 12 5.8 21.2 12 21.2 12 18 18.2 12 18.2 2.8 12 2.8 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M9.9 5.97A9 9 0 0 1 12 5.8c6 0 9.2 6.2 9.2 6.2a15 15 0 0 1-2.5 3.2M6.3 7.3A15 15 0 0 0 2.8 12S6 18.2 12 18.2a9 9 0 0 0 4-1M9.9 9.9a2.8 2.8 0 0 0 4.2 3.7" />
      <path d="M4 4l16 16" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9.5" rx="3" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      {dot(12, 15.7, 1.3)}
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="9.5" rx="3" />
      <path d="M8 11V8a4 4 0 0 1 7.6-1.7" />
      {dot(12, 15.7, 1.3)}
    </>
  ),
  duplicate: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="3" />
      <path d="M15.2 9V7.5A3 3 0 0 0 12.2 4.5H7.5a3 3 0 0 0-3 3v4.7a3 3 0 0 0 3 3H9" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h8.5M17.5 7H20M4 12h2.5M11.5 12H20M4 17h10.5M19.5 17H20" />
      <circle cx="15" cy="7" r="2.4" />
      <circle cx="9" cy="12" r="2.4" />
      <circle cx="17" cy="17" r="2.4" />
    </>
  ),
  sliders: (
    <>
      <path d="M5 4v6M5 14v6M12 4v2M12 10v10M19 4v10M19 18v2" />
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="12" cy="8" r="2.2" />
      <circle cx="19" cy="16" r="2.2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8" />
      {dot(12, 17, 1.2)}
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.3" />
      <path d="M15.3 15.3L20 20" />
    </>
  ),
  // files
  export: <path d="M12 15V4.5M8 8.2l4-3.7 4 3.7M5 14v4.2A1.8 1.8 0 0 0 6.8 20h10.4a1.8 1.8 0 0 0 1.8-1.8V14" />,
  save: (
    <>
      <path d="M6.5 4h9.8L20 7.7v9.8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4z" />
      <path d="M8 4v4h6.5V4M7.5 20v-5.5h9V20" />
    </>
  ),
  open: (
    <>
      <path d="M3.6 17.6V6.8a1.8 1.8 0 0 1 1.8-1.8h3.4l2.2 2.4h6.4a1.8 1.8 0 0 1 1.8 1.8v1.4" />
      <path d="M3.8 19.2l2-7.3a1.5 1.5 0 0 1 1.4-1.1h13a1 1 0 0 1 1 1.3l-1.9 6.8a1.5 1.5 0 0 1-1.4 1.1H4.8z" />
    </>
  ),
  new: (
    <>
      <path d="M6.8 3.5h6.9l5 5v11a1.7 1.7 0 0 1-1.7 1.7H6.8a1.7 1.7 0 0 1-1.7-1.7v-14.3a1.7 1.7 0 0 1 1.7-1.7z" />
      <path d="M13.7 3.5v5h5M12 11.8v5.6M9.2 14.6h5.6" />
    </>
  ),
  folder: <path d="M3.6 7.4a2 2 0 0 1 2-2h3.6l2.2 2.5h7a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2z" />,
  undo: <path d="M9 5.5L4.5 10 9 14.5M5 10h9.5a4.5 4.5 0 0 1 0 9H11" />,
  redo: <path d="M15 5.5l4.5 4.5-4.5 4.5M19 10H9.5a4.5 4.5 0 0 0 0 9H13" />,
  // the small stuff
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.8l4.4 4.4L19 7.6" />,
  'chevron-left': <path d="M14.5 5.5L8 12l6.5 6.5" />,
  'chevron-right': <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  'chevron-up': <path d="M5.5 14.5L12 8l6.5 6.5" />,
  'chevron-down': <path d="M5.5 9.5L12 16l6.5-6.5" />,
  grip: (
    <>
      {dot(9, 6, 1.5)}
      {dot(15, 6, 1.5)}
      {dot(9, 12, 1.5)}
      {dot(15, 12, 1.5)}
      {dot(9, 18, 1.5)}
      {dot(15, 18, 1.5)}
    </>
  ),
  sparkle: (
    <>
      <path d="M11 4c.6 4.6 2.4 6.4 7.4 8.4-5 2-6.8 3.8-7.4 8.4-.6-4.6-2.4-6.4-7.4-8.4C8.6 10.4 10.4 8.6 11 4z" />
      <path d="M19 3.2v3.4M17.3 4.9h3.4" />
    </>
  ),
  heart: <path d="M12 20s-7.7-4.7-7.7-10.4a4.3 4.3 0 0 1 7.7-2.5 4.3 4.3 0 0 1 7.7 2.5C19.7 15.3 12 20 12 20z" />,
  film: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2.8" />
      <path d="M8.5 3.5v17M15.5 3.5v17M4 8.5h4.5M4 12h4.5M4 15.5h4.5M15.5 8.5H20M15.5 12H20M15.5 15.5H20" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3.2" />
      <circle cx="9" cy="9.7" r="1.7" />
      <path d="M4 17l5-4.8 3.8 3.6 2.7-2.4L20 17" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.2" />
      <path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" />
    </>
  ),
  warning: (
    <>
      <path d="M10.4 4.9a1.9 1.9 0 0 1 3.2 0l7.3 12.7A1.9 1.9 0 0 1 19.3 20.5H4.7a1.9 1.9 0 0 1-1.6-2.9z" />
      <path d="M12 9.8v4.2" />
      {dot(12, 17.1)}
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.2" />
      {dot(12, 7.9)}
    </>
  ),
  // a few extras the shell uses
  keyboard: (
    <>
      <rect x="2.8" y="6" width="18.4" height="12" rx="3.2" />
      <path d="M7 10h.01M10.7 10h.01M14.3 10h.01M17.5 10h.01M8 14.2h8" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18" />
    </>
  ),
  moon: <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" />,
  workspace: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M9.5 4v16M9.5 14h11" />
    </>
  ),
};

export const ICON_NAMES = Object.keys(ICONS);

export function Icon({ name, size = 18, className, title }: { name: string; size?: number; className?: string; title?: string }) {
  const art = ICONS[name];
  return (
    <svg
      className={`ui-icon${className ? ' ' + className : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
    >
      {art ?? <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />}
    </svg>
  );
}

/** The little logo: Quill's app icon, pixel art drawn at 32x32 (brand/quill/quill-icons.mjs). Keep `size` a multiple of 32. */
export function Logo({ size = 32 }: { size?: number }) {
  return <img className="ui-logo" src="mascot/logo.png" width={size} height={size} alt="" aria-hidden="true" draggable={false} style={{ imageRendering: 'pixelated' }} />;
}
