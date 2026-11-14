// What the export dialog collects, and what the exporters take.
import { ownedUndo } from '../core/owners';
import type { ContactOpts } from './contact';
import type { IconParts } from './icons';
import { allExporters, exporterInfo, exporterOf, splitExporters } from './registry';
// The built-in formats register themselves when this file is loaded, so a format can always be looked up by its id.
import './builtin';

/** The id of a registered export format (see registry.ts). Saved in settings, so an id is never reused. */
export type FormatId = string;
/**
 * What a .ai export does with an animation: 'one' is the frame being looked at, 'files' one file per frame (in a zip),
 * 'pages' one PDF page per frame (Illustrator asks which page to open, and layers arrive as groups), 'artboards' every
 * frame as an artboard of one file.
 */
export type AiFrames = 'one' | 'files' | 'pages' | 'artboards';
/** 'inOut' is the play range set on the timeline (see Doc.inOut). */
export type RangeKind = 'all' | 'clip' | 'frame' | 'inOut';

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
  /** Godot, for a document with bones: baked frames on a sheet (missing), or the skeleton itself, editable in Godot. */
  godotRig?: 'frames' | 'bones';
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

/** Where a sprite sheet can go. Godot is registered by the Godot exports feature, so it goes with it. */
const engines: EngineInfo[] = [
  { id: 'unity', title: 'Unity', files: 'Sliced sprites and animation clips', help: 'export-unity', game: true },
  { id: 'phaser', title: 'Phaser', files: 'Atlas and animations JSON', help: 'export-phaser', game: true },
  { id: 'pixi', title: 'PixiJS', files: 'Spritesheet JSON with animations', help: 'export-pixi', game: true },
  { id: 'css', title: 'Web page (CSS)', files: 'CSS classes and keyframes', help: 'export-css-sprites', game: false },
  { id: 'json', title: 'Any engine (JSON)', files: 'A common JSON atlas', help: 'export-sprite-sheets', game: false },
  { id: 'none', title: 'Just the picture', files: 'Only the PNG', help: 'export-sprite-sheets', game: false },
];

/** Where the engine's card sits among the others (lower first). */
const ENGINE_ORDER: Record<string, number> = { godot: 0, unity: 1, phaser: 2, pixi: 3, css: 4, json: 5, none: 6 };
const engineRank = (id: string): number => ENGINE_ORDER[id] ?? 50;

/** Every engine on offer, game engines first (in the order the picker shows them). */
export const allEngines = (): EngineInfo[] => [...engines].sort((a, b) => engineRank(a.id) - engineRank(b.id));

/** Adds an engine to the picker; taken away again with the feature that registered it. */
export function registerEngine(info: EngineInfo): void {
  const before = engines.findIndex((e) => e.id === info.id);
  if (before >= 0) engines[before] = info;
  else engines.push(info);
  ownedUndo(() => {
    const i = engines.indexOf(info);
    if (i >= 0) engines.splice(i, 1);
  });
}

export const hasEngine = (id: string): boolean => engines.some((e) => e.id === id);

export function engineInfo(id: EngineId): EngineInfo {
  return engines.find((e) => e.id === id) ?? engines[engines.length - 1];
}

/** Fills in the newer sheet fields, working out the engine from the older ticks when it is missing. */
export function normalizeSheet(s: SheetSettings): Required<SheetSettings> {
  // Settings made for an engine that is not on offer (Godot with its feature off) fall back to what they would have been without it.
  const engine: EngineId = s.engine && hasEngine(s.engine) ? s.engine : (s.godot || s.godotScene) && hasEngine('godot') ? 'godot' : s.json ? 'json' : 'none';
  return {
    ...s,
    engine,
    layout: s.layout === 'packed' ? 'packed' : 'grid',
    extrude: Math.max(0, Math.min(8, Math.round(s.extrude ?? 0))),
    content: s.content === 'separate' ? 'separate' : 'animation',
    separateFiles: s.separateFiles === true,
    jsonStyle: s.jsonStyle === 'hash' ? 'hash' : 'array',
    unityScript: s.unityScript !== false,
    godotRig: s.godotRig === 'bones' ? 'bones' : 'frames',
  };
}

export interface ExportSettings extends ContactOpts {
  format: FormatId;
  range: RangeKind;
  /** For `range: 'clip'`. */
  clipId: string | null;
  /** Output size as a multiple of the document size. */
  scale: number;
  transparent: boolean;
  loop: boolean;
  /** The loop setting was chosen by hand, so a clip's own (plays forever, N times or once) no longer sets it. */
  loopTouched?: boolean;
  /** GIF only. */
  dither: boolean;
  sheet: SheetSettings;
  /** Interactives package: carry the editable .frameling file inside it (missing = yes). */
  includeSource?: boolean;
  /** Lottie only: how pictures made from effects are stored (missing = balanced). */
  lottiePictures?: 'balanced' | 'sharp' | 'small';
  /** Lottie only: one `.json`, or a dotLottie `.lottie` that carries its pictures as files (missing = json). */
  lottieFile?: 'json' | 'dotlottie';
  /** dotLottie only: the layout, 2 (missing, the current spec: the loop setting is a small state machine) or 1 (older players: the loop setting is in the manifest). */
  dotLottieVersion?: 1 | 2;
  /** Lottie only: Soften and Shadow as Lottie's own effects (missing) or as pictures every player shows. */
  lottieSoft?: 'effects' | 'pictures';
  /** Illustrator only: what to do with several frames (missing = 'one'). */
  aiFrames?: AiFrames;
  /** JPEG only: 1 to 100 (missing = 90). */
  jpegQuality?: number;
  /** WebP only: 1 to 100 (missing = 85). */
  webpQuality?: number;
  /** WebP only: lose nothing (missing = yes for pixel art, no otherwise). */
  webpLossless?: boolean;
  /** App icon set only: which parts to make (missing = the pictures, .ico and .icns, not the phone sizes). */
  iconFiles?: Partial<IconParts>;
  /** Sticker pack only: the ids of the apps to make sizes for, joined with commas (missing = all of them, empty = none). */
  stickerFor?: string;
}

/** The way a .ai export packs frames (the frame being looked at unless asked otherwise). */
export const aiFramesOf = (s: Pick<ExportSettings, 'format' | 'aiFrames'>): AiFrames => (s.format === 'ai' && s.aiFrames) || 'one';
/** One frame comes out: the format is a still, or "This frame" is picked, or an Illustrator file is set to one frame. */
export const oneFrameOnly = (s: Pick<ExportSettings, 'format' | 'range' | 'aiFrames'>, animated: boolean): boolean => !animated || s.range === 'frame' || !!exporterOf(s.format)?.singleFrame?.(s as ExportSettings);

export interface FormatInfo {
  id: FormatId;
  title: string;
  /** Small second line on the card ("H.264"). */
  tag: string;
  /** "Good for ..." in one line. */
  goodFor: string;
  icon: 'film' | 'image' | 'grid' | 'play' | 'layers' | 'vector';
  /** File extension without the dot (a .zip for sequences). */
  ext: string;
  /** Needs more than one frame. */
  animated: boolean;
  /** Can leave the background see-through. */
  alpha: boolean;
}

/** The cards of every registered format, in order. */
export const allFormats = (): FormatInfo[] => allExporters().map((d) => d.info);

export const formatInfo = (id: FormatId): FormatInfo => exporterInfo(id);

export const DEFAULT_SHEET: SheetSettings = { columns: 0, padding: 0, trim: false, pot: false, dedupe: true, json: true, godot: false, godotScene: false, godotPath: '' };

/** The format name inside a .flplay's manifest (here so opening one doesn't load the exporter). */
export const PLAYABLE_FORMAT = 'frameling-playable';

/** The format cards split into the popular ones (the formats most people want, in the order the dialog shows them) and the rest, under "More formats". */
export function splitFormats(formats?: FormatInfo[]): { popular: FormatInfo[]; more: FormatInfo[] } {
  if (!formats) return splitExporters();
  const split = splitExporters();
  return { popular: split.popular.filter((f) => formats.some((x) => x.id === f.id)), more: formats.filter((f) => !split.popular.some((p) => p.id === f.id)) };
}
