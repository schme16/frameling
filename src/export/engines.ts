// The data files each game engine (or a web page) wants next to a sprite sheet, and the step that turns rendered
// frames into the finished set of files. Pure text and maths, so all of it is tested without a canvas.
import { exportClipNames, flowManifest, type FlowManifest } from '../core/flow';
import { strToU8 } from 'fflate';
import type { Clip, Doc, Marker } from '../core/format';
import { encodePng, type RawImage } from '../io/png';
import { slug } from './plan';
import {
  animationRuns, atlasFrame, buildAnimations, buildAtlas, buildCells, composeSheet, godotResourcePath, godotScene,
  godotSpriteFrames, godotTexturePath, layoutCells, layoutPacked, type Animation, type Cell, type Layout,
} from './sheet';
import { normalizeSheet, type SheetSettings } from './types';

// ---------------------------------------------------------------- names

/** Letters, digits, _ - and . only, so a name is safe in every engine and as part of a file name. */
export function safeName(s: string, fallback = 'sprite'): string {
  const t = s.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_.-]/g, '');
  return t || fallback;
}

function uniquer() {
  const used = new Set<string>();
  return (name: string) => {
    let n = name;
    for (let k = 2; used.has(n); k++) n = `${name}_${k}`;
    used.add(n);
    return n;
  };
}

/** A name per cell for an animation: `run_0`, `run_1`... after the first animation that shows it, else `frame_N`. */
export function animationCellNames(animations: Animation[], cellOfFrame: number[], cellCount: number): string[] {
  const names: (string | null)[] = new Array(cellCount).fill(null);
  const unique = uniquer();
  for (const a of animations) {
    animationRuns({ ...a, frames: a.clip ?? a.frames }, cellOfFrame).forEach((r, k) => {
      if (names[r.cell] === null) names[r.cell] = unique(`${safeName(a.name, 'anim')}_${k}`);
    });
  }
  return names.map((n, i) => n ?? unique(`frame_${i}`));
}

/**
 * A name per frame for separate sprites (icons, tiles): a marker on that frame names it, else the clip it is in
 * (`coin_0`, `coin_1`), else `frame_N` with N counted from 1 like the timeline.
 */
export function separateSpriteNames(o: { start: number; end: number; clips: Clip[]; markers: Marker[] }): string[] {
  const unique = uniquer();
  const out: string[] = [];
  for (let f = o.start; f <= o.end; f++) {
    const marker = o.markers.find((m) => m.frame === f && m.name.trim());
    const clip = o.clips.find((c) => f >= Math.min(c.start, c.end) && f <= Math.max(c.start, c.end));
    if (marker) out.push(unique(safeName(marker.name)));
    else if (clip) out.push(unique(`${safeName(clip.name, 'clip')}_${f - Math.min(clip.start, clip.end)}`));
    else out.push(unique(`frame_${f + 1}`));
  }
  return out;
}

// ---------------------------------------------------------------- Phaser

export interface SheetData {
  image: string;
  layout: Layout;
  cells: Cell[];
  cellOfFrame: number[];
  animations: Animation[];
  names: string[];
}

/** The widely used "JSON hash" atlas shape: frames keyed by name. Phaser's `load.atlas` and PixiJS both read it. */
export function hashAtlas(d: SheetData, extraMeta: Record<string, unknown> = {}) {
  return {
    frames: Object.fromEntries(d.cells.map((c, i) => [d.names[i], atlasFrame(c, d.layout.positions[i])])),
    meta: { app: 'Frameling', version: '1', image: d.image, format: 'RGBA8888', size: { w: d.layout.width, h: d.layout.height }, scale: '1', ...extraMeta },
  };
}

/** Each animation's frame names, a held frame repeated once per document frame (players with no per-frame time need that). */
export function expandedNames(a: Animation, d: Pick<SheetData, 'cellOfFrame' | 'names'>): string[] {
  return a.frames.map((f) => d.names[d.cellOfFrame[f]]);
}

/**
 * Phaser 3 animations, the shape `this.anims.fromJSON` and `this.load.animation` read. Backward is the frames the
 * other way round, and a clip that plays N times uses Phaser's own `repeat` (N - 1) when one pass ends where it
 * should. Back and forth that plays a set number of times lists every frame instead: Phaser's `yoyo` shows the ends
 * twice and would end on the wrong frame.
 */
export function phaserAnimations(d: SheetData, textureKey: string) {
  return {
    anims: d.animations.map((a) => {
      const native = !a.loop && a.repeat && a.pass && !a.direction?.startsWith('pingpong');
      return {
        key: a.name,
        type: 'frame',
        frames: expandedNames(native ? { ...a, frames: a.pass! } : a, d).map((frame) => ({ key: textureKey, frame })),
        frameRate: a.fps,
        repeat: a.loop ? -1 : native ? a.repeat! - 1 : 0,
        delay: 0,
        yoyo: false,
      };
    }),
    globalTimeScale: 1,
  };
}

/** What a clip says about how it plays, when it says something: written next to frame lists that already follow it. */
export function playExtras(a: Pick<Animation, 'direction' | 'repeat'>): { direction?: string; repeat?: number } {
  return { ...(a.direction ? { direction: a.direction } : {}), ...(a.repeat ? { repeat: a.repeat } : {}) };
}

// ---------------------------------------------------------------- PixiJS

/** A PixiJS spritesheet: the hash atlas plus `animations`, which `Spritesheet` turns into lists of textures. */
export function pixiSheet(d: SheetData) {
  const base = hashAtlas(d, { frameling: { animations: Object.fromEntries(d.animations.map((a) => [a.name, { fps: a.fps, loop: a.loop, animationSpeed: Math.round((a.fps / 60) * 10000) / 10000, ...playExtras(a) }])) } });
  return { frames: base.frames, animations: Object.fromEntries(d.animations.map((a) => [a.name, expandedNames(a, d)])), meta: base.meta };
}

// ---------------------------------------------------------------- Unity

/** What the Unity importer script reads: rects counted from the bottom (Unity's way), a pivot that keeps trimmed frames in place. */
export function unitySheet(d: SheetData, o: { pixelArt: boolean }) {
  const H = d.layout.height;
  const ppu = Math.max(1, d.cells[0]?.source.h ?? 100);
  return {
    format: 'frameling-unity',
    version: 1,
    image: d.image,
    width: d.layout.width,
    height: H,
    pixelsPerUnit: ppu,
    pixelArt: o.pixelArt,
    frames: d.cells.map((c, i) => {
      const at = d.layout.positions[i];
      const w = c.image.width;
      const h = c.image.height;
      // The middle of the full frame, measured inside the trimmed picture (from its bottom left).
      const pivotX = (c.source.w / 2 - c.trim.x) / w;
      const pivotY = (c.trim.y + h - c.source.h / 2) / h;
      return { name: d.names[i], x: at.x, y: H - at.y - h, w, h, pivotX: round4(pivotX), pivotY: round4(pivotY) };
    }),
    animations: d.animations.map((a) => {
      const runs = animationRuns(a, d.cellOfFrame);
      return { name: a.name, fps: a.fps, loop: a.loop, ...playExtras(a), frames: runs.map((r) => d.names[r.cell]), holds: runs.map((r) => r.frames) };
    }),
  };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export const UNITY_SCRIPT_NAME = 'FramelingSheetImporter.cs';
export const UNITY_ASMDEF_NAME = 'FramelingSheetImporter.asmdef';

/**
 * Keeps the importer in its own assembly, so it can tell whether the 2D Sprite package is there (FRAMELING_2D_SPRITE) and
 * a project without it still compiles. Only references the package's editor assembly when it is installed.
 */
export const UNITY_ASMDEF = JSON.stringify(
  {
    name: 'Frameling.SheetImporter',
    rootNamespace: '',
    references: ['Unity.2D.Sprite.Editor'],
    includePlatforms: ['Editor'],
    excludePlatforms: [],
    allowUnsafeCode: false,
    overrideReferences: false,
    precompiledReferences: [],
    autoReferenced: true,
    defineConstraints: [],
    versionDefines: [{ name: 'com.unity.2d.sprite', expression: '1.0.0', define: 'FRAMELING_2D_SPRITE' }],
    noEngineReferences: false,
  },
  null,
  2,
) + '\n';

/** The small editor script that slices a sheet and makes the animation clips. Wrapped in UNITY_EDITOR, so it can live in any folder. */
export const UNITY_SCRIPT = `// Frameling sprite sheet importer for Unity (checked in Unity 6.6).
// Keep one copy anywhere under Assets, with FramelingSheetImporter.asmdef beside it (a second copy gets a Console warning). When a PNG has a Frameling .json
// beside it, this cuts the PNG into sprites and makes an animation clip (.anim) for each of your clips, next to the PNG.
// Re-export to update them. With the 2D Sprite package (2D projects have it) the sprites keep their ids when you re-export;
// without it the older cutting API is used, so the project still compiles.
#if UNITY_EDITOR
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
#if FRAMELING_2D_SPRITE
using UnityEditor.U2D.Sprites;
#endif
using UnityEngine;

public class FramelingSheetImporter : AssetPostprocessor
{
    [System.Serializable] public class FrameData { public string name; public float x, y, w, h, pivotX, pivotY; }
    [System.Serializable] public class AnimData { public string name; public float fps; public bool loop; public string[] frames; public int[] holds; }
    [System.Serializable] public class SheetData { public string format; public int version; public string image; public int width, height; public float pixelsPerUnit; public bool pixelArt; public FrameData[] frames; public AnimData[] animations; }

    // Says so in the Console when another copy of this importer is in the project (an older script in Assets/Editor, say):
    // both would cut every sheet, and the older one may be out of date. Once per editor session, so it doesn't repeat on every compile.
    [InitializeOnLoadMethod]
    static void WarnAboutOtherCopies()
    {
        if (SessionState.GetBool("Frameling.OtherImporterChecked", false)) return;
        // The asset database isn't ready while scripts load, and a reload can drop a waiting call, so it is marked done only once it ran.
        EditorApplication.delayCall += () =>
        {
            if (SessionState.GetBool("Frameling.OtherImporterChecked", false)) return;
            SessionState.SetBool("Frameling.OtherImporterChecked", true);
            var found = new List<string>();
            string own = null;
            foreach (var guid in AssetDatabase.FindAssets("FramelingSheetImporter t:MonoScript"))
            {
                var path = AssetDatabase.GUIDToAssetPath(guid);
                if (Path.GetFileName(path) != "FramelingSheetImporter.cs") continue;
                // This copy's own file is the one whose class is the running one.
                var script = AssetDatabase.LoadAssetAtPath<MonoScript>(path);
                if (script != null && script.GetClass() == typeof(FramelingSheetImporter)) own = path;
                else found.Add(path);
            }
            foreach (var other in found)
                Debug.LogWarning("Frameling: another copy of FramelingSheetImporter is in this project, so every sheet is cut twice. "
                    + "Delete the older file " + other + " (and the FramelingSheetImporter.asmdef beside it, if there is one) and keep " + (own ?? "the newer copy") + ".",
                    AssetDatabase.LoadAssetAtPath<MonoScript>(other));
        };
    }

    static SheetData Read(string pngPath)
    {
        var jsonPath = Path.ChangeExtension(pngPath, ".json");
        if (!File.Exists(jsonPath)) return null;
        var data = JsonUtility.FromJson<SheetData>(File.ReadAllText(jsonPath));
        return data != null && data.format == "frameling-unity" ? data : null;
    }

    void OnPreprocessTexture()
    {
        var data = Read(assetPath);
        if (data == null) return;
        var importer = (TextureImporter)assetImporter;
        importer.textureType = TextureImporterType.Sprite;
        importer.spriteImportMode = SpriteImportMode.Multiple;
        importer.spritePixelsPerUnit = data.pixelsPerUnit;
        importer.mipmapEnabled = false;
        importer.alphaIsTransparency = true;
        // Unity shrinks pictures bigger than the max size (2048 unless told), which would put every cut in the wrong place.
        var biggest = Mathf.Max(data.width, data.height);
        var size = 32;
        while (size < biggest && size < 16384) size *= 2;
        importer.maxTextureSize = size;
        if (data.pixelArt)
        {
            importer.filterMode = FilterMode.Point;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
        }

        Cut(importer, data);
    }

#if FRAMELING_2D_SPRITE
    static void Cut(TextureImporter importer, SheetData data)
    {
        var factory = new SpriteDataProviderFactories();
        factory.Init();
        var provider = factory.GetSpriteEditorDataProviderFromObject(importer);
        provider.InitSpriteEditorDataProvider();
        // Keep each sprite's id across re-imports, so scenes and clips that use it don't break.
        var old = new Dictionary<string, GUID>();
        foreach (var r in provider.GetSpriteRects()) old[r.name] = r.spriteID;
        var rects = data.frames.Select(f => new SpriteRect
        {
            name = f.name,
            rect = new Rect(f.x, f.y, f.w, f.h),
            alignment = SpriteAlignment.Custom,
            pivot = new Vector2(f.pivotX, f.pivotY),
            spriteID = old.TryGetValue(f.name, out var id) ? id : GUID.Generate(),
        }).ToArray();
        provider.SetSpriteRects(rects);
        var ids = provider.GetDataProvider<ISpriteNameFileIdDataProvider>();
        if (ids != null) ids.SetNameFileIdPairs(rects.Select(r => new SpriteNameFileIdPair(r.name, r.spriteID)).ToList());
        provider.Apply();
    }
#else
    // No 2D Sprite package in this project: cut with the older API every Unity has.
    static void Cut(TextureImporter importer, SheetData data)
    {
#pragma warning disable 618
        importer.spritesheet = data.frames.Select(f => new SpriteMetaData
        {
            name = f.name,
            rect = new Rect(f.x, f.y, f.w, f.h),
            alignment = (int)SpriteAlignment.Custom,
            pivot = new Vector2(f.pivotX, f.pivotY),
        }).ToArray();
#pragma warning restore 618
    }
#endif

    static void OnPostprocessAllAssets(string[] imported, string[] deleted, string[] moved, string[] movedFrom)
    {
        foreach (var path in imported)
        {
            if (!path.EndsWith(".png", System.StringComparison.OrdinalIgnoreCase)) continue;
            var data = Read(path);
            if (data == null || data.animations == null || data.animations.Length == 0) continue;
            var png = path;
            // Assets can't be made while importing, so the clips wait until it's done.
            EditorApplication.delayCall += () => MakeClips(png, data);
        }
    }

    static void MakeClips(string pngPath, SheetData data)
    {
        var sprites = new Dictionary<string, Sprite>();
        foreach (var s in AssetDatabase.LoadAllAssetsAtPath(pngPath).OfType<Sprite>()) sprites[s.name] = s;
        var folder = Path.GetDirectoryName(pngPath).Replace('\\\\', '/');
        var baseName = Path.GetFileNameWithoutExtension(pngPath);
        foreach (var a in data.animations)
        {
            var keys = new List<ObjectReferenceKeyframe>();
            float t = 0;
            int lastHold = 1;
            for (int i = 0; i < a.frames.Length; i++)
            {
                if (!sprites.TryGetValue(a.frames[i], out var sprite)) continue;
                keys.Add(new ObjectReferenceKeyframe { time = t, value = sprite });
                t += a.holds[i] / a.fps;
                lastHold = a.holds[i];
            }
            if (keys.Count == 0) continue;
            // Unity ends a clip one frame after its last key, so a last frame held for more than one frame
            // needs a key on its own final tick (and none at all when it is held for one).
            if (lastHold > 1) keys.Add(new ObjectReferenceKeyframe { time = t - 1f / a.fps, value = keys[keys.Count - 1].value });
            var clip = new AnimationClip { frameRate = a.fps };
            AnimationUtility.SetObjectReferenceCurve(clip, EditorCurveBinding.PPtrCurve("", typeof(SpriteRenderer), "m_Sprite"), keys.ToArray());
            var settings = AnimationUtility.GetAnimationClipSettings(clip);
            settings.loopTime = a.loop;
            AnimationUtility.SetAnimationClipSettings(clip, settings);
            // Looping clips wrap; the others stay on their last frame. (Backward and back and forth are already in the order of the keys.)
            clip.wrapMode = a.loop ? WrapMode.Loop : WrapMode.ClampForever;
            var clipPath = folder + "/" + baseName + "_" + a.name + ".anim";
            var existing = AssetDatabase.LoadAssetAtPath<AnimationClip>(clipPath);
            if (existing != null)
            {
                EditorUtility.CopySerialized(clip, existing);
                EditorUtility.SetDirty(existing);
            }
            else AssetDatabase.CreateAsset(clip, clipPath);
        }
        AssetDatabase.SaveAssets();
    }
}
#endif
`;

// ---------------------------------------------------------------- CSS

const cssId = (s: string) => slug(s.replace(/_/g, '-'), 'sprite');
/** The class prefix: a CSS name cannot start with a digit, so "2D Hero" becomes "sprite-2d-hero". */
const cssPrefix = (s: string) => {
  const id = cssId(s);
  return /^[0-9]/.test(id) ? `sprite-${id}` : id;
};
/** Class name pieces for each name, made different where two names would give the same one ("Idle" and "idle", or two names with no letters). */
export function cssIds(names: string[], taken: Iterable<string> = []): string[] {
  const used = new Set(taken);
  return names.map((n) => {
    const base = cssId(n);
    let id = base;
    for (let k = 2; used.has(id); k++) id = `${base}-${k}`;
    used.add(id);
    return id;
  });
}
/** The class piece for each frame, for each animation, and the names the frames take (a frame class never matches an animation). */
function cssNames(d: SheetData, separate: boolean) {
  if (separate) return { frames: cssIds(d.names), animations: [] as string[] };
  const frames = cssIds(d.names);
  return { frames, animations: cssIds(d.animations.map((a) => a.name), frames.map((f) => `frame-${f}`)) };
}
const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;
const pos = (at: { x: number; y: number }) => `${at.x ? -at.x + 'px' : '0'} ${at.y ? -at.y + 'px' : '0'}`;

/**
 * CSS sprites: a base class with the picture, a class per frame, and for animations a class that plays it with
 * keyframes (held frames last their full time). Use as `<div class="hero hero-run"></div>`.
 */
export function cssSprites(d: SheetData, o: { prefix: string; pixelArt: boolean; separate: boolean }): string {
  const p = cssPrefix(o.prefix);
  const ids = cssNames(d, o.separate);
  const out: string[] = [];
  const first = d.cells[0];
  out.push(`/* Made with Frameling. Use: <div class="${p} ${p}-${d.animations[0] ? ids.animations[0] : ids.frames[0] ?? 'frame'}"></div> */`);
  out.push(`.${p} {`, '  display: inline-block;', `  background: url("${d.image}") no-repeat;`);
  if (!o.separate && first) out.push(`  width: ${first.image.width}px;`, `  height: ${first.image.height}px;`);
  if (o.pixelArt) out.push('  image-rendering: pixelated;');
  out.push('}', '');
  d.cells.forEach((c, i) => {
    const cls = o.separate ? `${p}-${ids.frames[i]}` : `${p}-frame-${ids.frames[i]}`;
    const size = o.separate ? ` width: ${c.image.width}px; height: ${c.image.height}px;` : '';
    out.push(`.${cls} { background-position: ${pos(d.layout.positions[i])};${size} }`);
  });
  for (const [k, anim] of d.animations.entries()) {
    // A clip that plays forward or backward N times repeats one pass with `animation-iteration-count`. Back and forth
    // lists every frame instead: `animation-direction: alternate` shows each end twice, and so does a reversed run of
    // step-end keyframes (it shows each picture a step late).
    const times = !anim.loop && anim.repeat && anim.pass && !anim.direction?.startsWith('pingpong') ? anim.repeat : 1;
    const a = times > 1 ? { ...anim, frames: anim.pass! } : anim;
    const runs = animationRuns(a, d.cellOfFrame);
    const total = a.frames.length;
    const name = `${p}-${ids.animations[k]}`;
    const seconds = Math.round((total / a.fps) * 10000) / 10000;
    out.push('', `.${name} {`, `  background-position: ${pos(d.layout.positions[runs[0].cell])};`);
    out.push(`  animation: ${name} ${seconds}s step-end ${a.loop ? 'infinite' : `${times} forwards`};`, '}');
    out.push(`@keyframes ${name} {`);
    let t = 0;
    for (const r of runs) {
      out.push(`  ${pct((t / total) * 100)} { background-position: ${pos(d.layout.positions[r.cell])}; }`);
      t += r.frames;
    }
    out.push(`  100% { background-position: ${pos(d.layout.positions[runs[runs.length - 1].cell])}; }`, '}');
  }
  return out.join('\n') + '\n';
}

/** A small page that shows every animation (or sprite) playing, to check it and copy from. */
export function cssPreviewPage(d: SheetData, o: { prefix: string; css: string; title: string; pixelArt: boolean; separate: boolean }): string {
  const p = cssPrefix(o.prefix);
  const ids = cssNames(d, o.separate);
  const zoom = o.pixelArt ? 4 : 1;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const items = o.separate ? ids.frames.map((id) => `${p} ${p}-${id}`) : ids.animations.map((id) => `${p} ${p}-${id}`);
  const labels = o.separate ? d.names : d.animations.map((a) => a.name);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(o.title)}</title>
<link rel="stylesheet" href="${esc(o.css)}">
<style>
body { font: 14px system-ui, sans-serif; margin: 24px; background: #f4f1ea; color: #1d1b26; }
.row { display: flex; flex-wrap: wrap; gap: 24px; }
figure { margin: 0; text-align: center; }
figure > div { zoom: ${zoom}; }
code { background: #fff; padding: 2px 6px; border-radius: 4px; }
</style>
</head>
<body>
<h1>${esc(o.title)}</h1>
<div class="row">
${items.map((cls, i) => `<figure><div class="${cls}"></div><figcaption><code>${esc(`<div class="${cls}"></div>`)}</code><br>${esc(labels[i])}</figcaption></figure>`).join('\n')}
</div>
</body>
</html>
`;
}

// ---------------------------------------------------------------- Godot, separate sprites

/** One AtlasTexture resource for a single sprite cut from the sheet (icons, tiles). */
export function godotAtlasTexture(texturePath: string, c: Cell, at: { x: number; y: number }): string {
  const gd = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  const out = ['[gd_resource type="AtlasTexture" load_steps=2 format=3]', '', `[ext_resource type="Texture2D" path=${gd(texturePath)} id="1_sheet"]`, '', '[resource]', 'atlas = ExtResource("1_sheet")', `region = Rect2(${at.x}, ${at.y}, ${c.image.width}, ${c.image.height})`];
  if (c.image.width !== c.source.w || c.image.height !== c.source.h) out.push(`margin = Rect2(${c.trim.x}, ${c.trim.y}, ${c.source.w - c.image.width}, ${c.source.h - c.image.height})`);
  out.push('filter_clip = true', '');
  return out.join('\n');
}

// ---------------------------------------------------------------- clip flow for Godot

/** A GDScript for an AnimatedSprite2D that follows the clip flow: plays the start clip, moves on at clip ends, and `fire("name")` follows a trigger. */
export function godotFlowScript(flow: FlowManifest, resource: string): string {
  const data = JSON.stringify(flow, null, '\t').split('\n').join('\n');
  return `# Made by Frameling. Attach to the AnimatedSprite2D that plays ${resource}.
# It plays the clips the way the clip flow says: the start clip first, then on to the next one when a clip ends,
# and fire("trigger name") follows a trigger (a jump, a hit). clip_changed tells you when it moves on.
extends AnimatedSprite2D

signal clip_changed(clip: String)

const FLOW := ${data}

func _ready() -> void:
	animation_finished.connect(_on_clip_end)
	animation_looped.connect(_on_clip_end)
	go_to(FLOW["start"])

## Plays a clip by name.
func go_to(clip: String) -> void:
	play(clip)
	clip_changed.emit(clip)

## Follows a trigger from the clip playing now. Returns false when it leads nowhere from here.
func fire(trigger: String) -> bool:
	for t in FLOW["transitions"]:
		if t["from"] == animation and t["on"] == "trigger" and t["trigger"] == trigger:
			go_to(t["to"])
			return true
	return false

func _on_clip_end() -> void:
	for t in FLOW["transitions"]:
		if t["from"] == animation and t["on"] == "end":
			go_to(t["to"])
			return
`;
}

// ---------------------------------------------------------------- the whole job

export class SheetProblem extends Error {}

export interface SheetJob {
  doc: Pick<Doc, 'name' | 'clips' | 'markers' | 'fps'> & Partial<Pick<Doc, 'flow'>>;
  sheet: SheetSettings;
  /** The exported frames, first to last of the range. */
  frames: RawImage[];
  range: { start: number; end: number };
  /** Whole animation (every clip becomes an animation) or one clip / frame. */
  whole: boolean;
  clipId: string | null;
  scale: number;
  /** Name for the files when the engine doesn't decide it. */
  name: string;
  /** Crisp pixel art (sets nearest-neighbour filtering where the engine has a setting for it). */
  pixelArt: boolean;
  maxSide: number;
}

export interface SheetFiles {
  files: { name: string; bytes: Uint8Array }[];
  /** The file to point at afterwards. */
  main: string;
  /** Sheet size, for checks. */
  width: number;
  height: number;
}

const text = (s: string) => strToU8(s);
const json = (v: unknown) => strToU8(JSON.stringify(v, null, 2) + '\n');

/** Turns rendered frames into the finished files for the chosen engine. */
export function buildSheetFiles(job: SheetJob): SheetFiles {
  const sheet = normalizeSheet(job.sheet);
  const { doc, range } = job;
  const separate = sheet.content === 'separate';
  const engine = sheet.engine;
  const animations = separate ? [] : buildAnimations({ clips: doc.clips, rangeStart: range.start, rangeEnd: range.end, fps: doc.fps, whole: job.whole, onlyClipId: job.clipId });
  // A new clip must start a new cell, or two clips would share a picture that one of them might later change.
  const cuts = new Set<number>();
  for (const c of doc.clips) cuts.add(Math.min(c.start, c.end) - range.start).add(Math.max(c.start, c.end) + 1 - range.start);
  // CSS animations show every frame in the same box, so they keep frames whole.
  const trim = sheet.trim && !(engine === 'css' && !separate);
  const { cells, cellOfFrame } = buildCells(job.frames, { trim, dedupe: sheet.dedupe && !separate, cuts });
  const names = separate ? separateSpriteNames({ ...range, clips: doc.clips, markers: doc.markers }) : animationCellNames(animations, cellOfFrame, cells.length);

  const texturePath = godotTexturePath(sheet.godotPath, doc.name);
  const base = (engine === 'godot' ? texturePath.split('/').pop()!.replace(/\.[^.]*$/, '') : '') || slug(job.name);

  if (separate && sheet.separateFiles) {
    const files = cells.map((c, i) => ({ name: `${names[i]}.png`, bytes: encodePng(c.image) }));
    return { files, main: files[0].name, width: 0, height: 0 };
  }

  const layout = sheet.layout === 'packed' ? layoutPacked(cells, { padding: sheet.padding, pot: sheet.pot, extrude: sheet.extrude, maxSide: job.maxSide }) : layoutCells(cells, { columns: sheet.columns, padding: sheet.padding, pot: sheet.pot, extrude: sheet.extrude });
  if (!layout || layout.width > job.maxSide || layout.height > job.maxSide) throw new SheetProblem(`The sheet would be bigger than ${job.maxSide} pixels on a side. Try a smaller size, trimming, or exporting one clip at a time.`);
  const image = `${base}.png`;
  const files: { name: string; bytes: Uint8Array }[] = [{ name: image, bytes: encodePng(composeSheet(cells, layout)) }];
  const d: SheetData = { image, layout, cells, cellOfFrame, animations, names };
  const genericJson = () => buildAtlas({ image, layout, cells, cellOfFrame, animations, fps: doc.fps, scale: job.scale, frameCount: job.frames.length, names, style: sheet.jsonStyle });

  switch (engine) {
    case 'json':
      files.push({ name: `${base}.json`, bytes: json(genericJson()) });
      break;
    case 'godot':
      if (separate) {
        cells.forEach((c, i) => files.push({ name: `${base}-${slug(names[i], 'sprite')}.tres`, bytes: text(godotAtlasTexture(texturePath, c, layout.positions[i])) }));
      } else {
        files.push({ name: `${base}.tres`, bytes: text(godotSpriteFrames({ texturePath, layout, cells, cellOfFrame, animations })) });
        // The clip flow: which clip follows which, as JSON plus a small script that plays it.
        const inRange = (c: Clip) => Math.max(range.start, Math.min(c.start, c.end)) <= Math.min(range.end, Math.max(c.start, c.end));
        const names = exportClipNames(doc.clips, inRange);
        const flow = job.whole ? flowManifest(doc, (c) => names.get(c.id)) : undefined;
        if (flow) {
          files.push({ name: `${base}-flow.json`, bytes: json(flow) });
          files.push({ name: `${base}_flow.gd`, bytes: text(godotFlowScript(flow, `${base}.tres`)) });
        }
        if (sheet.godotScene) {
          const node = doc.name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Sprite';
          files.push({ name: `${base}.tscn`, bytes: text(godotScene({ resourcePath: godotResourcePath(texturePath), nodeName: node, animation: animations[0].name, pixelArt: job.pixelArt })) });
        }
      }
      break;
    case 'phaser':
      files.push({ name: `${base}.json`, bytes: json(hashAtlas(d)) });
      if (animations.length) files.push({ name: `${base}-anims.json`, bytes: json(phaserAnimations(d, base)) });
      break;
    case 'pixi':
      files.push({ name: `${base}.json`, bytes: json(pixiSheet(d)) });
      break;
    case 'unity':
      files.push({ name: `${base}.json`, bytes: json(unitySheet(d, { pixelArt: job.pixelArt })) });
      if (sheet.unityScript) files.push({ name: UNITY_SCRIPT_NAME, bytes: text(UNITY_SCRIPT) }, { name: UNITY_ASMDEF_NAME, bytes: text(UNITY_ASMDEF) });
      break;
    case 'css': {
      const css = cssSprites(d, { prefix: base, pixelArt: job.pixelArt, separate });
      files.push({ name: `${base}.css`, bytes: text(css) }, { name: `${base}.html`, bytes: text(cssPreviewPage(d, { prefix: base, css: `${base}.css`, title: doc.name, pixelArt: job.pixelArt, separate })) });
      break;
    }
    case 'none':
      break;
  }
  // The generic JSON can ride along with engines that don't already write a JSON file.
  if (sheet.json && (engine === 'godot' || engine === 'css')) files.push({ name: `${base}.json`, bytes: json(genericJson()) });
  return { files, main: image, width: layout.width, height: layout.height };
}
