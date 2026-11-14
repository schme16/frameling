// @vitest-environment jsdom
// The app's words (src/words/*.json, beside Quill's lines): every word is used, every id the code asks for exists,
// placeholders match, the files keep their tidy shape, and an edit merges back in through words:apply. Like
// test/ui/quill-lines.test.ts, for everything that is not Quill's.
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../src/renderer/features';
// Registered when their part loads, so the test loads them.
import '../../src/artboards/export';
import '../../src/export/choices';
import { allChoices, getChoiceDef, registerChoice } from '../../src/core/choices';
import { interactivesChoices } from '../../src/interactives/roundtrip';
import { QUEST_CATALOG } from '../../src/quests/catalog';
import { QUESTS } from '../../src/quests/library';
import choiceData from '../../src/words/choices.json';
import questData from '../../src/words/quests.json';
import { choiceWord, choiceWordIds } from '../../src/words/choices';
import { fill, placeholders } from '../../src/words/fill';
import { inlineWords, leanJson } from '../../scripts/words/vite-plugin';
import { questWord, questWordIds } from '../../src/words/quests';
// @ts-expect-error plain JS helper
import { applyToGroups, checkGroups, formatLines, readGroups } from '../../scripts/words/words-tools.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORDS_DIR = path.join(root, 'src/words');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? sources(p) : /\.tsx?$/.test(d.name) ? [p] : [];
  });
}
const code = sources(path.join(root, 'src')).map((f) => fs.readFileSync(f, 'utf8'));

/** The ids in every `fn('id')` call across src. */
function usedIds(fn: string): Set<string> {
  const ids = new Set<string>();
  for (const src of code) for (const m of src.matchAll(new RegExp(`\\b${fn}\\(\\s*'([^']+)'`, 'g'))) ids.add(m[1]);
  return ids;
}

const first = (data: object, suffix: string) => Object.keys(data).find((k) => k.endsWith(suffix))!;

const groups = [
  { fn: 'choiceWord', file: 'choices', ids: choiceWordIds() as string[] },
  { fn: 'questWord', file: 'quests', ids: questWordIds() as string[] },
];

describe("the app's words", () => {
  for (const g of groups) {
    describe(`${g.file}.json`, () => {
      it('has every id the code asks for', () => {
        const have = new Set(g.ids);
        expect([...usedIds(g.fn)].filter((id) => !have.has(id))).toEqual([]);
      });

      it('has no word the code does not use', () => {
        const used = usedIds(g.fn);
        expect(g.ids.filter((id) => !used.has(id))).toEqual([]);
      });

      it('keeps every id in its own area (prefixed with the area)', () => {
        const prefix = g.file === 'choices' ? 'choice.' : 'quest.';
        expect(g.ids.filter((id) => !id.startsWith(prefix))).toEqual([]);
      });
    });
  }

  it('has sound entries: text, a where, the {placeholders} listed, and no id in two files', () => {
    expect(checkGroups(readGroups(WORDS_DIR))).toEqual([]);
  });

  it('has no em dashes (or en dashes) in anything people read', () => {
    const bad: string[] = [];
    for (const g of readGroups(WORDS_DIR) as { name: string; words: Record<string, { text: string }> }[]) for (const [id, e] of Object.entries(g.words)) if (!id.startsWith('$') && /[–—]/.test(e.text)) bad.push(id);
    expect(bad).toEqual([]);
  });

  it('is written in the tidy shape on disk, so a diff shows only the words that changed', () => {
    for (const g of readGroups(WORDS_DIR) as { file: string; words: object }[]) expect(fs.readFileSync(g.file, 'utf8')).toBe(formatLines(g.words));
  });
});

describe('the choices say what their words file says', () => {
  // A switchable feature registers its choices only while it is on, so put them in for the check.
  for (const c of interactivesChoices) if (!getChoiceDef(c.id)) registerChoice(c);
  const asked = allChoices();
  const byId = new Map(asked.map((c) => [c.id, c]));

  it('has a registered choice for every choice in the file, and its name, question and answers are the file\'s', () => {
    const found = new Set<string>();
    for (const c of asked) {
      const t = `choice.${c.id}.title`;
      if (!(t in choiceData)) continue;
      found.add(c.id);
      expect(c.title).toBe(choiceWord(t as never));
      if (`choice.${c.id}.question` in choiceData) expect(c.question).toBe(choiceWord(`choice.${c.id}.question` as never));
      // A choice whose answers are built in code (the nudges) keeps those answers there.
      for (const o of c.options) {
        const key = `choice.${c.id}.${o.value}`;
        if (!(`${key}.label` in choiceData)) continue;
        expect(o.label).toBe(choiceWord(`${key}.label` as never));
        if (o.detail) expect(o.detail).toBe(choiceWord(`${key}.detail` as never));
        if (o.did) expect(o.did).toBe(choiceWord(`${key}.did` as never));
      }
    }
    const titled = choiceWordIds().filter((k) => k.endsWith('.title'));
    const missing = titled.map((k) => k.slice('choice.'.length, -'.title'.length)).filter((id) => !byId.has(id));
    expect(missing).toEqual([]);
    expect(found.size).toBe(titled.length);
  });
});

describe('what is still in code', () => {
  // Choices whose words are built from a value in code (the screen size, the nudge answers), so they are not in the file yet.
  // Take an id off this list when its words move.
  const STILL_IN_CODE = ['screen.fit', 'screen.size'];
  it('is only the choices that build their words in code', () => {
    const left = allChoices().filter((c) => !(`choice.${c.id}.title` in choiceData)).map((c) => c.id);
    expect(left.filter((id) => !STILL_IN_CODE.includes(id))).toEqual([]);
  });
});

describe('the quests say what their words file says', () => {
  it("gives every quest its name, summary and badge from the file, in the catalog and in the library", () => {
    for (const q of QUESTS) {
      expect(q.title).toBe(questWord(`quest.${q.id}.title` as never));
      expect(q.summary).toBe(questWord(`quest.${q.id}.summary` as never));
      if (q.badge) expect(q.badge.name).toBe(questWord(`quest.${q.id}.badge` as never));
      for (const s of q.steps) expect(s.say).toBe(questWord(`quest.${q.id}.${s.id}.say` as never));
    }
    for (const q of QUEST_CATALOG) expect(q.title).toBe(questWord(`quest.${q.id}.title` as never));
  });

  it('has no word for a quest or step that does not exist', () => {
    const real = new Set(QUESTS.flatMap((q) => [`quest.${q.id}.title`, `quest.${q.id}.summary`, `quest.${q.id}.badge`, `quest.${q.id}.finish`, ...q.steps.flatMap((s) => ['say', 'why', 'hint', 'did'].map((k) => `quest.${q.id}.${s.id}.${k}`))]));
    expect((questWordIds() as string[]).filter((id) => !real.has(id))).toEqual([]);
    expect(Object.keys(questData).length).toBeGreaterThan(100);
  });
});

describe('placeholders', () => {
  it('are filled by name and left as written when not given', () => {
    expect(fill('Hello {name}, {n} left', { name: 'Sam' })).toBe('Hello Sam, {n} left');
    expect(placeholders(['a {x} b', 'c {y} {x}'])).toEqual(['x', 'y']);
  });
});

describe('words:apply', () => {
  const copy = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'words-'));
    for (const f of fs.readdirSync(WORDS_DIR)) fs.copyFileSync(path.join(WORDS_DIR, f), path.join(dir, f));
    return dir;
  };
  const run = (dir: string, changes: object, ...flags: string[]) => {
    const file = path.join(dir, 'changes.txt');
    fs.writeFileSync(file, JSON.stringify(changes));
    try {
      const out = execFileSync('node', [path.join(root, 'scripts/words/apply.mjs'), file, ...flags], { env: { ...process.env, WORDS_DIR: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status: number; stderr: string };
      return { code: err.status, out: err.stderr };
    }
  };
  it('merges an edit into whichever file holds the word, in the tidy shape', () => {
    const dir = copy();
    const choiceId = first(choiceData, '.title');
    const questId = first(questData, '.summary');
    const res = run(dir, { [choiceId]: 'A new name', [questId]: 'A new summary' });
    expect(res.code).toBe(0);
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'choices.json'), 'utf8'));
    const q = JSON.parse(fs.readFileSync(path.join(dir, 'quests.json'), 'utf8'));
    expect(c[choiceId].text).toBe('A new name');
    expect(q[questId].text).toBe('A new summary');
    for (const g of readGroups(dir) as { file: string; words: object }[]) expect(fs.readFileSync(g.file, 'utf8')).toBe(formatLines(g.words));
  });

  it('writes nothing with --check', () => {
    const dir = copy();
    const before = fs.readFileSync(path.join(dir, 'choices.json'), 'utf8');
    const res = run(dir, { [first(choiceData, '.title')]: 'Changed' }, '--check');
    expect(res.code).toBe(0);
    expect(res.out).toContain('would change');
    expect(fs.readFileSync(path.join(dir, 'choices.json'), 'utf8')).toBe(before);
  });

  it('refuses the whole file, and writes nothing, when a word gains a placeholder', () => {
    const dir = copy();
    const before = fs.readFileSync(path.join(dir, 'choices.json'), 'utf8');
    const res = run(dir, { [first(choiceData, '.title')]: 'Fine', [first(choiceData, '.question')]: 'Now with {surprise}' });
    expect(res.code).toBe(1);
    expect(res.out).toContain('placeholders');
    expect(fs.readFileSync(path.join(dir, 'choices.json'), 'utf8')).toBe(before);
  });

  it('refuses a word that lost a placeholder', () => {
    const dir = copy();
    const file = path.join(dir, 'quests.json');
    const words = JSON.parse(fs.readFileSync(file, 'utf8'));
    const id = first(words, '.say');
    words[id] = { ...words[id], text: 'Press {key} to go', vars: ['key'] };
    fs.writeFileSync(file, formatLines(words));
    const res = run(dir, { [id]: 'Press the key to go' });
    expect(res.code).toBe(1);
    expect(res.out).toContain('{key}');
  });

  it('refuses an id that does not exist, and a list where one line belongs', () => {
    const dir = copy();
    expect(run(dir, { 'choice.nothing.title': 'x' }).code).toBe(1);
    expect(run(dir, { [first(choiceData, '.title')]: ['a', 'b'] }).code).toBe(1);
  });

  it('refuses an id that is in two files', () => {
    const dir = copy();
    const file = path.join(dir, 'quests.json');
    const words = JSON.parse(fs.readFileSync(file, 'utf8'));
    words[first(choiceData, '.title')] = { text: 'Twice', where: 'Nowhere' };
    fs.writeFileSync(file, formatLines(words));
    expect(checkGroups(readGroups(dir)).join('\n')).toContain('in both');
  });
});

describe('the pure merge', () => {
  it('leaves its input alone and reports what changed with its file', () => {
    const groups = readGroups(WORDS_DIR) as { name: string; words: Record<string, { text: string }> }[];
    const id = first(choiceData, '.title');
    const before = groups.find((g) => g.name === 'choices')!.words[id].text;
    const res = applyToGroups(groups, { [id]: 'Something else' });
    expect(res.errors).toEqual([]);
    expect(res.changed).toEqual([{ id, from: before, to: 'Something else', group: 'choices' }]);
    expect(groups.find((g) => g.name === 'choices')!.words[id].text).toBe(before);
  });
});

describe('the build keeps the bundle lean', () => {
  const id = Object.keys(choiceData).find((k) => k.endsWith('.title'))!;
  const text = (choiceData as unknown as Record<string, { text: string }>)[id].text;

  it('swaps a plain call for its words, quoted safely', () => {
    expect(inlineWords(`const t = choiceWord('${id}');`)).toBe(`const t = ${JSON.stringify(text)};`);
  });

  it('leaves a call that fills placeholders, builds its id, or names an id that is not there', () => {
    for (const src of [`choiceWord('${id}', { n: 1 })`, 'choiceWord(`choice.${x}.title`)', "choiceWord('choice.nothing.title')", 'choiceWord(id)']) expect(inlineWords(src)).toBe(src);
  });

  it('swaps every call in src for the same words the app reads at run time', () => {
    for (const fn of ['choiceWord', 'questWord'] as const) {
      const read = fn === 'choiceWord' ? choiceWord : questWord;
      for (const used of usedIds(fn)) expect(inlineWords(`${fn}('${used}')`)).toBe(JSON.stringify((read as (i: string) => string)(used)));
    }
  });

  it('drops the where, the vars and the note from a file that stays in the bundle', () => {
    const lean = JSON.parse(leanJson(JSON.stringify({ $about: 'note', a: { text: 'Hi {n}', where: 'Somewhere', vars: ['n'] } })));
    expect(lean).toEqual({ a: { text: 'Hi {n}' } });
  });
});
