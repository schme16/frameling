// What the export dialog collects, and what the exporters take.

export type FormatId = 'mp4' | 'webm' | 'gif' | 'apng' | 'png' | 'pngseq' | 'svg' | 'sheet';
export type RangeKind = 'all' | 'clip' | 'frame';

export interface SheetSettings {
  /** 0 picks a roughly square layout. */
  columns: number;
  /** Empty pixels around every frame, to stop neighbours bleeding into each other. */
  padding: number;
  /** Cut each frame down to its drawn part. */
  trim: boolean;
  /** Make the sheet a power-of-two size, which some older engines and GPUs like. */
  pot: boolean;
  /** Frames that look the same as the one before are stored once. */
  dedupe: boolean;
  json: boolean;
  godot: boolean;
  godotScene: boolean;
  /** Where the picture will live in the Godot project. Empty means the default, res://sprites/<name>.png. */
  godotPath: string;
  /** Who the files are for. Missing in settings saved before engines existed (see normalizeSheet). */
  engine?: EngineId;
  /** A tidy grid, or packed tightly (frames of different sizes fit together). */
  layout?: 'grid' | 'packed';
  /** Pixels of edge colour copied outward around each frame, so scaled or rotated sprites never show a seam. */
  extrude?: number;
  /** An animation (clips play), or separate sprites like icons and tiles. */
  content?: 'animation' | 'separate';
  /** Separate sprites only: one PNG per sprite instead of one sheet. */
  separateFiles?: boolean;
  /** Generic JSON: frames as a list or keyed by name. */
  jsonStyle?: 'array' | 'hash';
  /** Unity: include the small importer script (only needed once per project). */
  unityScript?: boolean;
}

export type EngineId = 'godot' | 'unity' | 'phaser' | 'pixi' | 'css' | 'json' | 'none';

export interface EngineInfo {
  id: EngineId;
  /** Plain name on the card. */
  title: string;
  /** What gets saved, in a few words. */
  files: string;
  /** Help topic with the steps for that engine. */
  help: string;
  /** A game engine (grouped under "For a game engine") or something else. */
  game: boolean;
}

export const ENGINES: EngineInfo[] = [
  { id: 'godot', title: 'Godot', files: 'Sprite frames and a ready scene', help: 'export-godot', game: true },
  { id: 'unity', title: 'Unity', files: 'Sliced sprites and animation clips', help: 'export-unity', game: true },
  { id: 'phaser', title: 'Phaser', files: 'Atlas and animations JSON', help: 'export-phaser', game: true },
  { id: 'pixi', title: 'PixiJS', files: 'Spritesheet JSON with animations', help: 'export-pixi', game: true },
  { id: 'css', title: 'Web page (CSS)', files: 'CSS classes and keyframes', help: 'export-css-sprites', game: false },
  { id: 'json', title: 'Any engine (JSON)', files: 'A common JSON atlas', help: 'export-sprite-sheets', game: false },
  { id: 'none', title: 'Just the picture', files: 'Only the PNG', help: 'export-sprite-sheets', game: false },
];

export function engineInfo(id: EngineId): EngineInfo {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[ENGINES.length - 1];
}

/** Fills in the newer sheet fields, working out the engine from the older ticks when it is missing. */
export function normalizeSheet(s: SheetSettings): Required<SheetSettings> {
  const engine: EngineId = s.engine && ENGINES.some((e) => e.id === s.engine) ? s.engine : s.godot || s.godotScene ? 'godot' : s.json ? 'json' : 'none';
  return {
    ...s,
    engine,
    layout: s.layout === 'packed' ? 'packed' : 'grid',
    extrude: Math.max(0, Math.min(8, Math.round(s.extrude ?? 0))),
    content: s.content === 'separate' ? 'separate' : 'animation',
    separateFiles: s.separateFiles === true,
    jsonStyle: s.jsonStyle === 'hash' ? 'hash' : 'array',
    unityScript: s.unityScript !== false,
  };
}

export interface ExportSettings {
  format: FormatId;
  range: RangeKind;
  /** For `range: 'clip'`. */
  clipId: string | null;
  /** Output size as a multiple of the document size. */
  scale: number;
  transparent: boolean;
  loop: boolean;
  /** GIF only. */
  dither: boolean;
  sheet: SheetSettings;
}

export interface FormatInfo {
  id: FormatId;
  title: string;
  /** Small second line on the card ("H.264"). */
  tag: string;
  /** "Good for ..." in one line. */
  goodFor: string;
  icon: 'film' | 'image' | 'grid';
  /** File extension without the dot (a .zip for sequences). */
  ext: string;
  /** Needs more than one frame. */
  animated: boolean;
  /** Can leave the background see-through. */
  alpha: boolean;
}

export const FORMATS: FormatInfo[] = [
  { id: 'mp4', title: 'MP4 video', tag: 'H.264', goodFor: 'Sharing and social media. Plays nearly everywhere.', icon: 'film', ext: 'mp4', animated: true, alpha: false },
  { id: 'webm', title: 'WebM video', tag: 'VP9', goodFor: 'The web, and videos with a see-through background.', icon: 'film', ext: 'webm', animated: true, alpha: true },
  { id: 'gif', title: 'Animated GIF', tag: 'GIF', goodFor: 'Chats, forums and anywhere a video will not play.', icon: 'image', ext: 'gif', animated: true, alpha: true },
  { id: 'apng', title: 'Animated PNG', tag: 'APNG', goodFor: 'Sharper than a GIF, with soft see-through edges.', icon: 'image', ext: 'png', animated: true, alpha: true },
  { id: 'png', title: 'PNG picture', tag: 'This frame', goodFor: 'A single still picture you can use anywhere.', icon: 'image', ext: 'png', animated: false, alpha: true },
  { id: 'pngseq', title: 'PNG sequence', tag: '.zip', goodFor: 'Video editors and other tools that want one picture per frame.', icon: 'grid', ext: 'zip', animated: true, alpha: true },
  { id: 'svg', title: 'SVG drawing', tag: 'This frame', goodFor: 'Vector art that stays sharp at any size.', icon: 'image', ext: 'svg', animated: false, alpha: true },
  { id: 'sheet', title: 'Sprite sheet', tag: 'For games', goodFor: 'Godot, Unity, Phaser, PixiJS or a web page: every frame on one picture.', icon: 'grid', ext: 'png', animated: true, alpha: true },
];

export function formatInfo(id: FormatId): FormatInfo {
  return FORMATS.find((f) => f.id === id)!;
}

export const DEFAULT_SHEET: SheetSettings = { columns: 0, padding: 0, trim: false, pot: false, dedupe: true, json: true, godot: false, godotScene: false, godotPath: '' };
