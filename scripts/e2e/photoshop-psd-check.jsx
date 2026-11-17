// Runs inside Adobe Photoshop (ExtendScript). scripts/e2e/photoshop-psd.cjs puts `var LIST = "...";` in front of this
// file: a text file with one PSD path a line. For each it writes <psd>.ps.png (Photoshop's own flatten of the layers)
// and <psd>.ps.json (the layer tree as Photoshop reads it), and closes it without saving. Only the documents it opened
// are ever closed. Plain ES3.
#target photoshop
app.displayDialogs = DialogModes.NO;
var oldUnits = app.preferences.rulerUnits;
app.preferences.rulerUnits = Units.PIXELS;
var out = File(LIST + '.result.txt');
out.encoding = 'UTF-8';
out.open('w');

function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n'); }
function blendName(b) { try { return String(b).replace('BlendMode.', ''); } catch (e) { return '?'; } }

function hasLayerMask(layer) {
  app.activeDocument.activeLayer = layer;
  var r = new ActionReference();
  r.putEnumerated(charIDToTypeID('Lyr '), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
  var d = executeActionGet(r);
  return d.hasKey(stringIDToTypeID('hasUserMask')) ? d.getBoolean(stringIDToTypeID('hasUserMask')) : false;
}
function hasVectorMask(layer) {
  var r = new ActionReference();
  r.putEnumerated(charIDToTypeID('Lyr '), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
  var d = executeActionGet(r);
  return d.hasKey(stringIDToTypeID('hasVectorMask')) ? d.getBoolean(stringIDToTypeID('hasVectorMask')) : false;
}
function fxOn(layer) {
  var r = new ActionReference();
  r.putEnumerated(charIDToTypeID('Lyr '), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
  var d = executeActionGet(r);
  if (!d.hasKey(stringIDToTypeID('layerEffects'))) return '';
  var fx = d.getObjectValue(stringIDToTypeID('layerEffects')), names = [];
  for (var i = 0; i < fx.count; i++) names.push(typeIDToStringID(fx.getKey(i)));
  return names.join(',');
}

var VIS = {};
function vis(layers) { for (var i = 0; i < layers.length; i++) { VIS[layers[i].id] = layers[i].visible; if (layers[i].typename == 'LayerSet') vis(layers[i].layers); } }
function walk(layers, depth) {
  var parts = [];
  for (var i = 0; i < layers.length; i++) {
    var L = layers[i], o = [];
    o.push('"name":"' + esc(L.name) + '"');
    o.push('"type":"' + (L.typename == 'LayerSet' ? 'group' : String(L.kind).replace('LayerKind.', '')) + '"');
    o.push('"visible":' + VIS[L.id]);
    o.push('"opacity":' + Math.round(L.opacity));
    o.push('"blend":"' + blendName(L.blendMode) + '"');
    try { o.push('"bounds":[' + [L.bounds[0].as('px'), L.bounds[1].as('px'), L.bounds[2].as('px'), L.bounds[3].as('px')].join(',') + ']'); } catch (e) {}
    try { o.push('"userMask":' + hasLayerMask(L)); o.push('"vectorMask":' + hasVectorMask(L)); o.push('"fx":"' + fxOn(L) + '"'); } catch (e) { o.push('"maskErr":"' + esc(e) + '"'); }
    if (L.typename == 'ArtLayer') {
      try { o.push('"clipped":' + L.grouped); } catch (e) {}
      if (L.kind == LayerKind.TEXT) {
        try {
          var t = L.textItem;
          o.push('"text":"' + esc(t.contents) + '"');
          try { o.push('"font":"' + esc(t.font) + '"'); } catch (e) { o.push('"font":"?"'); }
          try { o.push('"size":' + t.size.as('px')); } catch (e) {}
          try { o.push('"color":"' + t.color.rgb.hexValue + '"'); } catch (e) {}
        } catch (e) { o.push('"textErr":"' + esc(e) + '"'); }
      }
    }
    if (L.typename == 'LayerSet') o.push('"children":[' + walk(L.layers, depth + 1) + ']');
    parts.push('{' + o.join(',') + '}');
  }
  return parts.join(',');
}

var list = File(LIST);
list.encoding = 'UTF-8';
list.open('r');
while (!list.eof) {
  var p = list.readln();
  if (!p) continue;
  var f = File(p);
  var doc = null, dup = null;
  try {
    doc = app.open(f);
    // Flatten first: the layer walk below selects layers, and selecting a hidden layer from a script shows it.
    dup = doc.duplicate('flat', false);
    if (dup.layers.length > 1 || dup.layers[0].typename == 'LayerSet') { try { dup.mergeVisibleLayers(); } catch (e) {} }
    var png = new PNGSaveOptions();
    png.compression = 0;
    dup.saveAs(File(p + '.ps.png'), png, true, Extension.LOWERCASE);
    dup.close(SaveOptions.DONOTSAVECHANGES);
    dup = null;
    app.activeDocument = doc;
    var json = '{"file":"' + esc(p) + '","width":' + doc.width.as('px') + ',"height":' + doc.height.as('px') + ',"mode":"' + doc.mode + '","bits":"' + doc.bitsPerChannel + '","layers":[' + (vis(doc.layers), walk(doc.layers, 0)) + ']}';
    var j = File(p + '.ps.json');
    j.encoding = 'UTF-8';
    j.open('w'); j.write(json); j.close();
    doc.close(SaveOptions.DONOTSAVECHANGES);
    out.writeln('ok ' + p);
  } catch (e) {
    out.writeln('FAIL ' + p + ' : ' + e + ' line ' + e.line);
    try { if (dup) dup.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
    try { if (doc) doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e3) {}
  }
}
list.close();
out.close();
app.preferences.rulerUnits = oldUnits;
'done';
