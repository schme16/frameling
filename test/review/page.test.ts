// @ts-expect-error jsdom has no type declarations here
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { CanvasMark, CanvasNote, Doc } from '../../src/core/format';
import { buildReviewPage, safeJson } from '../../src/review/page';
import { mergeReview, readReview, reviewItems, structureSig, type PageData } from '../../src/review/model';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const doc = (): Doc => {
  const d = newDoc({ name: 'Sunny <day>', width: 400, height: 200 });
  d.id = 'doc1';
  d.length = 3;
  d.layers = [Object.assign(newVectorLayer('Lines'), { id: 'L1' })];
  d.layers[0].cels = [{ id: 'c', start: 0, length: 3, drawingId: 'dx' }];
  d.notes = [
    { id: 'o1', x: 40, y: 20, text: 'the elbow pops', pin: 'frame', frame: 1, by: 'Shane', at: 1_700_000_000_000 },
    { id: 'o2', x: 200, y: 100, text: 'colour? </script><b>x</b>', replies: [{ id: 'or', text: 'blue', by: 'Shane' }] },
  ] as CanvasNote[];
  d.marks = [{ id: 'om', kind: 'circle', pts: [10, 10, 90, 60], pin: 'frame', frame: 1, by: 'Shane' }] as CanvasMark[];
  return d;
};

const data = (d: Doc = doc()): PageData => ({
  v: 1,
  doc: { id: d.id, name: d.name, width: d.width, height: d.height, length: d.length, fps: d.fps },
  sent: 1_700_000_005_000,
  sig: structureSig(d),
  images: [PNG, PNG2],
  frames: [0, 1, 1],
  ...reviewItems(d),
});

function open(html: string) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://review.test/' });
  const w = dom.window as unknown as Window & typeof globalThis & { __review: { state: Record<string, unknown>; bundle: () => Record<string, unknown> } };
  const stage = w.document.getElementById('stage')!;
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;
  return { w, dom, $: (id: string) => w.document.getElementById(id)! };
}
const click = (w: Window, el: Element) => el.dispatchEvent(new (w as unknown as typeof globalThis).MouseEvent('click', { bubbles: true }));
const pointer = (w: Window, el: Element, type: string, x: number, y: number) => el.dispatchEvent(new (w as unknown as typeof globalThis).MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
const tool = (w: Window, name: string) => click(w, w.document.querySelector(`[data-tool="${name}"]`)!);

describe('the review page', () => {
  it('is one self-contained file: no links out, no paths, nothing loaded from anywhere', () => {
    const html = buildReviewPage(data());
    expect(html).not.toMatch(/<link\b|<script[^>]*\ssrc=|<img[^>]*\ssrc="https?:|@import|url\(https?:/);
    expect(html).not.toMatch(/(?:[A-Za-z]:\\|\/home\/|\/Users\/|file:\/\/)/);
    expect(html).toContain('<title>Review: Sunny day</title>');
    expect(buildReviewPage(data(), 'dark')).toContain('data-theme="dark"');
  });
  it('cannot be broken out of by what is written in a note', () => {
    expect(safeJson({ t: '</script><!--' })).not.toContain('<');
    const { w } = open(buildReviewPage(data()));
    expect(w.document.querySelectorAll('script').length).toBe(2);
    expect(w.document.querySelector('b')).toBeNull();
    expect(w.document.body.textContent).toContain('</script><b>x</b>');
  });
  it('shows the drawing, the version, and the existing notes with who left them', () => {
    const { w, $ } = open(buildReviewPage(data()));
    expect($('docName').textContent).toBe('Sunny <day>');
    expect($('version').textContent).toMatch(/^Sent /);
    expect(($('pic') as HTMLImageElement).src).toBe(PNG);
    const cards = [...w.document.querySelectorAll('#list .card')];
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('the elbow pops');
    expect(cards[0].textContent).toContain('Shane');
    expect(cards[0].textContent).toContain('Frame 2');
    expect(cards[1].textContent).toContain('blue');
    expect($('noteCount').textContent).toBe('2');
    // Frame 1 (the first): only the page note has a marker, and the frame-2 note and mark wait.
    expect(w.document.querySelectorAll('#pins .pin')).toHaveLength(1);
    expect($('over').querySelectorAll('ellipse')).toHaveLength(0);
  });
  it('moves through frames and shows what belongs on each', () => {
    const { w, $ } = open(buildReviewPage(data()));
    const scrub = $('scrub') as HTMLInputElement;
    scrub.value = '1';
    scrub.dispatchEvent(new w.Event('input'));
    expect(($('pic') as HTMLImageElement).src).toBe(PNG2);
    expect($('frameNo').textContent).toBe('Frame 2 of 3');
    expect(w.document.querySelectorAll('#pins .pin')).toHaveLength(2);
    expect($('over').querySelectorAll('ellipse')).toHaveLength(2);
  });
  it('a one-frame drawing has no frame controls', () => {
    const d = doc();
    d.length = 1;
    const { $ } = open(buildReviewPage({ ...data(d), frames: [0] }));
    expect($('frames').hidden).toBe(true);
    expect($('pinRow').hidden).toBe(true);
  });
  it('leaves a note, an answer, a mark and a tick, and hands them back as a comments file that merges in', () => {
    const d = doc();
    const { w, $ } = open(buildReviewPage(data(d)));
    ($('name') as HTMLInputElement).value = 'Anna';
    $('name').dispatchEvent(new w.Event('input'));
    tool(w, 'note');
    pointer(w, $('over'), 'pointerdown', 100, 50);
    const ta = w.document.querySelector('#list textarea') as HTMLTextAreaElement;
    ta.value = 'too dark here';
    ta.dispatchEvent(new w.Event('input'));
    // Answer the owner's note.
    const answer = w.document.querySelector('[data-note="o2"] input[type=text]') as HTMLInputElement;
    answer.value = 'I like it';
    answer.dispatchEvent(new (w as unknown as typeof globalThis).KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // Tick the owner's other note.
    const cb = w.document.querySelector('[data-note="o1"] input[type=checkbox]') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new w.Event('change'));
    // Draw an arrow.
    tool(w, 'arrow');
    pointer(w, $('over'), 'pointerdown', 20, 20);
    pointer(w, $('over'), 'pointermove', 120, 90);
    pointer(w, $('over'), 'pointerup', 120, 90);

    expect($('tally').textContent).toBe('1 note, 1 answer, 1 mark, 1 ticked off');
    const text = ($('out') as HTMLTextAreaElement).value;
    const r = readReview(text);
    if (!r.ok) throw new Error(r.why);
    expect(r.review.from).toBe('Anna');
    expect(r.review.doc).toBe('doc1');
    expect(r.review.sig).toBe(structureSig(d));
    expect(r.review.notes[0]).toMatchObject({ text: 'too dark here', x: 100, y: 50, by: 'Anna' });
    expect(r.review.notes[0]).toMatchObject({ pin: 'frame', frame: 0 });
    expect(r.review.marks[0]).toMatchObject({ kind: 'arrow', pts: [20, 20, 120, 90], by: 'Anna' });
    expect(r.review.replies).toMatchObject([{ note: 'o2', text: 'I like it', by: 'Anna' }]);
    expect(r.review.done).toEqual(['o1']);

    const merged = mergeReview(d, r.review);
    expect(merged.notes.map((n) => n.id)).toEqual(['o1', 'o2', r.review.notes[0].id]);
    expect(merged.notes[0].done).toBe(true);
    expect(merged.notes[1].replies!.map((x) => x.text)).toEqual(['blue', 'I like it']);
    expect(merged.marks).toHaveLength(2);
    // The drawing it was made from was not touched.
    expect(d.notes).toHaveLength(2);
    expect(d.notes![0].done).toBeUndefined();
  });
  it('pins to the frame being looked at, unless that is switched off', () => {
    const { w, $ } = open(buildReviewPage(data()));
    ($('scrub') as HTMLInputElement).value = '2';
    $('scrub').dispatchEvent(new w.Event('input'));
    tool(w, 'note');
    pointer(w, $('over'), 'pointerdown', 10, 10);
    const ta = w.document.querySelector('#list textarea') as HTMLTextAreaElement;
    ta.value = 'here';
    ta.dispatchEvent(new w.Event('input'));
    let b = JSON.parse(($('out') as HTMLTextAreaElement).value);
    expect(b.notes[0]).toMatchObject({ pin: 'frame', frame: 2 });
    ($('pinFrame') as HTMLInputElement).checked = false;
    $('pinFrame').dispatchEvent(new w.Event('change'));
    pointer(w, $('over'), 'pointerdown', 30, 30);
    const second = w.document.querySelectorAll('#list textarea');
    (second[second.length - 1] as HTMLTextAreaElement).value = 'anywhere';
    second[second.length - 1].dispatchEvent(new w.Event('input'));
    b = JSON.parse(($('out') as HTMLTextAreaElement).value);
    expect(b.notes[1].pin).toBeUndefined();
  });
  it('a tap that goes nowhere leaves no mark, and nothing is offered to send until there is something', () => {
    const { w, $ } = open(buildReviewPage(data()));
    expect(($('saveBtn') as HTMLButtonElement).disabled).toBe(true);
    expect($('tally').textContent).toBe('Nothing to send yet');
    tool(w, 'circle');
    pointer(w, $('over'), 'pointerdown', 50, 50);
    pointer(w, $('over'), 'pointerup', 50, 50);
    expect(JSON.parse(($('out') as HTMLTextAreaElement).value).marks).toEqual([]);
  });
  it('wants a name before it sends', () => {
    const { w, $ } = open(buildReviewPage(data()));
    tool(w, 'arrow');
    pointer(w, $('over'), 'pointerdown', 20, 20);
    pointer(w, $('over'), 'pointermove', 120, 90);
    pointer(w, $('over'), 'pointerup', 120, 90);
    click(w, $('saveBtn'));
    expect($('nameHint').hidden).toBe(false);
  });
  it('keeps what you wrote if the page is closed and opened again', () => {
    const html = buildReviewPage(data());
    const first = open(html);
    const store = first.w.localStorage;
    (first.$('name') as HTMLInputElement).value = 'Anna';
    first.$('name').dispatchEvent(new first.w.Event('input'));
    tool(first.w, 'arrow');
    pointer(first.w, first.$('over'), 'pointerdown', 20, 20);
    pointer(first.w, first.$('over'), 'pointermove', 120, 90);
    pointer(first.w, first.$('over'), 'pointerup', 120, 90);
    const saved = JSON.stringify(store.getItem([...Array(store.length).keys()].map((i) => store.key(i)!)[0]));
    expect(saved).toContain('Anna');
    // A new window with the same storage.
    const dom2 = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://review.test/', beforeParse(win: Window) { for (const k of Object.keys(store)) win.localStorage.setItem(k, store.getItem(k)!); } });
    const w2 = dom2.window as unknown as Window;
    expect((w2.document.getElementById('name') as HTMLInputElement).value).toBe('Anna');
    expect(JSON.parse((w2.document.getElementById('out') as HTMLTextAreaElement).value).marks).toHaveLength(1);
  });
});
