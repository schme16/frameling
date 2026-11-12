// Frameling's icon set: original, rounded and a little cute. 24 x 24 grid, 2px round strokes, `currentColor` for
// everything so an icon takes the colour of its button. Filled bits (play, dots) use fill="currentColor".
import type { ReactNode } from 'react';

const dot = (cx: number, cy: number, r = 1.2) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

const ICONS: Record<string, ReactNode> = {
  // plugins and templates
  plugin: <path d="M9 4.5a2 2 0 0 1 4 0V7h4a1 1 0 0 1 1 1v3.5h-1.5a2 2 0 0 0 0 4H18V19a1 1 0 0 1-1 1h-3.5v-1.5a2 2 0 0 0-4 0V20H6a1 1 0 0 1-1-1v-4h1.5a2 2 0 0 0 0-4H5V8a1 1 0 0 1 1-1h3z" />,
  template: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M4 9h16M9 9v11" />
    </>
  ),
  // artboards: a page with crop marks at two corners
  artboard: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <path d="M6 2v2.5M2 6h2.5M18 22v-2.5M22 18h-2.5" />
    </>
  ),
  // symbols and tweens
  symbol: (
    <>
      <rect x="4" y="7" width="11" height="11" rx="2.5" />
      <path d="M9 4h8.5A2.5 2.5 0 0 1 20 6.5V15" />
    </>
  ),
  tween: (
    <>
      {dot(5, 12, 2.2)}
      {dot(19, 12, 2.2)}
      <path d="M8 12h7.5" />
      <path d="M13 9l3 3-3 3" />
    </>
  ),
  path: (
    <>
      <path d="M4 18c3-9 6 3 9-5s5-6 7-6" strokeDasharray="2.5 3" />
      {dot(4, 18, 2)}
      <path d="M17 4.5l3 2.5-3 2.5" />
    </>
  ),
  // shape tweens, camera, clip flow
  morph: (
    <>
      <rect x="3" y="9" width="8" height="8" rx="1.5" />
      <circle cx="17.5" cy="13" r="4" />
      <path d="M11.5 7.5c1.5-1.5 3.5-1.5 5 0" />
    </>
  ),
  hint: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M10 15.5V9.5h2.2a2 2 0 0 1 0 4H10" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="7" width="13" height="10" rx="2.5" />
      <path d="M16 11l5-3v8l-5-3" />
      {dot(7.5, 12, 1.4)}
    </>
  ),
  flow: (
    <>
      <rect x="3" y="4" width="7" height="5" rx="1.5" />
      <rect x="14" y="15" width="7" height="5" rx="1.5" />
      <path d="M6.5 9v3.5a2.5 2.5 0 0 0 2.5 2.5h4" />
      <path d="M11.5 13l2 2-2 2" />
    </>
  ),
  // bones
  bone: (
    <>
      <circle cx="6" cy="18" r="2.6" />
      <path d="M8 16.2L16.6 6.8l1.9 1.9L9.8 18" />
      <circle cx="18" cy="6" r="1.6" />
    </>
  ),
  pose: (
    <>
      <circle cx="12" cy="4.8" r="2" />
      <path d="M12 7.5v6.3M12 13.8l-3.6 6M12 13.8l3.8 3.4 1.2 3M12 9.6l-4.8 1.6M12 9.6l4.2-2.6" />
    </>
  ),
  pin: (
    <>
      <path d="M9 3.8h6M10 3.8l-.6 6.4-3 3h11.2l-3-3-.6-6.4" />
      <path d="M12 13.2v7" />
    </>
  ),
  weights: (
    <>
      <circle cx="5.5" cy="18.5" r="2" />
      <path d="M7 17l5.2-5.2" />
      <circle cx="16" cy="8" r="5" strokeDasharray="2 2" />
      {dot(16, 8, 1.8)}
    </>
  ),
  rig: (
    <>
      <circle cx="12" cy="5" r="2" />
      {dot(12, 12, 1.6)}
      {dot(7, 19, 1.6)}
      {dot(17, 19, 1.6)}
      <path d="M12 7v5M12 12l-5 7M12 12l5 7" />
    </>
  ),
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
  // Drawing tools added with the pen: pen nib, points on a curve, polygon, star, gradient
  pen: (
    <>
      <path d="M12 3.5l5.2 7.6-2.4 7.4H9.2l-2.4-7.4z" />
      <path d="M12 3.5v7.2" />
      <circle cx="12" cy="12.2" r="1.4" />
      <path d="M8.8 21h6.4" />
    </>
  ),
  points: (
    <>
      <path d="M4.5 17.5C7 8 15 6 19.5 9" />
      <rect x="2.8" y="15.8" width="3.4" height="3.4" rx="0.6" fill="currentColor" />
      <rect x="10.3" y="8.3" width="3.4" height="3.4" rx="0.6" />
      <path d="M7.4 12.6l9-3.8" />
      <circle cx="17.6" cy="7.6" r="1.3" fill="currentColor" />
    </>
  ),
  polygon: <path d="M12 3.8l8 5.8-3 9.6H7l-3-9.6z" />,
  pointy: <path d="M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.6l-5.1 2.8 1.1-5.8-4.3-4 5.8-.7z" />,
  gradient: (
    <>
      <rect x="3.8" y="5" width="16.4" height="14" rx="3" />
      <path d="M8 5v14" opacity="0.85" />
      <path d="M11.5 5v14" opacity="0.6" />
      <path d="M15 5v14" opacity="0.35" />
    </>
  ),
  select: <path d="M6.2 4.4l11.6 6-5.1 1.6-2.1 5.2z" />,
  lasso: (
    <>
      <path d="M8.5 15.5C5.2 14.6 3 12.6 3 10.2 3 6.8 7 4 12 4s9 2.8 9 6.2-4 6.2-9 6.2" />
      <path d="M8.8 15.3c-.9 1.6-.5 3.3 1 3.9 1.4.6 1.6 1.7.7 2.8" />
    </>
  ),
  // A plain wand pointing at a pixel. No twinkles: stars and sparkles read as "AI" now.
  wand: (
    <>
      <path d="M4 20l8.6-8.6" />
      <path d="M12.6 11.4l1.6-1.6" strokeWidth={3.4} />
      <rect x="16.5" y="3.5" width="4.5" height="4.5" rx="1" fill="currentColor" />
    </>
  ),
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
  tilemap: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M3.5 12h17M12 3.5v17" />
      <rect x="6" y="6" width="3.5" height="3.5" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="14.5" y="14.5" width="3.5" height="3.5" rx="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  tiles: (
    <>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.6" fill="currentColor" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.6" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.6" />
      <path d="M13 16.75h7.5M16.75 13v7.5" />
    </>
  ),
  'tile-mode': (
    <>
      <rect x="8" y="8" width="8" height="8" rx="1.4" fill="currentColor" />
      <path d="M3.5 8h1.5M19 8h1.5M3.5 16h1.5M19 16h1.5M8 3.5v1.5M16 3.5v1.5M8 19v1.5M16 19v1.5" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" strokeDasharray="2 2.4" />
    </>
  ),
  vector: (
    <>
      <path d="M6.5 16.5C8 5 15 19 17.5 7.5" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="6" r="2" />
    </>
  ),
  // sound and lip sync
  sound: (
    <>
      <path d="M4.5 9.5h3L12 5.8v12.4l-4.5-3.7h-3z" />
      <path d="M15.4 9.2a4 4 0 0 1 0 5.6M17.9 6.7a7.4 7.4 0 0 1 0 10.6" />
    </>
  ),
  'sound-off': (
    <>
      <path d="M4.5 9.5h3L12 5.8v12.4l-4.5-3.7h-3z" />
      <path d="M16 9.5l4.5 5M20.5 9.5L16 14.5" />
    </>
  ),
  mouth: (
    <>
      <path d="M3.6 11.4c2.8-1.5 5.1-1.2 8.4.3 3.3-1.5 5.6-1.8 8.4-.3-.6 4.2-4.1 6.6-8.4 6.6s-7.8-2.4-8.4-6.6z" />
      <path d="M8.5 14.6c2-1 5-1 7 0" />
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
  pingpong: <path d="M16 5l4 3.5-4 3.5M20 8.5H6M8 12l-4 3.5L8 19M4 15.5h14" />,
  range: (
    <>
      <path d="M7 5H4.5v14H7M17 5h2.5v14H17" />
      <path d="M10 9.5l4 2.5-4 2.5z" fill="currentColor" />
    </>
  ),
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
  // Two chain links: width and height kept together.
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  // The same links pulled apart.
  unlink: (
    <>
      <path d="M13.5 7.3l.5-.5a4 4 0 0 1 5.7 5.7l-1.7 1.7" />
      <path d="M10.5 16.7l-.5.5a4 4 0 0 1-5.7-5.7l1.7-1.7" />
      <path d="M4 4l2 2M20 20l-2-2" />
    </>
  ),
  ruler: (
    <>
      <rect x="3" y="7.5" width="18" height="9" rx="2" />
      <path d="M7 7.5v3M11 7.5v4.5M15 7.5v3M19 7.5v1.5" />
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
  // quests: a dotted route to a pin
  quest: (
    <>
      <path d="M17 3.5a3.6 3.6 0 0 0-3.6 3.6c0 2.7 3.6 6.2 3.6 6.2s3.6-3.5 3.6-6.2A3.6 3.6 0 0 0 17 3.5z" />
      {dot(17, 7.1, 1.1)}
      <path d="M7.5 19.5c3 0 3.5-2.8 6.5-2.8 1.6 0 2.5-.6 2.9-1.6" strokeDasharray="0.1 3.1" />
      {dot(4.5, 19.5, 1.9)}
    </>
  ),
  // tips: a lightbulb
  tip: (
    <>
      <path d="M9.5 16.5v-1.2c0-.9-.5-1.6-1.2-2.3A6 6 0 1 1 15.7 13c-.7.7-1.2 1.4-1.2 2.3v1.2z" />
      <path d="M9.5 19.5h5" />
    </>
  ),
  // "Show me": watch it done for you
  'show-me': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.7v6.6a.6.6 0 0 0 .9.5l5.2-3.3a.6.6 0 0 0 0-1L10.9 8.2a.6.6 0 0 0-.9.5z" fill="currentColor" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.6C10.3 5.3 7.8 4.6 4 4.6v13.2c3.8 0 6.3.7 8 2 1.7-1.3 4.2-2 8-2V4.6c-3.8 0-6.3.7-8 2z" />
      <path d="M12 6.6v13.2" />
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
  // a window floating over another, and a panel docked along the bottom of one
  float: (
    <>
      <rect x="3.5" y="9" width="11.5" height="10" rx="2.2" />
      <path d="M9 9V7.2a2.2 2.2 0 0 1 2.2-2.2h7.1a2.2 2.2 0 0 1 2.2 2.2v6.6a2.2 2.2 0 0 1-2.2 2.2H15" />
    </>
  ),
  dock: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.6" />
      <path d="M3.5 14.5h17" />
    </>
  ),
  workspace: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M9.5 4v16M9.5 14h11" />
    </>
  ),
  // pixel art tools
  shade: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M4 15.5L15.5 4M4 20l16-16" />
      <path d="M9.5 20L20 9.5" />
    </>
  ),
  dither: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <rect x="7" y="7" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="14" y="7" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="10.5" y="10.5" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="7" y="14" width="3" height="3" fill="currentColor" stroke="none" />
      <rect x="14" y="14" width="3" height="3" fill="currentColor" stroke="none" />
    </>
  ),
  mirror: (
    <>
      <path d="M12 3v18" strokeDasharray="2 2.6" />
      <path d="M9 7L4 17h5zM15 7l5 10h-5z" />
    </>
  ),
  outline: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" strokeDasharray="3 2.4" />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1.6" fill="currentColor" />
    </>
  ),
  rotate: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4v4.5H15" />
    </>
  ),
  // blend modes, effects, masks and folders
  effects: (
    <>
      <path d="M5 19L15.5 8.5" />
      <path d="M14 7l3 3" />
      <path d="M8 4.5v3M6.5 6h3M18.5 13v3M17 14.5h3M19 4l.01 0" />
    </>
  ),
  blend: (
    <>
      <circle cx="9.5" cy="10" r="5.5" />
      <circle cx="14.5" cy="14" r="5.5" />
    </>
  ),
  mask: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </>
  ),
  'clip-below': (
    <>
      <path d="M7 4.5v7a3 3 0 0 0 3 3h8" />
      <path d="M15 11.5l3 3-3 3" />
    </>
  ),
  'fx-blur': (
    <>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <circle cx="12" cy="12" r="6.5" strokeDasharray="2 2.6" />
      <circle cx="12" cy="12" r="9" strokeDasharray="1 3.4" opacity="0.6" />
    </>
  ),
  'fx-halo': (
    <>
      <circle cx="12" cy="12" r="3.6" fill="currentColor" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" />
    </>
  ),
  'fx-shadow': (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2.5" fill="currentColor" opacity="0.35" stroke="none" />
      <rect x="5" y="5" width="11" height="11" rx="2.5" />
    </>
  ),
  'fx-adjust': (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </>
  ),
  'fx-outline': (
    <>
      <path d="M12 4.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L12 16.3l-4.6 2.4.9-5.1-3.8-3.6 5.2-.8z" fill="currentColor" opacity="0.35" />
      <path d="M12 2.2l3 6.1 6.7 1-4.9 4.7 1.2 6.6L12 17.5 6 20.6l1.2-6.6-4.9-4.7 6.7-1z" />
    </>
  ),
  'fx-pixelate': (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="13" y="13" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
    </>
  ),
  text: (
    <>
      <path d="M5 6.5V5h14v1.5" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </>
  ),
  particles: (
    <>
      <circle cx="5.5" cy="18.5" r="2" fill="currentColor" />
      <circle cx="11" cy="12" r="1.6" fill="currentColor" />
      <circle cx="16" cy="7.5" r="1.3" fill="currentColor" />
      <circle cx="19.5" cy="13" r="1" fill="currentColor" />
      <circle cx="12.5" cy="4.5" r="0.9" fill="currentColor" />
      <circle cx="17" cy="18" r="0.9" fill="currentColor" />
    </>
  ),
  'pt-burst': (
    <>
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2" />
    </>
  ),
  'pt-smoke': (
    <>
      <path d="M7 17.5a3.5 3.5 0 0 1 .4-7 4.5 4.5 0 0 1 8.7-.8 3.9 3.9 0 0 1 .4 7.8z" />
      <path d="M9 21h6" opacity="0.6" />
    </>
  ),
  'pt-rain': <path d="M8 4l-2 5M14 4l-2 5M20 4l-2 5M8 13l-2 5M14 13l-2 5M20 13l-2 5" />,
  'pt-snow': (
    <>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      <path d="M10 4.5l2 1.5 2-1.5M10 19.5l2-1.5 2 1.5" />
    </>
  ),
  'pt-confetti': (
    <>
      <rect x="4" y="5" width="4" height="2.4" rx="0.5" transform="rotate(-20 6 6)" fill="currentColor" />
      <rect x="14" y="4" width="4" height="2.4" rx="0.5" transform="rotate(25 16 5)" />
      <rect x="9" y="11" width="4" height="2.4" rx="0.5" transform="rotate(10 11 12)" fill="currentColor" />
      <rect x="16" y="14" width="4" height="2.4" rx="0.5" transform="rotate(-35 18 15)" fill="currentColor" />
      <rect x="5" y="17" width="4" height="2.4" rx="0.5" transform="rotate(40 7 18)" />
    </>
  ),
  'pt-dust': (
    <>
      <circle cx="6" cy="8" r="1" fill="currentColor" />
      <circle cx="14" cy="5.5" r="0.8" fill="currentColor" />
      <circle cx="18.5" cy="11" r="1.2" fill="currentColor" />
      <circle cx="10" cy="13" r="0.9" fill="currentColor" />
      <circle cx="5.5" cy="18" r="1.1" fill="currentColor" />
      <circle cx="15" cy="18.5" r="0.8" fill="currentColor" />
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
