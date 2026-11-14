// Test-only editor script for scripts/e2e/export.cjs (UNITY_BIN). It is copied into a throwaway Unity project beside an
// exported Frameling sprite sheet and the importer script, and run with -executeMethod FramelingSheetCheck.Run.
// Arguments: -sheet <Assets/path/to/sheet.png>  -report <file to write the result lines to>  -ids <file>.
// -reimport forces the picture through the importer again (after its json changed). -ids compares the sprites' ids with
// the ones an earlier run saved there (so re-exporting must keep them), or saves them when the file isn't there yet.
// -expect package|older says which cutting path the importer must have taken (2D Sprite package present or not).
// -wait <seconds> keeps the editor open at least that long before it exits.
// A sheet with no animations must leave no .anim files next to it.
// Exit code 0 means every check passed; 1 means some failed (listed in the report); 2 means the clips never appeared.
#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Playables;

public static class FramelingSheetCheck
{
    static readonly List<string> lines = new List<string>();
    static int bad;

    static string Arg(string name)
    {
        var a = Environment.GetCommandLineArgs();
        for (int i = 0; i < a.Length - 1; i++) if (a[i] == name) return a[i + 1];
        return null;
    }

    static void Check(bool ok, string what)
    {
        if (!ok) { bad++; lines.Add("FAIL " + what); }
    }

    static bool Near(float a, float b, float eps = 0.001f) { return Mathf.Abs(a - b) <= eps; }

    public static void Run()
    {
        var sheet = Arg("-sheet");
        var report = Arg("-report");
        var json = Path.ChangeExtension(sheet, ".json");
        var data = JsonUtility.FromJson<FramelingSheetImporter.SheetData>(File.ReadAllText(json));
        if (Array.IndexOf(Environment.GetCommandLineArgs(), "-reimport") >= 0) AssetDatabase.ImportAsset(sheet, ImportAssetOptions.ForceUpdate);
        var started = EditorApplication.timeSinceStartup;
        // The clips are made after the import finishes, so wait for them (the importer uses delayCall).
        EditorApplication.CallbackFunction tick = null;
        tick = () =>
        {
            var folder = Path.GetDirectoryName(sheet).Replace('\\', '/');
            var baseName = Path.GetFileNameWithoutExtension(sheet);
            // Ready when every clip exists and already has the length the json asks for (an older clip is replaced a moment after the import).
            var missing = data.animations.Where(a =>
            {
                var c = AssetDatabase.LoadAssetAtPath<AnimationClip>(folder + "/" + baseName + "_" + a.name + ".anim");
                return c == null || !Near(c.length, a.holds.Sum() / a.fps, 0.002f);
            }).ToList();
            if (missing.Count > 0 && EditorApplication.timeSinceStartup - started < 60) return;
            // With no clips there is nothing to wait for, so give a late delayCall a few seconds to (wrongly) make one.
            if (data.animations.Length == 0 && EditorApplication.timeSinceStartup - started < 4) return;
            // -wait <seconds>: keep the editor open that long (the importer's Console warning comes a few seconds after the scripts load).
            var wait = Arg("-wait");
            if (wait != null && EditorApplication.timeSinceStartup - started < float.Parse(wait, System.Globalization.CultureInfo.InvariantCulture)) return;
            EditorApplication.update -= tick;
            Finish(sheet, data, report, missing.Count > 0);
        };
        EditorApplication.update += tick;
    }

    static bool done;

    static void Finish(string sheet, FramelingSheetImporter.SheetData data, string report, bool timedOut)
    {
        if (done) return;
        done = true;
        try
        {
            if (timedOut) { lines.Add("FAIL clips never appeared"); bad++; }
            var folder = Path.GetDirectoryName(sheet).Replace('\\', '/');
            var baseName = Path.GetFileNameWithoutExtension(sheet);
            var importer = AssetImporter.GetAtPath(sheet) as TextureImporter;
            Check(importer != null, "no texture importer for " + sheet);
            if (importer != null)
            {
                Check(importer.textureType == TextureImporterType.Sprite, "texture type is " + importer.textureType);
                Check(importer.spriteImportMode == SpriteImportMode.Multiple, "sprite mode is " + importer.spriteImportMode);
                Check(Near(importer.spritePixelsPerUnit, data.pixelsPerUnit), "pixels per unit " + importer.spritePixelsPerUnit + " != " + data.pixelsPerUnit);
                Check(importer.filterMode == (data.pixelArt ? FilterMode.Point : importer.filterMode), "filter mode is " + importer.filterMode);
                Check(!importer.mipmapEnabled, "mipmaps are on");
            }
#if FRAMELING_2D_SPRITE
            var cutWith = "package";
#else
            var cutWith = "older";
#endif
            lines.Add("cut with the " + cutWith + " API");
            var expect = Arg("-expect");
            if (expect != null) Check(expect == cutWith, "the importer cut with the " + cutWith + " API, wanted " + expect);
            if (data.animations.Length == 0)
            {
                var anims = AssetDatabase.FindAssets("t:AnimationClip", new[] { folder });
                Check(anims.Length == 0, anims.Length + " animation clips were made for a sheet with no animations");
                lines.Add("no animations, " + anims.Length + " clips made");
            }
            var sprites = AssetDatabase.LoadAllAssetsAtPath(sheet).OfType<Sprite>().ToDictionary(s => s.name, s => s);
            lines.Add("sprites " + sprites.Count + " of " + data.frames.Length);
            Check(sprites.Count == data.frames.Length, "sprite count " + sprites.Count + " != " + data.frames.Length);
            foreach (var f in data.frames)
            {
                if (!sprites.TryGetValue(f.name, out var s)) { Check(false, "no sprite " + f.name); continue; }
                Check(Near(s.rect.x, f.x) && Near(s.rect.y, f.y) && Near(s.rect.width, f.w) && Near(s.rect.height, f.h),
                    "rect of " + f.name + " is " + s.rect + ", wanted " + f.x + "," + f.y + "," + f.w + "," + f.h);
                var px = s.pivot.x / s.rect.width;
                var py = s.pivot.y / s.rect.height;
                Check(Near(px, f.pivotX, 0.002f) && Near(py, f.pivotY, 0.002f), "pivot of " + f.name + " is " + px + "," + py + ", wanted " + f.pivotX + "," + f.pivotY);
                Check(Near(s.pixelsPerUnit, data.pixelsPerUnit), "sprite ppu of " + f.name + " is " + s.pixelsPerUnit);
            }
            CheckIds(sheet, sprites);
            foreach (var a in data.animations)
            {
                var path = folder + "/" + baseName + "_" + a.name + ".anim";
                var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(path);
                if (clip == null) { Check(false, "no clip " + path); continue; }
                var keys = AnimationUtility.GetObjectReferenceCurve(clip, EditorCurveBinding.PPtrCurve("", typeof(SpriteRenderer), "m_Sprite"));
                var total = a.holds.Sum() / a.fps;
                lines.Add("clip " + a.name + " keys " + keys.Length + " length " + clip.length + " fps " + clip.frameRate + " loop " + clip.isLooping);
                var wantKeys = a.frames.Length + (a.holds[a.holds.Length - 1] > 1 ? 1 : 0);
                Check(keys.Length == wantKeys, "clip " + a.name + " has " + keys.Length + " keys, wanted " + wantKeys);
                Check(Near(clip.frameRate, a.fps), "clip " + a.name + " frame rate " + clip.frameRate + " != " + a.fps);
                Check(clip.isLooping == a.loop, "clip " + a.name + " loop " + clip.isLooping + " != " + a.loop);
                var wantWrap = a.loop ? WrapMode.Loop : WrapMode.ClampForever;
                Check(clip.wrapMode == wantWrap, "clip " + a.name + " wrap mode " + clip.wrapMode + " != " + wantWrap);
                Check(Near(clip.length, total, 0.002f), "clip " + a.name + " length " + clip.length + " != " + total);
                float t = 0;
                for (int i = 0; i < a.frames.Length && i < keys.Length; i++)
                {
                    Check(Near(keys[i].time, t, 0.002f), "clip " + a.name + " key " + i + " at " + keys[i].time + ", wanted " + t);
                    var sp = keys[i].value as Sprite;
                    Check(sp != null && sp.name == a.frames[i], "clip " + a.name + " key " + i + " shows " + (sp == null ? "nothing" : sp.name) + ", wanted " + a.frames[i]);
                    t += a.holds[i] / a.fps;
                }
                Playback(a, clip);
            }
        }
        catch (Exception e) { bad++; lines.Add("FAIL exception " + e); }
        lines.Add(bad == 0 ? "UNITY-OK" : "UNITY-FAILED " + bad);
        File.WriteAllLines(report, lines);
        EditorApplication.Exit(bad == 0 ? 0 : (timedOutExit(lines) ? 2 : 1));
    }

    static void CheckIds(string sheet, Dictionary<string, Sprite> sprites)
    {
        var file = Arg("-ids");
        if (file == null) return;
        var now = sprites.OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv =>
        {
            string guid; long id;
            AssetDatabase.TryGetGUIDAndLocalFileIdentifier(kv.Value, out guid, out id);
            return kv.Key + " " + id;
        }).ToArray();
        if (File.Exists(file))
        {
            var before = File.ReadAllLines(file);
            Check(before.SequenceEqual(now), "sprite ids changed after the re-import");
            lines.Add("ids kept: " + before.SequenceEqual(now));
        }
        else File.WriteAllLines(file, now);
    }

    // Plays the clip on a real Animator and looks at which sprite shows in the middle of every frame it should last.
    static void Playback(FramelingSheetImporter.AnimData a, AnimationClip clip)
    {
        var go = new GameObject("frameling-check");
        try
        {
            var sr = go.AddComponent<SpriteRenderer>();
            var animator = go.AddComponent<Animator>();
            PlayableGraph graph;
            AnimationPlayableUtilities.PlayClip(animator, clip, out graph);
            Func<float, string> at = time =>
            {
                graph.GetRootPlayable(0).SetTime(time);
                graph.Evaluate(0);
                return sr.sprite == null ? "nothing" : sr.sprite.name;
            };
            int tick = 0;
            for (int i = 0; i < a.frames.Length; i++)
                for (int h = 0; h < a.holds[i]; h++, tick++)
                {
                    var shown = at((tick + 0.5f) / a.fps);
                    Check(shown == a.frames[i], "clip " + a.name + " shows " + shown + " on tick " + tick + ", wanted " + a.frames[i]);
                }
            // After the end it loops back to the first frame, or stays on the last one.
            var after = at((tick + 0.5f) / a.fps);
            var expected = a.loop ? a.frames[0] : a.frames[a.frames.Length - 1];
            Check(after == expected, "clip " + a.name + " shows " + after + " after its end, wanted " + expected);
            graph.Destroy();
        }
        finally { UnityEngine.Object.DestroyImmediate(go); }
    }

    static bool timedOutExit(List<string> l) { return l.Contains("FAIL clips never appeared"); }
}
#endif
