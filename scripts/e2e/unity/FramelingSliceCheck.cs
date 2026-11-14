// Test-only editor script for test/export/slices-unity-e2e.test.ts (UNITY_BIN). Copied into a throwaway Unity project
// beside an exported sprite sheet and the importer script, and run with -executeMethod FramelingSliceCheck.Run.
// Arguments: -sheet <Assets/path/to/sheet.png>  -report <file>. It writes one line per sprite on the sheet:
//   SPRITE name x y w h pivotX pivotY borderL borderB borderR borderT     (pivot in pixels from the sprite's bottom left)
//   COLOR name rrggbb                                                      (the sheet's colour at the middle of the sprite)
//   CLIP name frameRate time=sprite,time=sprite,...                        (the clips the importer made next to the sheet)
// and UNITY-DONE at the end. The importer cuts the sheet while the picture is imported, so the sprites are there by then.
#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

public static class FramelingSliceCheck
{
    static string Arg(string name)
    {
        var a = Environment.GetCommandLineArgs();
        for (int i = 0; i < a.Length - 1; i++) if (a[i] == name) return a[i + 1];
        return null;
    }

    static string F(float v) { return v.ToString("0.###", CultureInfo.InvariantCulture); }

    public static void Run()
    {
        var sheet = Arg("-sheet");
        var report = Arg("-report");
        var lines = new List<string>();
        AssetDatabase.ImportAsset(sheet, ImportAssetOptions.ForceUpdate);
        var tex = new Texture2D(2, 2);
        ImageConversion.LoadImage(tex, File.ReadAllBytes(sheet));
        foreach (var s in AssetDatabase.LoadAllAssetsAtPath(sheet).OfType<Sprite>().OrderBy(x => x.name))
        {
            var r = s.rect;
            var b = s.border;
            lines.Add(string.Join(" ", new[] { "SPRITE", s.name, F(r.x), F(r.y), F(r.width), F(r.height), F(s.pivot.x), F(s.pivot.y), F(b.x), F(b.y), F(b.z), F(b.w) }));
            var c = (Color32)tex.GetPixel((int)(r.x + r.width / 2), (int)(r.y + r.height / 2));
            lines.Add("COLOR " + s.name + " " + c.r.ToString("x2") + c.g.ToString("x2") + c.b.ToString("x2"));
        }
        // The importer makes its clips once the import is over, so look for them on the next turn (after its own).
        EditorApplication.delayCall += () =>
        {
            var folder = Path.GetDirectoryName(sheet).Replace('\\', '/');
            foreach (var guid in AssetDatabase.FindAssets("t:AnimationClip", new[] { folder }))
            {
                var p = AssetDatabase.GUIDToAssetPath(guid);
                var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(p);
                foreach (var bind in AnimationUtility.GetObjectReferenceCurveBindings(clip))
                {
                    var keys = AnimationUtility.GetObjectReferenceCurve(clip, bind);
                    lines.Add("CLIP " + Path.GetFileNameWithoutExtension(p) + " " + F(clip.frameRate) + " " + string.Join(",", keys.Select(k => F(k.time) + "=" + ((Sprite)k.value).name)));
                }
            }
            lines.Add("UNITY-DONE");
            File.WriteAllText(report, string.Join("\n", lines) + "\n");
            EditorApplication.Exit(0);
        };
    }
}
#endif
