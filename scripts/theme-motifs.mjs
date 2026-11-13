// Makes the scattered surround patterns in src/canvas/canvas.css (seeds, camo shards, paw prints) as SVG mask tiles.
//   node scripts/theme-motifs.mjs <seeds-a|seeds-b|camo-a|camo-b|paws> <seed>   prints a CSS url(...)
// The seeds used are next to each url in canvas.css. Same seed, same tile.
// Generates scattered motif tiles as SVG data URIs (deterministic). Seamless: shapes near an edge are drawn again on the other side.
let s = Number(process.argv[3] || 7);
const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const r1 = (n) => Math.round(n * 10) / 10;
function scatter(w, h, n, minD, draw) {
  const pts = [];
  let tries = 0;
  while (pts.length < n && tries++ < 5000) {
    const p = { x: rnd() * w, y: rnd() * h, a: rnd() * 360, k: 0.8 + rnd() * 0.45 };
    const ok = pts.every((q) => { const dx = Math.min(Math.abs(p.x - q.x), w - Math.abs(p.x - q.x)); const dy = Math.min(Math.abs(p.y - q.y), h - Math.abs(p.y - q.y)); return Math.hypot(dx, dy) >= minD; });
    if (ok) pts.push(p);
  }
  let out = '';
  for (const p of pts) for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
    const x = p.x + ox, y = p.y + oy;
    if (x < -30 || y < -30 || x > w + 30 || y > h + 30) continue;
    out += `<g transform='translate(${r1(x)} ${r1(y)}) rotate(${Math.round(p.a)}) scale(${r1(p.k * 100) / 100})'>${draw(p)}</g>`;
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${out}</svg>`;
}
const seed = () => `<path d='M0-3.6C1.9-1.6 2.1 1.6 0 3.2C-2.1 1.6-1.9-1.6 0-3.6Z'/>`;
const shard = () => {
  const n = 3 + Math.floor(rnd() * 3), r = 5 + rnd() * 9;
  let d = '';
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rnd() * 0.9; const rr = r * (0.45 + rnd() * 0.75); d += `${i ? 'L' : 'M'}${r1(Math.cos(a) * rr * 1.7)} ${r1(Math.sin(a) * rr * 0.7)}`; }
  return `<path d='${d}Z'/>`;
};
const paw = () => `<ellipse cx='0' cy='3' rx='5.2' ry='4.3'/><ellipse cx='-6' cy='-3' rx='2' ry='2.6'/><ellipse cx='-2.2' cy='-6.6' rx='2' ry='2.7'/><ellipse cx='2.2' cy='-6.6' rx='2' ry='2.7'/><ellipse cx='6' cy='-3' rx='2' ry='2.6'/>`;
const kinds = {
  'seeds-a': () => scatter(230, 190, 16, 34, seed),
  'seeds-b': () => scatter(170, 250, 9, 44, seed),
  'camo-a': () => scatter(250, 210, 14, 40, shard),
  'camo-b': () => scatter(190, 280, 11, 44, shard),
  paws: () => scatter(260, 220, 5, 85, paw),
};
const svg = kinds[process.argv[2]]();
process.stdout.write(`url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23')}")`);
