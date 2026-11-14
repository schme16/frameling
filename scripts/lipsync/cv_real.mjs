// Cross-validation on the real recordings: trains one model per fold WITHOUT that fold's sentences (a sentence's normal,
// faster and whispered readings always stay together), then scores every clip with the model that never heard it.
//   node scripts/lipsync/cv_real.mjs <synthetic_refs> <real_dir> <work_dir> [--folds 5] [train.mjs options...]
// Everything after the folds option is handed to train.mjs (e.g. --init src/lipsync/model.ts --hidden 128 --epochs 6 --real-weight 3).
// Prints the eval_real table; per-shape numbers with --shapes. <work_dir> keeps m0.ts... and folds.json.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [refs, real, work, ...rest] = process.argv.slice(2);
const take = (name, d) => { const i = rest.indexOf(name); if (i < 0) return d; const v = rest[i + 1]; rest.splice(i, 2); return v; };
const nFolds = Number(take('--folds', 5));
const shapes = rest.includes('--shapes') ? (rest.splice(rest.indexOf('--shapes'), 1), true) : false;
const text = rest.includes('--text') ? (rest.splice(rest.indexOf('--text'), 1), true) : false;
mkdirSync(resolve(work), { recursive: true });
const kinds = JSON.parse(readFileSync(join(resolve(real), 'kinds.json'), 'utf8'));
const sentences = [...new Set(kinds.map((k) => k.text))];
const folds = {};
sentences.forEach((t, si) => {
  const f = si % nFolds;
  (folds[f] ??= []).push(...kinds.filter((k) => k.text === t).map((k) => k.i));
});
writeFileSync(join(resolve(work), 'folds.json'), JSON.stringify(folds));
for (const [f, ids] of Object.entries(folds)) {
  const r = spawnSync('node', ['scripts/lipsync/train.mjs', refs, '--real', real, '--hold', ids.join(','), '--out', join(resolve(work), `m${f}.ts`), ...rest], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout); process.exit(1); }
  console.log(`fold ${f}: held out clips ${ids.join(',')}  ${r.stdout.trim().split('\n').filter((l) => l.startsWith('epoch')).pop()}`);
}
const ev = spawnSync('node', ['scripts/lipsync/eval_real.mjs', real, '--cv', work, ...(shapes ? ['--shapes'] : []), ...(text ? ['--text'] : []), '--json', join(resolve(work), 'result.json')], { stdio: 'inherit' });
process.exit(ev.status ?? 1);
