// Prints what the importer makes of each look's files, as JSON, for the captions: node _describe.cjs <bundled importer.cjs>
const fs = require('node:fs');
const path = require('node:path');
const { readBrushFile } = require(process.argv[2]);
const { GIMP, PHOTOSHOP } = require('./_rows.cjs');
const out = {};
for (const [k, list] of Object.entries({ gimp: GIMP, photoshop: PHOTOSHOP })) {
  out[k] = list.map((r) => {
    const res = readBrushFile(new Uint8Array(fs.readFileSync(r.file)), path.basename(r.file));
    if (!res.ok) return { label: r.label, error: res.error };
    const b = res.brushes[r.index ?? 0];
    const d = b.dab;
    const s = [`${d.tip}${d.picture ? ` ${d.picture.w}x${d.picture.h}${d.picture.soft ? ' soft' : ''}` : ''}`, `size ${d.size}`, `spacing ${Math.round(d.spacing * 100)}%`];
    if (d.hardness < 1 && d.tip !== 'picture') s.push(`hardness ${Math.round(d.hardness * 100)}%`);
    if (d.angle) s.push(`angle ${d.angle}`);
    if (d.roundness < 1) s.push(`roundness ${Math.round(d.roundness * 100)}%`);
    if (d.scatter) s.push(`scatter ${Math.round(d.scatter * 100)}%`);
    if (d.sizeJitter) s.push(`size jitter ${Math.round(d.sizeJitter * 100)}%`);
    for (const r2 of d.dynamics) s.push(`${r2.from} to ${r2.to}`);
    if (d.grain) s.push('paper grain');
    if (d.dual) s.push('dots');
    return { label: r.label, name: b.name, settings: s.join(', '), left: b.dropped.length, changed: b.changed.length };
  });
}
console.log(JSON.stringify(out, null, 1));
