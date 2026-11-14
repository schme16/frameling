// "Bring in a picture": a live preview of what the picture will be cut into, with the choices beside it. Opened for a
// PNG, GIF or sprite sheet from File > Open, File > Import, a drop, or the palette.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocPalette, SpriteWay } from '../../core/format';
import { Modal } from '../../io/mount';
import { sortForRamps, paletteOfKeys } from '../palette-io';
import { clampColours, DEFAULT_COLOURS, MAX_COLOURS, MIN_COLOURS } from '../quantise';
import { Cancelled, startScan, type Picked, type Scan } from '../quantiseRun';
import { WAYS } from '../way';
import { colourCount, cutPicture, defaultCut, DEFAULT_FPS, timingOf, type BuildOptions, type Cutting } from './build';
import type { Picture } from './picture';
import type { SheetData } from './sheetJson';
import { ALIGNS, autoCells, defaultAuto, defaultGrid, gridCells, gridShape, looksLikeSheet, ORDERS, type Align, type AutoSpec, type CellOrder, type GridSpec } from './slicing';
import './import.css';

export type ImportMode = 'new' | 'add' | 'palette';
export type PaletteMode = 'none' | 'replace' | 'add';

export interface ImportRequest {
  sprite: ReturnType<typeof cutPicture>;
  options: BuildOptions;
  /** With the open drawing: make the layer or boards from the current frame. */
  into: boolean;
  paletteMode: PaletteMode;
  /** In palette mode: the colours already picked (off the page's thread) for the limit that was set. */
  picked?: DocPalette;
}

const plural = (n: number, one: string) => `${n.toLocaleString()} ${n === 1 ? one : one.replace(/our$/, 'ours')}`;

const num = (v: string, min: number, max: number, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

const KEY = 'frameling.import.v1';
interface Remembered {
  way?: SpriteWay;
  order?: CellOrder;
  align?: Align;
  skipBlank?: boolean;
  rowsAsSprites?: boolean;
  maxColours?: number;
  paletteMode?: 'add' | 'replace';
}
function recall(): Remembered {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Remembered;
  } catch {
    return {};
  }
}
function remember(r: Remembered): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    // Not remembered this time.
  }
}

/** The preview: the picture at whole-number zoom on a checkerboard, with the cells outlined and numbered. */
function Preview({ pic, frame, cells, boxes }: { pic: Picture; frame: number; cells: { x: number; y: number; w: number; h: number }[]; boxes: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const fit = Math.max(0.25, Math.min(16, Math.floor(Math.min(400 / pic.width, 330 / pic.height) * 4) / 4 || 1));
  const z = zoom ?? fit;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = pic.width;
    c.height = pic.height;
    const g = c.getContext('2d');
    g?.putImageData(new ImageData(pic.frames[Math.min(frame, pic.frames.length - 1)].pixels as Uint8ClampedArray<ArrayBuffer>, pic.width, pic.height), 0, 0);
  }, [pic, frame]);
  const w = Math.round(pic.width * z);
  const h = Math.round(pic.height * z);
  return (
    <div className="im-preview">
      <div className="im-stage-wrap">
        <div className="im-stage" style={{ width: w, height: h }}>
          <canvas ref={ref} role="img" aria-label="The picture, as it will be cut" style={{ width: w, height: h }} />
          {boxes && (
            <svg viewBox={`0 0 ${pic.width} ${pic.height}`} width={w} height={h} aria-hidden="true">
              {cells.slice(0, 2000).map((c, i) => (
                <g key={i}>
                  <rect x={c.x + 0.5 / z} y={c.y + 0.5 / z} width={c.w} height={c.h} className="im-cell" vectorEffect="non-scaling-stroke" />
                  {c.w * z >= 22 && c.h * z >= 16 && (
                    <text x={c.x + 2 / z} y={c.y + 11 / z} fontSize={10 / z} className="im-num">
                      {i + 1}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>
      <div className="im-zoom">
        <button type="button" className="io-btn" onClick={() => setZoom(Math.max(0.25, z / 2))} aria-label="Zoom out">
          -
        </button>
        <span aria-live="polite">{Math.round(z * 100)}%</span>
        <button type="button" className="io-btn" onClick={() => setZoom(Math.min(32, z * 2))} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="io-btn" onClick={() => setZoom(null)}>
          Fit
        </button>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="im-field">
      <span className="cv-field-label">{label}</span>
      {children}
      {hint && <small className="im-hint">{hint}</small>}
    </label>
  );
}

export function ImportDialog({ pic, fileName, mode, hasDrawing, companion, pickJson, finish, close }: {
  pic: Picture;
  fileName: string;
  mode: ImportMode;
  hasDrawing: boolean;
  /** A JSON that came with the picture (dropped next to it), if any. */
  companion: SheetData | null;
  pickJson: () => Promise<SheetData | null>;
  finish: (r: ImportRequest) => void;
  close: () => void;
}) {
  const saved = useMemo(recall, []);
  const animated = pic.frames.length > 1;
  const [json, setJson] = useState<SheetData | null>(companion);
  const sheetLike = useMemo(() => !animated && mode !== 'palette' && looksLikeSheet({ width: pic.width, height: pic.height, pixels: pic.frames[0].pixels }), [pic, animated, mode]);
  const [how, setHow] = useState<Cutting['how']>(mode === 'palette' ? 'whole' : companion ? 'json' : sheetLike ? 'auto' : 'whole');
  const [grid, setGrid] = useState<GridSpec>(() => defaultGrid(pic.width, pic.height));
  const [auto, setAuto] = useState<AutoSpec>(defaultAuto);
  const [order, setOrder] = useState<CellOrder>(saved.order ?? 'rows');
  const [align, setAlign] = useState<Align>(saved.align ?? 'bottom');
  const [skipBlank, setSkipBlank] = useState(saved.skipBlank ?? true);
  const [way, setWay] = useState<SpriteWay | null>(null);
  const [rowsAsSprites, setRowsAsSprites] = useState(saved.rowsAsSprites ?? true);
  const [palette, setPalette] = useState<boolean>(mode === 'new');
  const [paletteMode, setPaletteMode] = useState<'replace' | 'add'>(saved.paletteMode ?? 'add');
  const [maxColours, setMaxColours] = useState<number>(clampColours(saved.maxColours));
  const [maxText, setMaxText] = useState<string>(String(clampColours(saved.maxColours)));
  const [into, setInto] = useState(mode === 'add');
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  const cutting: Cutting = useMemo(() => {
    if (how === 'json' && json) return { how: 'json', data: json };
    if (how === 'grid') return { how: 'grid', grid };
    if (how === 'auto') return { how: 'auto', auto };
    return { how: 'whole' };
  }, [how, json, grid, auto]);

  const sprite = useMemo(() => cutPicture(pic, { ...defaultCut(), cutting, order, align, skipBlank }), [pic, cutting, order, align, skipBlank]);
  const frames = sprite.frames.length;
  // The way it starts as: a GIF or a sheet of frames is an animation, one picture is a picture.
  const effectiveWay: SpriteWay = way ?? (frames > 1 ? (saved.way && saved.way !== 'picture' ? saved.way : 'animation') : 'picture');
  const cellBoxes = useMemo(() => {
    if (animated || how === 'whole') return [];
    if (how === 'grid') return gridCells(pic.width, pic.height, grid);
    if (how === 'json' && json) return json.cells.map((c) => ({ ...c, w: c.rotated ? c.h : c.w, h: c.rotated ? c.w : c.h }));
    if (how === 'auto') return autoCells({ width: pic.width, height: pic.height, pixels: pic.frames[0].pixels }, auto);
    return [];
  }, [pic, how, grid, auto, json, animated]);
  const colours = useMemo(() => (mode === 'palette' ? 0 : colourCount(sprite)), [sprite, mode]);
  const timing = useMemo(() => (frames ? timingOf(sprite) : null), [sprite, frames]);

  // Taking the colours: counted on a worker thread while the dialog stays usable, then picked again (quickly) whenever the limit changes.
  const [counted, setCounted] = useState(0);
  const [ready, setReady] = useState(false);
  const [picked, setPicked] = useState<{ max: number; r: Picked } | null>(null);
  const [scanFailed, setScanFailed] = useState(false);
  const scanRef = useRef<Scan | null>(null);
  useEffect(() => {
    if (mode !== 'palette') return;
    // A long animation has few new colours after the first frames, so a sample of the frames is enough.
    const use = sprite.frames.length > 64 ? sprite.frames.filter((_, i) => i % Math.ceil(sprite.frames.length / 64) === 0) : sprite.frames;
    const scan = startScan(
      use.map((f) => f.image.pixels),
      setCounted,
    );
    scanRef.current = scan;
    setReady(false);
    setPicked(null);
    setScanFailed(false);
    scan.done.then(
      () => setReady(true),
      (e) => {
        if (!(e instanceof Cancelled)) setScanFailed(true);
      },
    );
    // Closing the dialog, or Cancel, stops the work.
    return () => scan.cancel();
  }, [mode, sprite]);
  useEffect(() => {
    if (!ready || !scanRef.current) return;
    let stale = false;
    const t = setTimeout(() => {
      scanRef.current?.pick(maxColours).then(
        (r) => {
          if (!stale) setPicked({ max: maxColours, r });
        },
        () => {},
      );
    }, 120);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [ready, maxColours]);
  const pickedNow = picked && picked.max === maxColours ? picked.r : null;
  const swatches = useMemo(() => (pickedNow ? sortForRamps(pickedNow.colours) : []), [pickedNow]);

  // A GIF can be watched here.
  useEffect(() => {
    if (!playing || !animated) return;
    const t = setTimeout(() => setFrame((f) => (f + 1) % pic.frames.length), pic.frames[frame].delay ?? 100);
    return () => clearTimeout(t);
  }, [playing, frame, animated, pic]);

  const shape = how === 'grid' ? gridShape(pic.width, pic.height, grid) : null;
  const problem = mode === 'palette' ? (scanFailed ? 'Frameling could not work out the colours of this picture.' : pickedNow && pickedNow.solid === 0 ? 'The picture has no solid colours.' : '') : !frames ? 'Nothing to cut with these settings.' : '';
  const sizes = new Set(sprite.frames.map((f) => `${f.image.width}x${f.image.height}`));
  const summary =
    mode === 'palette'
      ? !ready
        ? `Working out the colours... ${Math.round(counted * 100)}%`
        : pickedNow
          ? `${pickedNow.exact ? plural(pickedNow.distinct, 'colour') : 'Many colours'} in the picture${pickedNow.distinct > maxColours || !pickedNow.exact ? `: ${plural(pickedNow.colours.length, 'colour')} that stand for it best.` : '.'}`
          : 'Picking the colours...'
      : frames
        ? `${frames} ${frames === 1 ? 'frame' : 'frames'} of ${sprite.width} x ${sprite.height}${effectiveWay === 'animation' || effectiveWay === 'sheet' ? `, plays at ${timing?.fps ?? DEFAULT_FPS} fps` : ''}.`
        : '';

  const go = () => {
    if (problem) return;
    if (mode === 'palette' && !pickedNow) return;
    remember({ way: effectiveWay, order, align, skipBlank, rowsAsSprites, maxColours, paletteMode });
    finish({
      sprite,
      options: { way: effectiveWay, name: fileName, rowsAsSprites, palette: mode === 'palette' ? true : palette },
      into,
      paletteMode: mode === 'palette' ? paletteMode : palette ? (mode === 'new' ? 'replace' : 'add') : 'none',
      ...(mode === 'palette' && pickedNow ? { picked: paletteOfKeys(pickedNow.colours, fileName) } : {}),
    });
    close();
  };

  const title = mode === 'palette' ? 'Take colours from a picture' : into ? 'Add a picture to this drawing' : 'Bring in a picture';
  const cutControls = !animated && mode !== 'palette';
  return (
    <Modal title={title} onClose={close} wide className="im-modal">
      <div className="im-body">
        <Preview pic={pic} frame={frame} cells={cellBoxes} boxes={cutControls && how !== 'whole'} />
        <div className="im-controls">
          <p className="im-file">
            <b>{fileName}</b>
            <span className="io-muted">
              {' '}
              {pic.width} x {pic.height}
              {animated ? `, ${pic.frames.length} frames` : ''}
            </span>
          </p>
          {animated && (
            <div className="im-gifbar">
              <button type="button" className="io-btn" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
                {playing ? 'Pause' : 'Play'}
              </button>
              <input type="range" min={0} max={pic.frames.length - 1} value={frame} aria-label="Frame" onChange={(e) => (setPlaying(false), setFrame(Number(e.target.value)))} className="cv-slider" />
              <span className="im-hint">
                {frame + 1} of {pic.frames.length}, {pic.frames[frame].delay ?? 100} ms
              </span>
            </div>
          )}

          {cutControls && (
            <fieldset className="im-set">
              <legend>How to cut it</legend>
              <div className="im-seg" role="radiogroup" aria-label="How to cut it">
                {(
                  [
                    ['whole', 'One picture'],
                    ['grid', 'Grid'],
                    ['auto', 'Find the gaps'],
                    ['json', 'From a JSON'],
                  ] as [Cutting['how'], string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={how === id}
                    className={`im-segbtn${how === id ? ' on' : ''}`}
                    data-testid={`import.how.${id}`}
                    onClick={async () => {
                      if (id === 'json' && !json) {
                        const j = await pickJson();
                        if (!j) return;
                        setJson(j);
                      }
                      setHow(id);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {how === 'grid' && (
                <div className="im-grid">
                  <div className="im-seg" role="radiogroup" aria-label="Grid by">
                    {(
                      [
                        ['size', 'Cell size'],
                        ['count', 'Rows and columns'],
                      ] as [GridSpec['by'], string][]
                    ).map(([id, label]) => (
                      <button key={id} type="button" role="radio" aria-checked={grid.by === id} className={`im-segbtn${grid.by === id ? ' on' : ''}`} onClick={() => setGrid({ ...grid, by: id })}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {grid.by === 'size' ? (
                    <div className="im-row">
                      <Field label="Cell width">
                        <input type="number" min={1} max={pic.width} value={grid.cellW} onChange={(e) => setGrid({ ...grid, cellW: num(e.target.value, 1, pic.width, grid.cellW) })} />
                      </Field>
                      <Field label="Cell height">
                        <input type="number" min={1} max={pic.height} value={grid.cellH} onChange={(e) => setGrid({ ...grid, cellH: num(e.target.value, 1, pic.height, grid.cellH) })} />
                      </Field>
                    </div>
                  ) : (
                    <div className="im-row">
                      <Field label="Columns">
                        <input type="number" min={1} max={pic.width} value={grid.cols} onChange={(e) => setGrid({ ...grid, cols: num(e.target.value, 1, pic.width, grid.cols) })} />
                      </Field>
                      <Field label="Rows">
                        <input type="number" min={1} max={pic.height} value={grid.rows} onChange={(e) => setGrid({ ...grid, rows: num(e.target.value, 1, pic.height, grid.rows) })} />
                      </Field>
                    </div>
                  )}
                  <div className="im-row">
                    <Field label="Margin" hint="Empty border around the sheet">
                      <input type="number" min={0} max={256} value={grid.margin} onChange={(e) => setGrid({ ...grid, margin: num(e.target.value, 0, 256, grid.margin) })} />
                    </Field>
                    <Field label="Spacing" hint="Empty space between cells">
                      <input type="number" min={0} max={256} value={grid.spacing} onChange={(e) => setGrid({ ...grid, spacing: num(e.target.value, 0, 256, grid.spacing) })} />
                    </Field>
                  </div>
                  {shape && (
                    <p className="im-hint">
                      {shape.cols} x {shape.rows} cells of {shape.cellW} x {shape.cellH}
                    </p>
                  )}
                </div>
              )}
              {how === 'auto' && (
                <div className="im-grid">
                  <div className="im-row">
                    <Field label="Gap needed" hint="Empty rows or columns that split two sprites">
                      <input type="number" min={1} max={64} value={auto.gutter} onChange={(e) => setAuto({ ...auto, gutter: num(e.target.value, 1, 64, auto.gutter) })} />
                    </Field>
                    <Field label="Ignore specks smaller than" hint="Pixels across">
                      <input type="number" min={1} max={64} value={auto.minSize} onChange={(e) => setAuto({ ...auto, minSize: num(e.target.value, 1, 64, auto.minSize) })} />
                    </Field>
                  </div>
                  <Field label="Empty space is">
                    <select value={auto.background} onChange={(e) => setAuto({ ...auto, background: e.target.value as AutoSpec['background'] })}>
                      <option value="auto">Whatever the picture has</option>
                      <option value="transparent">See-through pixels</option>
                      <option value="corner">The colour of the top left pixel</option>
                    </select>
                  </Field>
                  <label className="im-check">
                    <input type="checkbox" checked={auto.tight} onChange={(e) => setAuto({ ...auto, tight: e.target.checked })} />
                    <span>Trim each sprite also top and bottom</span>
                  </label>
                </div>
              )}
              {how === 'json' && json && (
                <p className="im-hint">
                  {json.cells.length} frames{json.tags.length ? `, ${json.tags.length} ${json.tags.length === 1 ? 'animation' : 'animations'}` : ''}
                  {json.slices.length ? `, ${json.slices.length} ${json.slices.length === 1 ? 'slice' : 'slices'}` : ''}. The file decides the order.{' '}
                  <button type="button" className="im-link" onClick={() => void pickJson().then((j) => j && setJson(j))}>
                    Use another JSON
                  </button>
                </p>
              )}
              {how !== 'whole' && how !== 'json' && (
                <div className="im-row">
                  <Field label="Frame order">
                    <select value={order} onChange={(e) => setOrder(e.target.value as CellOrder)}>
                      {ORDERS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
              {how !== 'whole' && sizes.size > 1 && (
                <Field label="Smaller pieces sit" hint="The cells are not all one size">
                  <select value={align} onChange={(e) => setAlign(e.target.value as Align)}>
                    {ALIGNS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {(how === 'grid' || how === 'auto') && (
                <label className="im-check">
                  <input type="checkbox" checked={skipBlank} onChange={(e) => setSkipBlank(e.target.checked)} />
                  <span>Leave out empty cells</span>
                </label>
              )}
            </fieldset>
          )}

          {mode !== 'palette' && (
            <fieldset className="im-set">
              <legend>What it becomes</legend>
              <div className="im-ways" role="radiogroup" aria-label="What it becomes">
                {WAYS.map((w) => (
                  <button key={w.id} type="button" role="radio" aria-checked={effectiveWay === w.id} className={`im-way${effectiveWay === w.id ? ' on' : ''}`} data-testid={`import.way.${w.id}`} onClick={() => setWay(w.id)} title={w.blurb}>
                    <b>{w.name}</b>
                    <span>{w.term}</span>
                  </button>
                ))}
              </div>
              <p className="im-hint">{WAYS.find((w) => w.id === effectiveWay)?.blurb}</p>
              {effectiveWay === 'picture' && frames > 1 && <p className="im-hint">It has {frames} frames; only the first is used.</p>}
              {effectiveWay === 'sheet' && frames > 1 && (
                <label className="im-check">
                  <input type="checkbox" checked={rowsAsSprites} onChange={(e) => setRowsAsSprites(e.target.checked)} />
                  <span>{how === 'json' ? 'A sprite for each animation' : 'A sprite for each row (its cells are its frames)'}</span>
                </label>
              )}
              {hasDrawing && (
                <label className="im-check">
                  <input type="checkbox" checked={into} onChange={(e) => setInto(e.target.checked)} />
                  <span>Add to the open drawing instead of making a new one</span>
                </label>
              )}
            </fieldset>
          )}

          {mode === 'palette' ? (
            <>
              <fieldset className="im-set">
                <legend>How many colours</legend>
                <Field label="Most colours to take" hint="A photo has thousands of colours. Frameling keeps this many that stand for it best. A picture with fewer keeps them all.">
                  <input
                    type="number"
                    min={MIN_COLOURS}
                    max={MAX_COLOURS}
                    value={maxText}
                    data-testid="palette.max"
                    onChange={(e) => {
                      setMaxText(e.target.value);
                      if (e.target.value.trim() !== '') setMaxColours(clampColours(e.target.value, maxColours));
                    }}
                    onBlur={() => setMaxText(String(maxColours))}
                  />
                </Field>
                {!ready && !scanFailed ? (
                  <div className="im-progress" role="status">
                    <progress max={1} value={counted} aria-label="Working out the colours" />
                    <small className="im-hint">Working out the colours: {Math.round(counted * 100)}%. You can keep using Frameling, or press Cancel to stop.</small>
                  </div>
                ) : (
                  <div className="im-swatches" role="img" aria-label={`The ${swatches.length} colours that will be taken`}>
                    {swatches.map((k) => (
                      <i key={k} style={{ background: `#${k.toString(16).padStart(6, '0')}` }} />
                    ))}
                  </div>
                )}
              </fieldset>
            <fieldset className="im-set">
              <legend>Palette</legend>
              <div className="im-seg" role="radiogroup" aria-label="Palette">
                {(
                  [
                    ['add', 'Add to my palette'],
                    ['replace', 'Replace my palette'],
                  ] as ['add' | 'replace', string][]
                ).map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={paletteMode === id} className={`im-segbtn${paletteMode === id ? ' on' : ''}`} onClick={() => setPaletteMode(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            </>
          ) : (
            <label className="im-check">
              <input type="checkbox" checked={palette} onChange={(e) => setPalette(e.target.checked)} />
              <span>
                Put its colours in the palette ({colours >= 9999 ? 'many' : colours}
                {colours > 256 ? ', the best 256' : ''})
              </span>
            </label>
          )}
          {sprite.notes.length > 0 && mode !== 'palette' && <p className="im-hint im-notes">{sprite.notes.join(' ')}</p>}
        </div>
      </div>
      <div className="io-foot">
        <span className="im-summary" aria-live="polite">
          {problem || summary}
        </span>
        <button type="button" className="io-btn" data-testid="import.cancel" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary" data-testid="import.go" onClick={go} disabled={!!problem || (mode === 'palette' && !pickedNow)} data-autofocus>
          {mode === 'palette' ? 'Take the colours' : into ? 'Add it' : 'Bring it in'}
        </button>
      </div>
    </Modal>
  );
}

