/**
 * The Frameling document format, version 1.
 *
 * This file is the contract every part of the app builds on (canvas, tools, timeline, export, files), and it will
 * become the shared format package Interactives reads. Keep it free of DOM and Electron imports: plain data only.
 *
 * Units: positions are document pixels (the stage is `width` x `height`, origin top-left). Time is whole frames at
 * `fps`; frame 0 is the first frame.
 */

export const FORMAT_VERSION = 2;
export type Id = string;

/** A colour as CSS hex (`#rrggbb` or `#rrggbbaa`). */
export type Color = string;

/**
 * Room for data that belongs to a feature or plugin Frameling does not know about (or has turned off): `ext[featureId]`
 * holds that feature's own plain JSON. The file reader keeps it exactly as written and the writer puts it back, so
 * nothing is lost when the owner is missing. Plain data only (no functions, no class instances); capped in size and depth on load.
 */
export type Ext = Record<string, unknown>;

export interface Doc {
  format: 'frameling';
  version: number;
  id: Id;
  name: string;
  /**
   * True when every shape in this document carries lineage (`origin`) from the start, so keys that look alike but have
   * no shared lineage are unrelated. Set on documents made by this version; missing in older files, where the selection
   * still follows by position (see src/core/followSelection.ts). Kept on saving, never added to an old document.
   */
  lineage?: true;
  /** Stage size in document pixels. */
  width: number;
  height: number;
  /** Frames per second. */
  fps: number;
  /** Dots per inch, for showing sizes in mm, cm, in or pt (missing = 96, one document pixel per CSS pixel). */
  dpi?: number;
  /** Total length in frames (at least 1). Playback and export run from 0 to length - 1 unless a clip says otherwise. */
  length: number;
  /** Stage colour, or null for transparent. */
  background: Color | null;
  /** Layers, bottom first: index 0 is drawn first (furthest back). */
  layers: Layer[];
  /** Every drawing, by id. Cels point at them, and several cels can share one drawing. */
  drawings: Record<Id, Drawing>;
  /** Named frame ranges (idle, run, jump). Sprite sheets, Godot and Interactives use these as animations. */
  clips: Clip[];
  /** Named moments (footstep, hit). Become events in game engines and Interactives. */
  markers: Marker[];
  /** The document's colour swatches. */
  swatches: Swatch[];
  /** Pixel tiles that tilemap layers are painted with. Missing in documents that have never used tiles. */
  tileset?: Tileset;
  /** The pixel art palette: an ordered list of colours in ramps (optional; missing = the starter palette). */
  palette?: DocPalette;
  /** Layer folders, by id (missing = none). Layers name theirs with `folder`. See src/effects. */
  folders?: Record<Id, LayerFolder>;
  /** Reusable drawings with their own timelines, by id (missing = none). See `SymbolDef`. */
  symbols?: Record<Id, SymbolDef>;
  /**
   * Set while a symbol is open for editing in place: the stack of symbols entered, innermost last. While it's set,
   * `layers` and `length` are the open symbol's, and each entry keeps what it replaced. Never saved (see rootDoc).
   */
  editing?: EditFrame[];
  /** How clips lead to each other: which plays first and what follows what (missing = no flow). See `ClipFlow`. */
  flow?: ClipFlow;
  /** Sound clips on the audio track, in the order they were added (missing = none). See `AudioClip`. */
  audio?: AudioClip[];
  /** Guide lines dragged out of the rulers (missing = none). Never drawn in exports. See `Guide`. */
  guides?: Guide[];
  /** The play range set on the timeline (in and out, inclusive): only these frames play and loop (missing = all). */
  inOut?: { start: number; end: number };
  /** Perspective guides: one or two vanishing points in stage pixels (missing = none). Never drawn in exports. */
  perspective?: { points: { x: number; y: number }[] };
  /**
   * Artboards: several named canvases in one document, each with its own size, background, layers and timeline (a
   * sprite, a shot). The open one's content is the document's own fields (`width` to `perspective`); the others keep theirs
   * in `Artboard.content`. Palette, swatches, symbols, tiles and fps are shared. Missing = the document is one artboard.
   * See src/artboards.
   */
  artboards?: Artboard[];
  /** The id of the open artboard (missing = the first). */
  activeArtboard?: Id;
  /** How a pixel sprite is built (missing = worked out from the document, see src/pixel/way.ts). */
  sprite?: SpriteInfo;
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
}

/**
 * The four ways to build a sprite: one picture, an animation (frames on the timeline), frames on boards (one artboard per
 * frame) or sprites on a sheet (one artboard per sprite).
 */
export type SpriteWay = 'picture' | 'animation' | 'boards' | 'sheet';

/** What a document says about the sprite in it. */
export interface SpriteInfo {
  way: SpriteWay;
}

/** One artboard (see Doc.artboards). */
export interface Artboard {
  id: Id;
  name: string;
  /** Top-left corner on the pasteboard, in document pixels. Content inside is measured from here. */
  x: number;
  y: number;
  /** The file name exports use (missing = the name). */
  exportName?: string;
  /** What it holds while another artboard is open. Missing on the open one. */
  content?: ArtboardContent;
  /**
   * A variation (a linked copy): the id of the artboard it follows. It stores only `overrides`; everything else comes
   * from that artboard. In memory `content` is its resolved copy while another artboard is open; in a file only the
   * overrides are written. Never a variation itself. See src/artboards/variations.ts.
   */
  variationOf?: Id;
  /** What a variation changes from its original (missing or empty = nothing yet). */
  overrides?: VariationOverrides;
}

/** Changes to a plain object: `set` gives new values for properties, `del` names properties taken away. */
export interface Patch {
  set?: Record<string, unknown>;
  del?: string[];
}

/** Changes to a list of things with ids (layers, keys, shapes). Items not named follow the original. */
export interface ListOverride<T, S = never> {
  /** Items of the original that changed: their own properties (`patch`) and anything inside them (`sub`). */
  items?: Record<Id, { patch?: Patch; sub?: S }>;
  /** Ids of original items this variation leaves out. */
  removed?: Id[];
  /** Items made in the variation, in order. */
  added?: T[];
  /** The whole order, only when it is not "the original's, then the added ones". */
  order?: Id[];
}

/** What a variation changes in one drawing of its original (keyed by the original's drawing id). */
export interface DrawingOverride {
  /** The variation has its own copy (pixels, tiles): stored in `doc.drawings` as `<id>~<artboard id>`. */
  replaced?: true;
  /** Changes to the drawing's own properties (a bones pose, and so on). */
  patch?: Patch;
  /** Changes to its shapes, by shape id (a recolour is a patch of `fill` on each shape). */
  shapes?: ListOverride<Shape>;
  /** Changes to a camera key's view. */
  view?: Patch;
  /** Only while a file is being read: what a redrawn drawing changes from the original's (see `DrawingDiff`). Applied, then dropped. */
  diff?: DrawingDiff;
}

/**
 * A redrawn pixel or tile drawing as a file stores it: only the part that differs from the original's drawing.
 * In memory the variation has the whole drawing (in `doc.drawings`), so tools work on it unchanged.
 */
export interface DiffRect {
  x: number;
  y: number;
  w: number;
  h: number;
  pixels: string | Uint8ClampedArray;
}

export interface DrawingDiff {
  /** Pixels: the changed rectangle. In a file `pixels` names a PNG entry of just that rectangle; once read it holds its RGBA bytes. */
  rect?: DiffRect;
  /** Pixels, when the change is in several places far apart: one small rectangle each (a file with one change uses `rect`). */
  rects?: DiffRect[];
  /** Tiles: the changed slots as pairs of slot number and new value. */
  cells?: number[];
}

/** Everything a variation changes. Anything not named here follows the original. */
export interface VariationOverrides {
  /** Size, stage colour, length, clips, markers, flow, guides, in and out points, perspective. */
  stage?: Patch;
  /** Layers by id; inside each, its keys by id. */
  layers?: ListOverride<Layer, ListOverride<Cel>>;
  /** Drawings of the original that changed, by the original's drawing id. */
  drawings?: Record<Id, DrawingOverride>;
  /** Sound clips by id: volume, mute, start and name changes, clips left out, clips added. */
  audio?: ListOverride<AudioClip>;
  /** This variation's own palette (a colourway for pixel art). Missing = the original's. */
  palette?: DocPalette;
}

/** The part of a document each artboard has its own copy of. */
export interface ArtboardContent {
  width: number;
  height: number;
  background: Color | null;
  length: number;
  layers: Layer[];
  clips: Clip[];
  markers: Marker[];
  flow?: ClipFlow;
  audio?: AudioClip[];
  guides?: Guide[];
  inOut?: Doc['inOut'];
  perspective?: Doc['perspective'];
}

/** A guide line across the stage: `axis` 'x' is an up-and-down line at x = `at`, 'y' a sideways one at y = `at`. */
export interface Guide {
  id: Id;
  axis: 'x' | 'y';
  /** Stage pixels from the left (x) or top (y) edge. */
  at: number;
}

/** Colour labels a layer can wear on the timeline. */
export const LAYER_LABELS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const;
export type LayerLabel = (typeof LAYER_LABELS)[number];

export type LayerKind = 'vector' | 'pixel' | 'tilemap' | 'camera';

export interface BaseLayer {
  id: Id;
  name: string;
  visible: boolean;
  locked: boolean;
  /** 0 to 1. */
  opacity: number;
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
  /** Show this layer's frames around the current one in the onion skin (missing = yes). */
  onion?: boolean;
  /** A reference layer: shown while drawing, left out of every export (ground lines, sketches, guides). Missing = no. */
  reference?: boolean;
  /** Attached to a bone, so it moves with the skeleton (missing = not attached). See `LayerBind`. */
  bind?: LayerBind;
  /** How the layer mixes with what's under it (missing = 'normal'). */
  blend?: BlendMode;
  /** Effects on the layer as a whole, applied first to last (missing = none). */
  effects?: LayerEffect[];
  /** Clip to the layer below: only shows where the layer (or folder) under it has drawing. Missing = no. */
  clipToBelow?: boolean;
  /** A mask layer: never shown itself; its drawing shows ('show') or hides ('hide') the layers under it in its folder. */
  mask?: 'show' | 'hide';
  /** The folder it sits in (a key of `doc.folders`). A folder's layers sit next to each other. Missing = none. */
  folder?: Id;
  /**
   * How far this layer is from the camera, for parallax (missing = 0, on the stage). 1 is twice as far, so it moves
   * half as much when the camera pans; negative values are closer and move more (above -0.9).
   */
  depth?: number;
  /** A colour label for the timeline, to tell layers apart at a glance (missing = the kind's own colour). */
  label?: LayerLabel;
  /**
   * Cels on this layer, sorted by `start`, never overlapping. A frame with no cel covering it is empty.
   */
  cels: Cel[];
}

export interface VectorLayer extends BaseLayer {
  kind: 'vector';
  /**
   * How new shapes meet old ones (missing = 'object'). 'object': each shape stays separate. 'merge': ungrouped shapes
   * cut and join each other, so the layer behaves like one flat painting.
   */
  drawMode?: 'object' | 'merge';
  /**
   * Makes this a bones layer: it holds a skeleton, and each key's drawing holds a pose (`VectorDrawing.pose`) instead
   * of shapes. Missing = an ordinary layer.
   */
  rig?: Rig;
}

export interface PixelLayer extends BaseLayer {
  kind: 'pixel';
  /** Document pixels per art pixel (a whole number, 1 or more). A 256x256 stage with pixelSize 8 is a 32x32 grid. */
  pixelSize: number;
  /** Palette lock: everything painted on this layer snaps to the nearest palette colour (missing = off). */
  paletteLock?: boolean;
}

/**
 * A grid of tiles from the document's tileset (a level, a floor, a wall). Its drawings are tilemap drawings, so it
 * animates with keys like any other layer.
 */
export interface TilemapLayer extends BaseLayer {
  kind: 'tilemap';
  /** Document pixels per tile pixel, like a pixel layer's pixelSize. A 16 x 16 tile at pixelSize 2 covers 32 x 32. */
  pixelSize: number;
}

/**
 * The camera: its drawings are camera views, keyed and tweened like any layer. The first visible camera layer on the
 * stage frames every export and playback. It draws nothing itself.
 */
export interface CameraLayer extends BaseLayer {
  kind: 'camera';
}

export type Layer = VectorLayer | PixelLayer | TilemapLayer | CameraLayer;

/**
 * One drawing held on a layer for `length` frames (its exposure: 1 = "on ones", 2 = "on twos").
 */
export interface Cel {
  id: Id;
  start: number;
  length: number;
  drawingId: Id;
  /** In-betweens from this key to the next one on the layer, when the next one starts right where this ends. */
  tween?: Tween;
  /**
   * Held automatically (missing = no): the hold reaches the next key or the end, and gives way when someone draws on
   * a later frame of it, as if those frames were empty. Choosing a length (Hold for, dragging the end) clears it.
   */
  autoHold?: boolean;
}

export type Drawing = VectorDrawing | PixelDrawing | TilemapDrawing | CameraDrawing;

/**
 * Where the camera looks: the stage-sized frame centred on (x, y) in stage pixels, `zoom` times closer (2 shows half
 * as much), turned `rotation` degrees clockwise. The plain view is the stage itself: centre, zoom 1, no turn.
 */
export interface CameraView {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  /**
   * Only on the camera of a film joined from shots of different sizes (never saved by the editor): this view was
   * scaled by `k` to fit a shot of `w` x `h` into the picture. `zoom` already includes `k`; layers at another depth
   * zoom the shot's own zoom by their factor and the fit comes after, so they line up with the plain fit.
   */
  fit?: { k: number; w: number; h: number };
}

/** One key of a camera layer. */
export interface CameraDrawing {
  id: Id;
  kind: 'camera';
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
  view: CameraView;
}

export interface VectorDrawing {
  id: Id;
  kind: 'vector';
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
  /** Painted in order: index 0 is at the back. */
  shapes: Shape[];
  /** On a bones layer: how each bone is turned and moved at this key (bones not listed are at rest). */
  pose?: Pose;
  /**
   * Shapes of a type this Frameling does not know (from a newer version or a plugin), kept as read so saving never drops
   * them. `at` is how many known shapes came before it. Never drawn or edited.
   */
  kept?: KeptShape[];
}

/** A shape of an unknown type, held untouched. See `VectorDrawing.kept`. */
export interface KeptShape {
  at: number;
  shape: Record<string, unknown>;
}

/**
 * A pixel drawing: an RGBA grid the size of the layer's art grid (`ceil(doc.width / pixelSize)` by
 * `ceil(doc.height / pixelSize)`). In memory `pixels` is the raw RGBA bytes. In a saved file it is stored as a PNG.
 * Edits replace the array (never mutate it in place), so undo and caches can compare by reference.
 */
export interface PixelDrawing {
  id: Id;
  kind: 'pixel';
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/**
 * Which tile sits in each slot of a tilemap. `cells` is row by row, `columns * rows` long. 0 is an empty slot; any
 * other value is a tile's `key` in the low 28 bits plus the TILE_FLIP_* flags. In a saved file it is a plain number
 * list. Edits replace the array (never mutate it in place), like pixel drawings.
 */
export interface TilemapDrawing {
  id: Id;
  kind: 'tilemap';
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
  columns: number;
  rows: number;
  cells: Uint32Array;
}

/** Mirror left to right. The three flags use the same bits as Tiled's. */
export const TILE_FLIP_X = 0x80000000;
/** Mirror top to bottom. */
export const TILE_FLIP_Y = 0x40000000;
/** Swap x and y (a diagonal mirror). With TILE_FLIP_X it turns a tile a quarter clockwise. */
export const TILE_FLIP_D = 0x20000000;
/** The bits of a cell that hold the tile's key. */
export const TILE_KEY_MASK = 0x0fffffff;

/** The document's tiles. Every tile is the same size. */
export interface Tileset {
  /** Tile size in art pixels. */
  tileWidth: number;
  tileHeight: number;
  /**
   * Where a tile edge sits across and down the stage, in art pixels from its top-left corner (0 up to the tile size
   * minus 1; missing = 0, the tiles start at the corner). Opening an Aseprite drawing whose tile grid does not start at
   * the corner sets it.
   */
  gridX?: number;
  gridY?: number;
  /** In the order the Tileset panel and exports show them. */
  tiles: Tile[];
  /** The key the next new tile gets. Keys are never reused, so maps keep pointing at the right tile. */
  nextKey: number;
}

export interface Tile {
  /** What map cells store (1 or more). Stays the same when tiles are reordered. */
  key: number;
  name: string;
  /** One frame for a still tile, more for an animated one (water, torches). Each is a pixel drawing in `drawings`. */
  frames: TileFrame[];
}

export interface TileFrame {
  drawingId: Id;
  /** How many document frames it shows for. */
  duration: number;
}

export type Shape = StrokeShape | FillShape | PathShape | InstanceShape | TextShape | ParticlesShape;

/** A point of a hand-drawn stroke: position, pen pressure (0 to 1, 0.5 when the device has none). */
export interface StrokePoint {
  x: number;
  y: number;
  p: number;
}

export interface BrushSettings {
  /** Diameter at full pressure, in document pixels. */
  size: number;
  /** How much pressure thins the line, -1 to 1 (0 = constant width). */
  thinning: number;
  /** Softens the outline's edges, 0 to 1. */
  smoothing: number;
  /** Evens out the hand's wobble, 0 to 1. */
  streamline: number;
  /** Taper length at the start and end, in document pixels (0 = none). */
  taperStart: number;
  taperEnd: number;
  /** Round or flat ends when not tapered. */
  capStart: boolean;
  capEnd: boolean;
}

/** A brush or pencil stroke, kept as its input points so it can be re-rendered or re-styled losslessly. */
export interface StrokeShape {
  id: Id;
  /** The id of the shape this one was copied from when a new key was made, kept through later copies (missing = the first of its line). Lets a selection follow the shape from key to key. */
  origin?: Id;
  /** Shapes sharing a group id select and move together, and never merge (missing = not grouped). */
  group?: Id;
  type: 'stroke';
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
  points: StrokePoint[];
  brush: BrushSettings;
  color: Color;
  opacity: number;
}

/** One closed outline: a list of points, each optionally a cubic bezier from the previous point. */
export interface PathPoint {
  x: number;
  y: number;
  /** Control points of the curve arriving at this point (absent = straight line). */
  c1?: { x: number; y: number };
  c2?: { x: number; y: number };
}

export interface SubPath {
  points: PathPoint[];
  closed: boolean;
}

/**
 * A filled area, as made by the paint bucket. Holes are subpaths inside others; filling uses the even-odd rule.
 */
export interface FillShape {
  id: Id;
  /** The id of the shape this one was copied from when a new key was made, kept through later copies (missing = the first of its line). Lets a selection follow the shape from key to key. */
  origin?: Id;
  /** Shapes sharing a group id select and move together, and never merge (missing = not grouped). */
  group?: Id;
  type: 'fill';
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
  paths: SubPath[];
  color: Color;
  opacity: number;
  /** Paints with this instead of `color` when set (`color` stays as its first stop, for anything that wants one colour). */
  gradient?: Gradient;
}

/** One colour along a gradient, `at` from 0 (start) to 1 (end). */
export interface GradientStop {
  at: number;
  color: Color;
}

/**
 * A colour blend. Linear runs from `from` to `to`; radial is a circle centred on `from` reaching out to `to`. Both
 * are in document pixels, the same space as the shape's points, so moving the shape moves its gradient too.
 */
export interface Gradient {
  kind: 'linear' | 'radial';
  stops: GradientStop[];
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/** A geometric shape (rectangle, ellipse, line, polygon, pen path), with an optional fill and stroke. */
export interface PathShape {
  id: Id;
  /** The id of the shape this one was copied from when a new key was made, kept through later copies (missing = the first of its line). Lets a selection follow the shape from key to key. */
  origin?: Id;
  /** Shapes sharing a group id select and move together, and never merge (missing = not grouped). */
  group?: Id;
  type: 'path';
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
  paths: SubPath[];
  fill: Color | null;
  stroke: { color: Color; width: number; join: 'round' | 'miter' | 'bevel'; cap: 'round' | 'butt' | 'square' } | null;
  opacity: number;
  /** Gradients for the inside and the outline, used instead of the plain colours when set. */
  fillGradient?: Gradient;
  strokeGradient?: Gradient;
}

export interface Clip {
  id: Id;
  name: string;
  /** First and last frame, inclusive. */
  start: number;
  end: number;
  /** Repeats forever. When false it plays `repeat` times (once when `repeat` is missing) and holds its last frame. */
  loop: boolean;
  /** Which way it plays (missing = forward). See `ClipDirection` and src/core/clipPlay.ts. */
  direction?: ClipDirection;
  /** How many times it plays when `loop` is false: a whole number from 1 (missing = 1). Ignored when `loop` is true. */
  repeat?: number;
}

/**
 * Forward, backward (`reverse`), back and forth (`pingpong`: the end frames show once per turn) and back and forth
 * starting from the end (`pingpong-reverse`).
 */
export type ClipDirection = 'forward' | 'reverse' | 'pingpong' | 'pingpong-reverse';

export interface Marker {
  id: Id;
  name: string;
  frame: number;
}

export interface Swatch {
  id: Id;
  name: string;
  color: Color;
}

/**
 * A pixel art palette. Colours are in order; a ramp is a run of neighbours going from dark to light (or light to
 * dark), which is what shading steps along. `ramps` lists where each ramp starts (index into `colors`); missing or
 * empty means the whole palette is one ramp.
 */
export interface DocPalette {
  name: string;
  colors: Color[];
  ramps?: number[];
  /** A name for each colour, in the same order as `colors` ('' = none). Missing = no names. */
  names?: string[];
  /** A name for a ramp, by the index of its first colour (0 for the first ramp), like the groups of a swatch file. */
  rampNames?: Record<number, string>;
}

// ---------------------------------------------------------------- blend modes, effects and folders

/** Canvas blend modes, plus 'add' (canvas calls it 'lighter'). */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'add'
  /** Adding colours with the plain blend (Aseprite's Addition, Photoshop's Linear Dodge). Done pixel by pixel. */
  | 'linear-dodge'
  /** Taking the colours away from what is under (Aseprite's Subtract). Done pixel by pixel, not by the canvas. */
  | 'subtract'
  /** Dividing what is under by the colours (Aseprite's Divide). Done pixel by pixel. */
  | 'divide';

export type EffectKind = 'blur' | 'glow' | 'shadow' | 'adjust' | 'outline' | 'pixelate';

/**
 * One effect in a layer's stack. `values` holds every setting (numbers, and colours as hex). Numbers can be animated
 * with `keys`: between two keys a value changes evenly, before the first and after the last it holds.
 */
export interface LayerEffect {
  id: Id;
  kind: EffectKind;
  /** Missing = on. */
  on?: boolean;
  values: Record<string, number | string>;
  /** Sorted by frame, at most one per frame. Missing or empty = not animated. */
  keys?: EffectKey[];
}

export interface EffectKey {
  frame: number;
  values: Record<string, number>;
}

/**
 * A layer folder (group): its layers fade, blend and take effects together, and masks inside stay inside. Folders
 * can sit in folders (`parent`); a folder's layers, and those of the folders inside it, sit next to each other.
 */
export interface LayerFolder {
  id: Id;
  name: string;
  visible: boolean;
  /** 0 to 1. */
  opacity: number;
  blend?: BlendMode;
  effects?: LayerEffect[];
  /** The folder this one sits in (a key of `doc.folders`), up to 8 levels deep. Missing = on the stage. */
  parent?: Id;
}

// ---------------------------------------------------------------- symbols and tweens

/**
 * A symbol: a reusable drawing with its own timeline. Its layers use the document's drawings, like the stage's do.
 * Content is in symbol space, which is stage space as it was when the symbol was made, so an instance with the
 * plain transform shows it exactly where it was drawn.
 */
export interface SymbolDef {
  id: Id;
  name: string;
  layers: Layer[];
  /** Length of its own timeline, in frames (at least 1). */
  length: number;
  /** The registration point in symbol space: what an instance's x, y place, and what it turns and scales around. */
  origin: { x: number; y: number };
  /** Names for its frames, by frame number (a mouth chart's "A", "E", "M B P"...). Missing or empty = unnamed. */
  frameLabels?: string[];
}

/** Where an instance sits. Angles are degrees. Applied as translate, rotate, skew, scale, around the symbol's origin. */
export interface Transform2D {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  /** Horizontal skew, degrees. */
  skew: number;
}

/** How an instance plays its symbol's timeline: round and round, once then hold the last frame, or one frame only. */
export type PlayMode = 'loop' | 'once' | 'single';

/** A placed copy of a symbol. Lives in a vector drawing like any shape, so select, move and arrange work on it. */
export interface InstanceShape {
  id: Id;
  /** The id of the shape this one was copied from when a new key was made, kept through later copies (missing = the first of its line). Lets a selection follow the shape from key to key. */
  origin?: Id;
  group?: Id;
  type: 'instance';
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
  symbolId: Id;
  transform: Transform2D;
  opacity: number;
  /** Colour wash over the whole instance, amount 0 to 1 (missing = none). */
  tint?: { color: Color; amount: number };
  play: PlayMode;
  /** The symbol frame it starts on (0-based). */
  firstFrame: number;
}

/**
 * An easing: a named preset (the same names Interactives uses) or a custom cubic bezier [x1, y1, x2, y2].
 */
export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'backIn' | 'backOut' | 'elasticOut' | 'bounceOut' | [number, number, number, number];

/**
 * In-betweens on a key. `kind` leaves room for shape tweens later (missing = 'classic': instances move between the
 * transforms, opacity and tint they have on the two keys).
 */
export interface Tween {
  /** 'shape' morphs the outlines, colours and strokes of one key's drawing into the next one's (shape tween). */
  kind?: 'classic' | 'shape';
  ease: Easing;
  /**
   * Which part of the easing curve this span plays, as [from, to] within 0..1 (missing = all of it). A span cut in two
   * keeps the motion exactly as it was: each half plays its own part of the one curve.
   */
  slice?: [number, number];
  /** Extra whole turns on the way (positive clockwise). */
  spin?: number;
  /**
   * A fraction of a turn that keeps a cut motion path facing the way it did before the cut (turn-to-face paths only). It
   * belongs to the path: whoever sets, clears or turns off the path clears it, and the Extra spins field never shows it.
   */
  facing?: number;
  /** Follow this line on the way (stage coordinates of the layer). */
  path?: MotionPath;
  /** Shape tweens only: paired markers saying which point of the start drawing becomes which of the end one. */
  hints?: ShapeHint[];
}

/** A shape hint: the point near `from` on the start key's drawing travels to the point near `to` on the end key's. */
export interface ShapeHint {
  id: Id;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface MotionPath {
  points: PathPoint[];
  /** Turn to face along the line. */
  orient: boolean;
}

/** One level of editing in place (see Doc.editing). */
export interface EditFrame {
  symbolId: Id;
  /** The instance that was double-clicked, if any, to place the dimmed surroundings. */
  instanceId?: Id;
  /** What `layers`, `length` held before entering. */
  layers: Layer[];
  length: number;
  /** Playhead and active layer outside, to put back on the way out. */
  frame: number;
  activeLayerId: Id | null;
  /** Instance space to outer space, as [a, b, c, d, e, f]. */
  matrix: [number, number, number, number, number, number];
}

// ---------------------------------------------------------------- text and particles

/** How a text animator splits the text. */
export type TextUnit = 'letter' | 'word' | 'line';

/** What a text animator does to each piece. */
export type TextAnimKind = 'fade' | 'slide' | 'scale' | 'rotate' | 'typewriter' | 'wave';

/**
 * One text animator. Pieces (letters, words or lines) each take `duration` frames, starting `stagger` frames apart,
 * from `start` frames after the key begins. 'in' animates from the changed look to the plain text, 'out' the other
 * way. A wave never ends: `duration` is one swing and `stagger` how far behind each piece runs.
 */
export interface TextAnimator {
  id: Id;
  kind: TextAnimKind;
  by: TextUnit;
  /** Missing = 'in'. */
  direction?: 'in' | 'out';
  start: number;
  duration: number;
  stagger: number;
  /** Which piece goes first (missing = 'forward'). */
  order?: 'forward' | 'backward' | 'middle' | 'random';
  /** Distance (slide, wave) in document pixels, size (scale, 0 to 4) or angle (rotate, degrees). */
  amount: number;
  /** Slide direction in degrees, 90 = from below (missing = 90). */
  angle?: number;
  ease?: Easing;
  seed?: number;
  /** Missing = on. */
  on?: boolean;
}

/**
 * Text as one shape: lines of a font at a size, placed and turned by `transform` (the first line's baseline starts at
 * the origin; the anchor moves with `align`). Kept as text, so it stays editable; "Convert to shapes" makes outlines.
 */
export interface TextShape {
  id: Id;
  /** The id of the shape this one was copied from when a new key was made, kept through later copies (missing = the first of its line). Lets a selection follow the shape from key to key. */
  origin?: Id;
  group?: Id;
  type: 'text';
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
  text: string;
  /** Font family name ('Nunito', 'Inter', or a font on this computer). */
  font: string;
  size: number;
  /** 100 to 900. */
  weight: number;
  italic?: boolean;
  color: Color;
  align: 'left' | 'center' | 'right';
  /** Line spacing as a multiple of the size (missing = 1.2). */
  lineHeight?: number;
  /** Extra space between letters, document pixels (missing = 0). */
  letterSpacing?: number;
  opacity: number;
  transform: Transform2D;
  animators?: TextAnimator[];
}

/** What each particle looks like. 'symbol' draws `ParticlesShape.symbolId`. */
export type ParticleSprite = 'dot' | 'soft' | 'square' | 'star' | 'spark' | 'streak' | 'confetti' | 'flake' | 'symbol';

/**
 * A particle emitter. Particles are worked out from the seed for every frame on their own (no step-by-step
 * simulation), so scrubbing, playing and every export show exactly the same particles. Time starts when its key starts.
 * Speeds are document pixels per second, times are seconds.
 */
export interface ParticlesShape {
  id: Id;
  /** The id of the shape this one was copied from when a new key was made, kept through later copies (missing = the first of its line). Lets a selection follow the shape from key to key. */
  origin?: Id;
  group?: Id;
  type: 'particles';
  /** Data kept for features and plugins, by feature id. See `Ext`. */
  ext?: Ext;
  /** Where the emitter sits and how it is turned and stretched (origin = its centre). */
  transform: Transform2D;
  /** Where particles start: one point, along a line (`width` long) or inside a box (`width` x `height`). */
  emitter: 'point' | 'line' | 'area';
  width: number;
  height: number;
  /** Particles per second. */
  rate: number;
  /** Particles all at once at the start. */
  burst: number;
  /** Stop making new ones after this many seconds (0 = keep going). */
  emitFor: number;
  /** Start as if it had already been running (rain and snow already falling). */
  prewarm?: boolean;
  life: number;
  /** 0 to 1: how much each particle's life, speed, size and spin differ. */
  variance: number;
  speed: number;
  /** Degrees: 0 = right, -90 = up. Turns with the emitter. */
  direction: number;
  /** Degrees either side of `direction`. */
  spread: number;
  /** Pull down (positive) or up, pixels per second per second. */
  gravity: number;
  /** Push right (positive) or left, pixels per second per second. */
  wind: number;
  /** Slows particles down, 0 (none) to 5 (stops fast). */
  drag: number;
  /** A gentle wander, in pixels. */
  wobble?: number;
  sizeStart: number;
  sizeEnd: number;
  colorStart: Color;
  colorEnd: Color;
  /** 'life' (missing): from the start colour to the end one as they age. 'random': each gets its own mix of the two. */
  colorBy?: 'life' | 'random';
  /** 0 to 1. */
  opacityStart: number;
  opacityEnd: number;
  /** Degrees per second. */
  spin: number;
  sprite: ParticleSprite;
  symbolId?: Id;
  seed: number;
  /** At most this many alive at once (missing = 2000). */
  max?: number;
  opacity: number;
  /** The preset it started from, for the panel. */
  preset?: string;
}

// ---------------------------------------------------------------- clip flow (state graph)

/**
 * Which clip plays first and what follows what. States are the document's clips. Game engines and Interactives read
 * this as a state machine; Frameling's own playback ignores it.
 */
export interface ClipFlow {
  /** The clip that plays first (missing = the first clip). */
  start?: Id;
  transitions: ClipTransition[];
  /** Where each clip's box sits in the flow panel, by clip id (missing = laid out automatically). */
  positions?: Record<Id, { x: number; y: number }>;
}

/** Go from one clip to another when it ends, or when something triggers it (a key press, "jump", "hit"). */
export interface ClipTransition {
  id: Id;
  from: Id;
  to: Id;
  /** 'end': when `from` finishes (a looping clip finishes each time round). 'trigger': when `trigger` is fired. */
  when: 'end' | 'trigger';
  /** The trigger's name, for 'trigger' transitions. */
  trigger?: string;
}

// ---------------------------------------------------------------- bones and rigs

/** A skeleton: bones in the space of the layer list it sits in (the stage's, or a symbol's). */
export interface Rig {
  /** Parents always come before their children. */
  bones: Bone[];
  /** The pose library: named poses to put back on any frame. */
  poses?: SavedPose[];
}

/** One bone, in its rest (setup) position. Angles are degrees, 0 pointing right, positive clockwise on screen. */
export interface Bone {
  id: Id;
  name: string;
  /** The bone it hangs from (missing or null = a root). */
  parent?: Id | null;
  /** Where the bone starts (its joint). */
  x: number;
  y: number;
  angle: number;
  length: number;
  /** Pinned: its tip stays where it is while other bones move (missing = no). */
  pin?: boolean;
}

/** How one bone differs from rest at a key: turned by `r` degrees, its joint moved by `x`, `y` (missing = 0). */
export interface BonePose {
  r: number;
  x?: number;
  y?: number;
  /** Squash and stretch: the bone's length times this, with what hangs from it (missing = 1). Kept within BONE_STRETCH. */
  s?: number;
}

/** How far a bone can squash or stretch, so it never flips inside out. */
export const BONE_STRETCH = { min: 0.25, max: 3 } as const;

export type Pose = Record<Id, BonePose>;

export interface SavedPose {
  id: Id;
  name: string;
  pose: Pose;
}

/**
 * How a layer follows a skeleton. With only `bone`, the whole layer moves with that bone (cut-out style). With
 * `mesh`, it bends: each mesh point follows a blend of bones by weight.
 */
export interface LayerBind {
  /** The bones layer (in the same layer list). */
  rig: Id;
  bone: Id;
  mesh?: SkinMesh;
}

/** A triangle mesh over a layer's art in rest position, with bone weights per point. */
export interface SkinMesh {
  /** Point positions, flat: x0, y0, x1, y1... */
  points: number[];
  /** Point indices, three per triangle. */
  triangles: number[];
  /** Bone ids the weights refer to by index. */
  bones: Id[];
  /** Per point: flat pairs of bone index and weight (weights sum to 1). */
  weights: number[][];
}

// ---------------------------------------------------------------- sound

/** A sound placed on the timeline. */
export interface AudioClip {
  id: Id;
  name: string;
  /** The frame it starts on (can be negative to start partway in). */
  start: number;
  /** 0 to 1 (missing = 1). */
  volume?: number;
  muted?: boolean;
  /** The file as imported (WAV, MP3, OGG...). In a saved file it lives beside doc.json as `audio/<id>.<ext>`. */
  data: Uint8Array;
  /** Its media type, e.g. `audio/wav`. */
  mime: string;
  /** Length in seconds, once known (for drawing it before it's decoded). */
  duration?: number;
}
