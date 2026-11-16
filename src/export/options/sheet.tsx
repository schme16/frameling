// What a sprite sheet export asks: where it is going (the engine and its extras) and how the sheet is laid out.
import { ExNote } from '../ExNote';
import { flowExportNotes } from '../../core/flow';
import { useChoice } from '../../core/choices';
import { sheetExported } from '../../pixel/moments';
import { sheetFooter } from '../../pixel/sheetMode';
import { isPixelDoc } from '../../pixel/way';
import { store } from '../../core/store';
import { openHelp, openPrefs } from '../../ui/overlays';
import { BonesLookNotes } from '../BonesLookNotes';
import { EnginePicker } from '../EnginePicker';
import { hasBonesToExport } from '../godot-bones-scope';
import type { ExportUiHookProps, ExportUiProps } from '../registry';
import { godotTexturePath } from '../sheet';
import { engineInfo, normalizeSheet, type EngineId } from '../types';
import { Check } from './controls';

/** Where it is going: the engine picker and what that engine adds. */
export function SheetWhere({ s, set, setSheet, doc }: ExportUiProps) {
  const bounceMode = useChoice<string>('export.clipEngineBounce');
  const sheet = normalizeSheet(s.sheet);
  const engine = engineInfo(sheet.engine);
  const separate = sheet.content === 'separate';
  const hasBones = hasBonesToExport(doc);
  const godotBones = sheet.engine === 'godot' && hasBones && !separate && sheet.godotRig === 'bones';
  const pickEngine = (id: EngineId) => {
    setSheet({ engine: id, ...(id === 'godot' ? { godot: true } : {}) });
  };
  return (
    <fieldset>
      <legend>Where it's going</legend>
      <EnginePicker value={sheet.engine} onPick={pickEngine} />
      <p className="ex-note">
        {engine.files}.{' '}
        <button type="button" className="ex-link" onClick={() => openHelp(engine.help)}>
          {engine.game ? `How to use it in ${engine.title}` : 'How to use it'}
        </button>
      </p>
      {(sheet.engine === 'godot' || sheet.engine === 'phaser') && !separate && doc.clips.some((c) => c.direction === 'pingpong' || c.direction === 'pingpong-reverse') && (
        <ExNote>
          Back and forth clips: {bounceMode === 'engine' ? (sheet.engine === 'godot' ? "Godot's own back and forth loop (it calls it ping-pong) is used for clips that loop (smaller files, but the two end frames show twice). It needs Godot 4.7 or newer: older Godot plays those clips forward only." : "Phaser's own yoyo is used where it can (smaller files, plays the same).") : 'every frame is listed in order, so the ends show once, just like here.'}{' '}
          <button type="button" className="ex-link" onClick={() => openPrefs('behaviour')}>
            Change in Preferences
          </button>
        </ExNote>
      )}
      {sheet.engine === 'godot' && hasBones && !separate && (
        <div className="ex-seg" role="group" aria-label="What Godot gets">
          <button type="button" className={sheet.godotRig !== 'bones' ? 'ex-on' : ''} aria-pressed={sheet.godotRig !== 'bones'} title="Every frame drawn onto a sprite sheet. Plays exactly as it looks here." onClick={() => setSheet({ godotRig: 'frames' })}>
            Baked frames
          </button>
          <button type="button" className={sheet.godotRig === 'bones' ? 'ex-on' : ''} aria-pressed={sheet.godotRig === 'bones'} title="The skeleton, the parts and an AnimationPlayer with every clip, so you can change poses and timing in Godot (Skeleton2D)." onClick={() => setSheet({ godotRig: 'bones' })}>
            Bones (editable in Godot)
          </button>
        </div>
      )}
      {sheet.engine === 'godot' && hasBones && !separate && sheet.godotRig === 'bones' && (
        <p className="ex-note">
          A scene with the skeleton, a picture for each part and every clip as an animation.{' '}
          <button type="button" className="ex-link" onClick={() => openHelp('export-godot-bones')}>
            How it works
          </button>
        </p>
      )}
      {godotBones && <BonesLookNotes doc={doc} />}
      {/* What the clip flow's inputs and checks do in this export: Godot's script carries them, other engines and Godot bones or separate pictures have no flow. */}
      {flowExportNotes(doc, sheet.engine === 'godot' && !separate && !godotBones ? 'godot' : 'other').map((w) => (
        <ExNote key={w} stays>
          {w}
        </ExNote>
      ))}
      {sheet.engine === 'godot' && (
        <>
          {!separate && !godotBones && (
            <Check checked={s.sheet.godotScene} onChange={(v) => setSheet({ godotScene: v })}>
              Also make a ready-to-play scene (.tscn)
            </Check>
          )}
          <label className="ex-path">
            Where the picture will live in your Godot project
            <input type="text" spellCheck={false} placeholder={godotTexturePath('', doc.name)} value={s.sheet.godotPath} onChange={(e) => setSheet({ godotPath: e.target.value })} />
          </label>
        </>
      )}
      {sheet.engine === 'unity' && (
        <Check checked={sheet.unityScript} onChange={(v) => setSheet({ unityScript: v })}>
          Include the importer script (only needed once per project)
        </Check>
      )}
      {sheet.engine === 'json' && (
        <div className="ex-seg" role="group" aria-label="JSON frames">
          <button type="button" className={sheet.jsonStyle === 'array' ? 'ex-on' : ''} aria-pressed={sheet.jsonStyle === 'array'} title="Frames in a list, in order (often called JSON array)" onClick={() => setSheet({ jsonStyle: 'array' })}>
            Frames as a list
          </button>
          <button type="button" className={sheet.jsonStyle === 'hash' ? 'ex-on' : ''} aria-pressed={sheet.jsonStyle === 'hash'} title="Frames looked up by name (often called JSON hash)" onClick={() => setSheet({ jsonStyle: 'hash' })}>
            Frames by name
          </button>
        </div>
      )}
      {((sheet.engine === 'godot' && !godotBones) || sheet.engine === 'css') && (
        <Check checked={s.sheet.json} onChange={(v) => setSheet({ json: v })}>
          Also save a JSON file with where every frame is
        </Check>
      )}
    </fieldset>

  );
}

/** How the sheet is laid out, and what is on it. */
export function SheetLayout({ s, setSheet, doc }: ExportUiProps) {
  const sheet = normalizeSheet(s.sheet);
  const separate = sheet.content === 'separate';
  const hasBones = hasBonesToExport(doc);
  const godotBones = sheet.engine === 'godot' && hasBones && !separate && sheet.godotRig === 'bones';
  return (
    <>
      <fieldset>
        <legend>What's on it</legend>
        <div className="ex-seg">
          <button type="button" className={!separate ? 'ex-on' : ''} aria-pressed={!separate} title="Your clips become animations that play" onClick={() => setSheet({ content: 'animation' })}>
            An animation
          </button>
          <button type="button" className={separate ? 'ex-on' : ''} aria-pressed={separate} title="Each frame is its own sprite: icons, tiles, items" onClick={() => setSheet({ content: 'separate' })}>
            Separate sprites
          </button>
        </div>
        {separate && (
          <>
            <div className="ex-seg">
              <button type="button" className={!sheet.separateFiles ? 'ex-on' : ''} aria-pressed={!sheet.separateFiles} onClick={() => setSheet({ separateFiles: false })}>
                All on one sheet
              </button>
              <button type="button" className={sheet.separateFiles ? 'ex-on' : ''} aria-pressed={sheet.separateFiles} onClick={() => setSheet({ separateFiles: true })}>
                One PNG each
              </button>
            </div>
            <ExNote>Each frame is one sprite. Put a marker on a frame to name it, or it is named after its clip.</ExNote>
          </>
        )}
      </fieldset>

      {!(separate && sheet.separateFiles) && !godotBones && (
        <fieldset>
          <legend>Sheet</legend>
          <div className="ex-seg">
            <button type="button" className={sheet.layout === 'grid' ? 'ex-on' : ''} aria-pressed={sheet.layout === 'grid'} title="Every frame in a slot of the same size" onClick={() => setSheet({ layout: 'grid' })}>
              Tidy grid
            </button>
            <button type="button" className={sheet.layout === 'packed' ? 'ex-on' : ''} aria-pressed={sheet.layout === 'packed'} title="Frames fitted together as tightly as possible (packed atlas). Smallest picture, best with trimming." onClick={() => setSheet({ layout: 'packed' })}>
              Packed tight
            </button>
          </div>
          <div className="ex-grid3">
            {sheet.layout === 'grid' && (
              <label>
                Columns
                <input type="number" min={0} max={64} value={s.sheet.columns} onChange={(e) => setSheet({ columns: Math.max(0, Math.min(64, Math.round(+e.target.value || 0))) })} />
                <small>{s.sheet.columns === 0 ? 'Auto' : ' '}</small>
              </label>
            )}
            <label>
              Padding
              <input type="number" min={0} max={32} value={s.sheet.padding} onChange={(e) => setSheet({ padding: Math.max(0, Math.min(32, Math.round(+e.target.value || 0))) })} />
              <small>space between</small>
            </label>
            <label title="Repeats each frame's edge pixels outward, so scaled or moving sprites never show a thin seam (extrude)">
              Edge bleed
              <input type="number" min={0} max={8} value={sheet.extrude} onChange={(e) => setSheet({ extrude: Math.max(0, Math.min(8, Math.round(+e.target.value || 0))) })} />
              <small>extrude, pixels</small>
            </label>
          </div>
          <Check checked={s.sheet.trim} onChange={(v) => setSheet({ trim: v })} disabled={sheet.engine === 'css' && !separate} hint="CSS animations show every frame in the same box, so frames stay whole.">
            Trim empty space around each frame
          </Check>
          <Check checked={s.sheet.pot} onChange={(v) => setSheet({ pot: v })}>
            Make the sheet a power-of-two size (64, 128, 256...)
          </Check>
          {!separate && (
            <Check checked={s.sheet.dedupe} onChange={(v) => setSheet({ dedupe: v })}>
              Store repeated frames once
            </Check>
          )}
        </fieldset>
      )}
      {separate && sheet.separateFiles && (
        <Check checked={s.sheet.trim} onChange={(v) => setSheet({ trim: v })}>
          Trim empty space around each sprite
        </Check>
      )}
    </>

  );
}

/** The line under the dialog for pixel art on a sheet. */
export function sheetSummary({ plan, s, abPlan }: ExportUiHookProps): string | null {
  const separate = normalizeSheet(s.sheet).content === 'separate';
  if (!isPixelDoc(store().rootDoc()) || separate) return null;
  return !(abPlan ? abPlan.problem : plan.problem) ? sheetFooter(store().rootDoc(), abPlan?.mode ?? 'one', abPlan, plan) : null;
}

/** Pixel art sent to a game engine is a moment worth a word from the mascot. */
export function sheetExportedNote({ s, plan, abPlan }: ExportUiHookProps): void {
  if (isPixelDoc(store().rootDoc())) sheetExported(normalizeSheet(s.sheet).engine, abPlan?.frames ?? plan.count);
}
