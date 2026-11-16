// @vitest-environment jsdom
// There is one Quill, so there is only ever one on screen. This file is what keeps that true: it fails if two places
// hold a claim on him at once, if his house stops being the lowest claim, or if a new place draws him without asking.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Quill, QuillEmpty, QuillSays } from '../../src/ui/mascot';
import { claimQuill, claimsNow, holder, PRIORITY, resetClaims, SURFACES } from '../../src/ui/mascot/claims';
import { playerCount, setQuillSheet } from '../../src/ui/mascot/runtime';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { clearToasts, toast } from '../../src/ui/toast';
import { ToastView } from '../../src/ui/ToastView';
import { QuillPetPanel } from '../../src/quillpet/QuillPetPanel';
import { FRESH_PET } from '../../src/quillpet/model';
import { setPet } from '../../src/quillpet/store';
import { FAKE_SHEET } from '../fixtures/quill-sheet';
import { relative, sourceFiles } from '../helpers/files';
import '../../src/renderer/features';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The one rule. Called after every step below, so a second Quill on screen fails the step that put it there. */
function expectOneOfHim(host: HTMLElement): void {
  expect(host.querySelectorAll('.quill').length).toBeLessThanOrEqual(1);
  expect(playerCount()).toBeLessThanOrEqual(1);
}

describe('the authority', () => {
  afterEach(resetClaims);

  it('has one place per rank, with his house lowest and the hello highest', () => {
    expect(new Set(Object.values(PRIORITY)).size).toBe(SURFACES.length);
    expect(SURFACES[0]).toBe('house');
    expect(PRIORITY.house).toBe(Math.min(...Object.values(PRIORITY)));
    expect(SURFACES[SURFACES.length - 1]).toBe('hello');
    for (const s of ['toast', 'quest', 'check', 'onboarding', 'hello'] as const) expect(PRIORITY[s]).toBeGreaterThan(PRIORITY.house);
  });

  it('gives him to the highest claim, and back to the house when it lets go', () => {
    const house = claimQuill('house');
    expect(holder.get()).toBe('house');
    const toastClaim = claimQuill('toast', '7');
    expect(holder.get()).toBe('toast:7');
    const quest = claimQuill('quest');
    expect(holder.get()).toBe('toast:7');
    toastClaim();
    expect(holder.get()).toBe('quest');
    quest();
    expect(holder.get()).toBe('house');
    house();
    expect(holder.get()).toBeNull();
  });

  it('never names more than one holder: of two at the same rank, the one that asked first keeps him', () => {
    claimQuill('toast', 'a');
    claimQuill('toast', 'b');
    expect(holder.get()).toBe('toast:a');
    expect(claimsNow()).toEqual(['toast:a', 'toast:b']);
  });

  it('counts a place and the Quill drawn inside it as one claim', () => {
    const outer = claimQuill('hello');
    const inner = claimQuill('hello');
    expect(claimsNow()).toEqual(['hello']);
    outer();
    expect(holder.get()).toBe('hello');
    inner();
    expect(holder.get()).toBeNull();
    // Letting go twice does nothing the second time.
    inner();
    expect(claimsNow()).toEqual([]);
  });
});

describe('what is on screen', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetPrefs();
    resetClaims();
    clearToasts();
    setPet(FRESH_PET);
    setQuillSheet({ ...FAKE_SHEET, url: 'quill.png', width: 128, height: 416 });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    clearToasts();
    resetClaims();
    resetPrefs();
  });

  const render = (ui: React.ReactNode) => act(async () => root.render(ui));

  it('leaves him in his house until something else wants him, then gives him back', async () => {
    await render(
      <>
        <QuillPetPanel />
        <ToastView />
      </>,
    );
    expectOneOfHim(host);
    expect(host.querySelector('.qp-room .quill')).toBeTruthy();

    // A toast with a Quill in it takes him; his room says where he is.
    let id = 0;
    await act(async () => void (id = toast('Saved', { kind: 'success', quill: 'cheer', duration: 0 })));
    expectOneOfHim(host);
    expect(host.querySelector('.ui-toast-quill')).toBeTruthy();
    expect(host.querySelector('.qp-room .quill')).toBeNull();
    expect(host.querySelector('.qp-out')?.textContent).toMatch(/out helping/);

    // The toast goes and he's home again.
    const { dismissToast } = await import('../../src/ui/toast');
    await act(async () => dismissToast(id));
    expectOneOfHim(host);
    expect(host.querySelector('.qp-room .quill')).toBeTruthy();
    expect(host.querySelector('.qp-out')).toBeNull();
  });

  it('a toast with no Quill in it does not take him', async () => {
    await render(
      <>
        <QuillPetPanel />
        <ToastView />
      </>,
    );
    await act(async () => void toast('Saved', { kind: 'success', duration: 0 }));
    expect(host.querySelector('.qp-room .quill')).toBeTruthy();
    expectOneOfHim(host);
  });

  it('every rank beats the ones below it, whatever order they turn up in', async () => {
    // One of each place at once, mounted lowest first, then dropped from the top. Never two of him.
    const stack = SURFACES.map((s) => <Quill key={s} surface={s} />);
    for (let n = 1; n <= stack.length; n++) {
      await render(<>{stack.slice(0, n)}</>);
      expectOneOfHim(host);
      expect(holder.get()).toBe(SURFACES[n - 1]);
    }
    for (let n = stack.length - 1; n >= 1; n--) {
      await render(<>{stack.slice(0, n)}</>);
      expectOneOfHim(host);
      expect(holder.get()).toBe(SURFACES[n - 1]);
    }
  });

  it('mounted highest first gives the same answer', async () => {
    await render(<>{[...SURFACES].reverse().map((s) => <Quill key={s} surface={s} />)}</>);
    expectOneOfHim(host);
    expect(holder.get()).toBe('hello');
  });

  it('a bubble that loses him keeps its words and stands without him', async () => {
    await render(
      <>
        <QuillSays surface="panel">
          <p>Words people need</p>
        </QuillSays>
        <Quill surface="quest" />
      </>,
    );
    expectOneOfHim(host);
    expect(host.textContent).toContain('Words people need');
    const bubble = host.querySelector('.quill-says')!;
    expect(bubble.classList.contains('is-alone')).toBe(true);
    expect(bubble.querySelector('.quill')).toBeNull();
  });

  it('two empty-state notes at once are still one Quill', async () => {
    await render(
      <>
        <QuillEmpty>One</QuillEmpty>
        <QuillEmpty surface="panel">Two</QuillEmpty>
        <QuillEmpty surface="empty">Three</QuillEmpty>
      </>,
    );
    expectOneOfHim(host);
    expect(host.textContent).toContain('One');
    expect(host.textContent).toContain('Three');
  });

  it('turning Show Quill off leaves no claim behind, so nothing is held for him', async () => {
    await render(
      <>
        <QuillPetPanel />
        <ToastView />
      </>,
    );
    await act(async () => setPrefs({ showQuill: false }));
    expect(claimsNow()).toEqual([]);
    expect(playerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------- the rule can't decay

/** The attributes of the JSX tag that starts at `from`, up to its closing `>` (skipping any inside braces or quotes). */
function tagAt(src: string, from: number): string {
  let depth = 0;
  let quote = '';
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0 && src[i - 1] !== '=') return src.slice(from, i);
  }
  return src.slice(from);
}

describe('no place draws him without asking', () => {
  const root = join(__dirname, '..', '..', 'src');
  const files = sourceFiles(root).filter((f) => !/ui\/mascot\/(Quill\.tsx|claims\.ts)$/.test(f));

  it('is looking at the source at all (a scan that finds no files would pass without saying so)', () => expect(files.length).toBeGreaterThan(300));

  it('every <Quill> and <QuillSays> names its surface', () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<(Quill|QuillSays)(?=[\s/>])/g)) {
        if (!/\bsurface=/.test(tagAt(src, m.index!))) bad.push(`${relative(root, f)}: <${m[1]}> with no surface`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('useQuillShown is always told which place it is asking for', () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/useQuillShown\(\s*\)/g)) bad.push(`${relative(root, f)}: useQuillShown() with no surface (${m.index})`);
    }
    expect(bad).toEqual([]);
  });

  it('only Quill.tsx starts a sprite player, so nothing can draw him round the claims', () => {
    const bad = files.filter((f) => /\bcreatePlayer\(/.test(readFileSync(f, 'utf8')) && !/ui\/mascot\/runtime\.ts$/.test(f)).map((f) => relative(root, f));
    expect(bad).toEqual([]);
  });
});
