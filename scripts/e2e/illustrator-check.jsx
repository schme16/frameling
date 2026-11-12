// Runs inside Adobe Illustrator (ExtendScript). scripts/e2e/illustrator.cjs puts a line `var MANIFEST = "...";` in front
// of this file. For each file in the manifest it opens the page asked for, writes down what Illustrator found (artboards,
// layers, item counts, fills, strokes), exports a PNG, closes the file, and finally writes MANIFEST.result.json and quits.
// ExtendScript is old JavaScript (no JSON, no let/const), so this is plain ES3.
app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

function readText(path) {
  var f = new File(path);
  f.encoding = 'UTF-8';
  f.open('r');
  var s = f.read();
  f.close();
  return s;
}
function writeText(path, text) {
  var f = new File(path);
  f.encoding = 'UTF-8';
  f.open('w');
  f.write(text);
  f.close();
}
function q(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
}
function toJson(v) {
  if (v === null || v === undefined) return 'null';
  var t = typeof v;
  if (t === 'number') return isFinite(v) ? String(Math.round(v * 1000) / 1000) : 'null';
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'string') return q(v);
  if (v instanceof Array) {
    var a = [];
    for (var i = 0; i < v.length; i++) a.push(toJson(v[i]));
    return '[' + a.join(',') + ']';
  }
  var o = [];
  for (var k in v) if (v.hasOwnProperty(k)) o.push(q(k) + ':' + toJson(v[k]));
  return '{' + o.join(',') + '}';
}

function colorKind(c) {
  try {
    return c.typename;
  } catch (e) {
    return 'none';
  }
}

function layerInfo(l, depth) {
  var info = { name: l.name, visible: l.visible, opacity: l.opacity, paths: l.pathItems.length, groups: l.groupItems.length, texts: l.textFrames.length, rasters: l.rasterItems.length, compound: l.compoundPathItems.length, symbols: l.symbolItems.length, sub: [] };
  for (var i = 0; i < l.layers.length; i++) info.sub.push(layerInfo(l.layers[i], depth + 1));
  return info;
}

// The group tree below a layer: names, how many items, whether it clips (what Illustrator makes of marked content).
function groupTree(g, depth) {
  var info = { name: g.name, items: g.pageItems.length, clipped: g.clipped, opacity: g.opacity, blend: String(g.blendingMode), sub: [] };
  if (depth < 4)
    for (var i = 0; i < g.groupItems.length; i++) info.sub.push(groupTree(g.groupItems[i], depth + 1));
  return info;
}

function inspect(doc) {
  var r = { name: doc.name, artboards: [], layers: [], counts: {}, fills: {}, strokes: [], blends: {}, opacities: [] };
  for (var i = 0; i < doc.artboards.length; i++) {
    var b = doc.artboards[i].artboardRect; // left, top, right, bottom (y up, so top > bottom)
    r.artboards.push({ name: doc.artboards[i].name, w: b[2] - b[0], h: b[1] - b[3] });
  }
  for (var j = 0; j < doc.layers.length; j++) r.layers.push(layerInfo(doc.layers[j], 0));
  r.groups = [];
  for (var g = 0; g < doc.layers.length; g++)
    for (var h = 0; h < doc.layers[g].groupItems.length; h++) r.groups.push(groupTree(doc.layers[g].groupItems[h], 0));
  r.counts = {
    paths: doc.pathItems.length,
    compound: doc.compoundPathItems.length,
    groups: doc.groupItems.length,
    texts: doc.textFrames.length,
    rasters: doc.rasterItems.length,
    symbols: doc.symbolItems.length,
    meshes: doc.meshItems.length,
    clipping: 0,
  };
  var fills = r.fills;
  for (var p = 0; p < doc.pathItems.length; p++) {
    var it = doc.pathItems[p];
    if (it.clipping) r.counts.clipping++;
    var fk = it.filled ? colorKind(it.fillColor) : 'unfilled';
    fills[fk] = (fills[fk] || 0) + 1;
    if (it.stroked && r.strokes.length < 40) r.strokes.push({ w: it.strokeWidth, cap: String(it.strokeCap), join: String(it.strokeJoin), kind: colorKind(it.strokeColor) });
    if (it.opacity < 100 && r.opacities.length < 40) r.opacities.push(it.opacity);
    var bm = String(it.blendingMode);
    if (it.blendingMode != BlendModes.NORMAL) r.blends[bm] = (r.blends[bm] || 0) + 1;
  }
  return r;
}

var manifest = eval('(' + readText(MANIFEST) + ')');
var results = [];
// The PDF import preferences are Illustrator's own settings: set them for the run and put them back after.
var po = app.preferences.PDFFileOptions;
var oldPage = po.pageToOpen;
var oldBox = po.pDFCropToBox;
for (var n = 0; n < manifest.files.length; n++) {
  var entry = manifest.files[n];
  var res = { id: entry.id, file: entry.file, page: entry.page, ok: false };
  try {
    po.pageToOpen = entry.page;
    po.pDFCropToBox = PDFBoxType.PDFMEDIABOX;
    var doc = app.open(new File(entry.file), DocumentColorSpace.RGB);
    res.found = inspect(doc);
    var png = new ExportOptionsPNG24();
    png.antiAliasing = true;
    png.artBoardClipping = true;
    png.transparency = !!entry.transparent;
    png.horizontalScale = 100;
    png.verticalScale = 100;
    doc.exportFile(new File(entry.png), ExportType.PNG24, png);
    doc.close(SaveOptions.DONOTSAVECHANGES);
    res.ok = true;
  } catch (e) {
    res.error = String(e) + (e && e.line ? ' (line ' + e.line + ')' : '');
    try {
      while (app.documents.length) app.documents[0].close(SaveOptions.DONOTSAVECHANGES);
    } catch (e2) {}
  }
  results.push(res);
}
po.pageToOpen = oldPage;
po.pDFCropToBox = oldBox;
writeText(MANIFEST + '.result.json', toJson({ version: app.version, results: results }));
writeText(MANIFEST + '.done', 'done');
app.quit();
