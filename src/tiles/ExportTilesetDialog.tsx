// File > Export tileset...: the tiles on one picture, plus a Godot TileSet and level scene, JSON or Tiled files.
import { ExNote } from '../export/ExNote';
import { useEffect, useMemo, useRef, useState } from 'react';
import { store, useStore } from '../core/store';
import { baseName, desktop } from '../io/desktop';
import { can } from '../platform';
import { Modal, mountModal } from '../io/mount';
import { notify, notifySaved } from '../io/notify';
import { Icon } from '../ui/icons';
import { buildTileAtlas, DEFAULT_TILESET_EXPORT, tilesetFiles, tilesetTexturePath, type TilesetExportSettings } from './export';
import '../export/export.css';
import './tiles.css';

const KEY = 'frameling.export.tileset';

function loadSettings(): TilesetExportSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_TILESET_EXPORT, ...JSON.parse(raw) } : { ...DEFAULT_TILESET_EXPORT };
  } catch {
    return { ...DEFAULT_TILESET_EXPORT };
  }
}

function saveSettings(s: TilesetExportSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Remembering is a nicety.
  }
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="ex-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** The picture as it will be saved, scaled up to fit a box, crisp. */
function AtlasPreview({ image }: { image: { width: number; height: number; pixels: Uint8ClampedArray } }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const k = Math.max(1, Math.floor(Math.min(240 / image.width, 160 / image.height)));
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g || image.width < 1) return;
    const src = new OffscreenCanvas(image.width, image.height);
    src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0, c.width, c.height);
  }, [image, k]);
  return <canvas ref={ref} className="tz-atlas" width={image.width * k} height={image.height * k} aria-label="Preview of the tileset picture" role="img" />;
}

const num = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

function ExportTilesetDialog({ close }: { close: () => void }) {
  const doc = useStore(() => store().rootDoc());
  const frame = useStore((s) => s.ui.frame);
  const [s, setS] = useState<TilesetExportSettings>(loadSettings);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<TilesetExportSettings>) => setS((x) => ({ ...x, ...p }));
  const atlas = useMemo(() => buildTileAtlas(doc, s), [doc, s.columns, s.padding, s.extrude, s.scale]);
  const tiles = doc.tileset?.tiles.length ?? 0;
  const maps = doc.layers.filter((l) => l.kind === 'tilemap').length;
  const problem = !tiles ? 'There are no tiles to export yet. Make some in the Tileset panel.' : atlas.image.width > 8192 || atlas.image.height > 8192 ? 'That picture would be bigger than 8192 pixels. Use a smaller size or more columns.' : null;

  const go = async () => {
    const api = desktop();
    if (!api) return notify('Exporting works in the Frameling desktop app.', 'info');
    setBusy(true);
    try {
      const target = await api.files.pickExportFolder({ title: 'Choose a folder for your tileset', suggestedName: `${doc.name || 'tileset'} tileset` });
      if (!target) return;
      const files = tilesetFiles(doc, s, frame);
      const w = await api.files.writeMany(target, files);
      if (!w) return;
      if ('error' in w) return notify(w.error, 'error');
      saveSettings(s);
      const shown = w.paths.find((p) => p.endsWith('.png')) ?? w.paths[0];
      notifySaved(`Exported ${baseName(shown)}${w.paths.length > 1 ? ` and ${w.paths.length - 1} more` : ''}.`, 'success', can('showInFolder') ? { label: 'Show in folder', run: () => void api.files.showInFolder(shown) } : undefined, 9000, 'cheer');
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Export tileset" onClose={close} wide>
      <div className="ex-body">
        <div className="ex-options">
          <fieldset>
            <legend>Picture</legend>
            {tiles > 0 && <AtlasPreview image={atlas.image} />}
            <div className="ex-grid2">
              <label>
                Columns
                <input type="number" min={0} max={64} value={s.columns} onChange={(e) => set({ columns: num(e.target.value, 0, 64) })} />
                <small>{s.columns === 0 ? 'Auto' : ' '}</small>
              </label>
              <label>
                Size
                <select value={s.scale} onChange={(e) => set({ scale: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 6, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}×
                    </option>
                  ))}
                </select>
                <small>whole numbers keep pixels square</small>
              </label>
              <label>
                Padding
                <input type="number" min={0} max={16} value={s.padding} onChange={(e) => set({ padding: num(e.target.value, 0, 16) })} />
                <small>empty pixels between tiles</small>
              </label>
              <label>
                Extrude
                <input type="number" min={0} max={8} value={s.extrude} onChange={(e) => set({ extrude: num(e.target.value, 0, 8) })} />
                <small>edge pixels repeated outwards (stops thin lines between tiles in games)</small>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Also save</legend>
            <Check checked={s.godot} onChange={(v) => set({ godot: v })}>
              Godot TileSet (.tres)
            </Check>
            <Check checked={s.godotScene} onChange={(v) => set({ godotScene: v })}>
              Godot scene with your {maps === 1 ? 'tilemap' : 'tilemaps'} (.tscn){maps ? '' : ' (add a tilemap layer first)'}
            </Check>
            {(s.godot || s.godotScene) && (
              <label className="ex-path">
                Where the picture will live in your Godot project
                <input type="text" spellCheck={false} placeholder={tilesetTexturePath('', doc.name)} value={s.godotPath} onChange={(e) => set({ godotPath: e.target.value })} />
              </label>
            )}
            <Check checked={s.json} onChange={(v) => set({ json: v })}>
              JSON file with every tile and map
            </Check>
            <Check checked={s.tiled} onChange={(v) => set({ tiled: v })}>
              Tiled tileset and map (.tsj, .tmj)
            </Check>
            <ExNote>Maps are saved as they are on frame {frame + 1}. Animated tiles keep their frames and timing.</ExNote>
          </fieldset>
        </div>
      </div>
      <div className="io-foot ex-foot">
        <span className={`ex-summary${problem ? ' ex-problem' : ''}`} aria-live="polite">
          {problem ?? `${tiles} tile${tiles === 1 ? '' : 's'}, ${atlas.image.width} × ${atlas.image.height} px`}
        </span>
        <button type="button" className="io-btn" onClick={close}>
          Cancel
        </button>
        <button type="button" className="io-btn io-primary ex-go" disabled={!!problem || busy || !desktop()} title={!desktop() ? 'Exporting works in the Frameling desktop app.' : undefined} onClick={() => void go()}>
          <Icon name="export" size={16} /> Export
        </button>
      </div>
    </Modal>
  );
}

export function openExportTilesetDialog(): void {
  mountModal((close) => <ExportTilesetDialog close={close} />);
}
