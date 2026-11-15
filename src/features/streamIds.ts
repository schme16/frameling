// Which features are the streaming ones, as plain data (no registry), so the first-run hello and its tests can read it.

/** Every feature that is only for streaming, in the order the Features page lists them. The Actions door comes first because the others need it. */
export const STREAM_FEATURES: readonly string[] = [
  'stream-door',
  'quill-reacts',
  'stream-dares',
  'stream-penmods',
  'prompt-jar',
  'stream-votes',
  'stream-guess',
  'stream-overlay',
  'stream-twitch',
];

/** The plain name for the lot, for switches, toasts and menus. */
export const STREAMING_NAME = 'Streaming tools';
