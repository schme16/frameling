// Test-only editor script for test/export/slices-unity-e2e.test.ts (UNITY_BIN). Copied into a throwaway Unity project
// beside an exported sprite sheet and the importer script, and run with -executeMethod FramelingSliceCheck.Run.
// Arguments: -sheet <Assets/path/to/sheet.png>  -report <file>. It writes one line per sprite on the sheet:
//   SPRITE name x y w h pivotX pivotY borderL borderB borderR borderT     (pivot in pixels from the sprite's bottom left)
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
        foreach (var s in AssetDatabase.LoadAllAssetsAtPath(sheet).OfType<Sprite>().OrderBy(x => x.name))
        {
            var r = s.rect;
            var b = s.border;
            lines.Add(string.Join(" ", new[] { "SPRITE", s.name, F(r.x), F(r.y), F(r.width), F(r.height), F(s.pivot.x), F(s.pivot.y), F(b.x), F(b.y), F(b.z), F(b.w) }));
        }
        lines.Add("UNITY-DONE");
        File.WriteAllText(report, string.Join("\n", lines) + "\n");
        EditorApplication.Exit(0);
    }
}
#endif
