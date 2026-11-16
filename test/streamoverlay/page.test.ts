// @vitest-environment jsdom
// The page itself, run in a pretend browser with a pretend /state: each piece appears when its source says so and is
// gone after, an idle page has nothing on it, and words go in as text, never as markup.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_CSS, OVERLAY_HTML, OVERLAY_JS } from '../../src/main/overlayPage';
import { emptyOverlay, type OverlayState } from '../../src/shared/streamOverlay';

let now = 1_700_000_000_000;
let reply: () => Promise<Response>;
let current: OverlayState;

const json = (state: OverlayState): Response => new Response(JSON.stringify({ ok: true, now, state }), { status: 200 });

function boot(): void {
  document.documentElement.innerHTML = OVERLAY_HTML.replace(/^<!doctype html>/i, '').replace(/<script[^>]*><\/script>/, '').replace(/<link[^>]*>/, '');
  vi.stubGlobal('fetch', (url: string) => (String(url).startsWith('state') ? reply() : Promise.resolve(new Response('', { status: 404 }))));
  (0, eval)(OVERLAY_JS);
}
const tick = async (ms: number) => {
  now += ms;
  await vi.advanceTimersByTimeAsync(ms);
};
const $ = (id: string) => document.getElementById(id)!;
const showing = (id: string) => $(id).classList.contains('show') && !$(id).classList.contains('gone');
const nothing = () => ['banner', 'count', 'vote', 'quill', 'prompt'].every((id) => !$(id).classList.contains('show')) && $('chips').children.length === 0;

beforeEach(() => {
  vi.useFakeTimers({ now });
  current = emptyOverlay();
  reply = () => Promise.resolve(json(current));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the page', () => {
  it('has a transparent background and nothing on it while nothing is happening', async () => {
    boot();
    await tick(1500);
    expect(nothing()).toBe(true);
    for (const id of ['banner', 'count', 'vote', 'quill', 'prompt']) expect($(id).classList.contains('gone')).toBe(true);
    expect(OVERLAY_CSS).toMatch(/html, body \{[^}]*background: transparent/);
    // What is on the page is nothing: every block is off it, so no word of it is there to be seen.
    const visible = [...document.querySelectorAll('#stage > *')].filter((e) => !e.classList.contains('gone')).map((e) => e.textContent).join('');
    expect(visible).toBe('');
  });

  it('shows a challenge banner while it runs, with its bar, and takes it off the page when it is over', async () => {
    current = { ...emptyOverlay(), banner: { text: 'Draw with your other hand.', startedAt: now, endsAt: now + 3000 } };
    boot();
    await tick(600);
    expect(showing('banner')).toBe(true);
    expect($('bannerText').textContent).toBe('Draw with your other hand.');
    expect($('bannerBar').style.transform).toMatch(/scaleX\(0\.[0-9]+\)/);
    await tick(3000);
    expect($('banner').classList.contains('show')).toBe(false);
    await tick(600);
    expect($('banner').classList.contains('gone')).toBe(true);
  });

  it('counts down, says Time!, then goes', async () => {
    current = { ...emptyOverlay(), countdown: { text: 'Beat the clock', endsAt: now + 10_000, over: false, until: now + 12_500 } };
    boot();
    await tick(600);
    expect(showing('count')).toBe(true);
    expect($('countN').textContent).toBe('10');
    expect($('countT').textContent).toBe('Beat the clock');
    await tick(5000);
    expect($('countN').textContent).toBe('5');
    expect($('count').classList.contains('low')).toBe(true);
    await tick(5500);
    expect($('countN').textContent).toBe('Time!');
    await tick(3000);
    expect($('count').classList.contains('show')).toBe(false);
  });

  it('shows Quill with his words and goes when his time is up', async () => {
    current = { ...emptyOverlay(), quill: { id: 1, anim: 'cheer', words: 'Chat is cheering for you!', sign: false, until: now + 2000 } };
    boot();
    await tick(500);
    expect(showing('quill')).toBe(true);
    expect($('bubble').textContent).toBe('Chat is cheering for you!');
    expect($('bubble').classList.contains('sign')).toBe(false);
    await tick(2500);
    expect($('quill').classList.contains('show')).toBe(false);
  });

  it('shows a sign differently, and a new reaction replaces the last', async () => {
    current = { ...emptyOverlay(), quill: { id: 1, anim: 'holding', words: 'Hello from chat', sign: true, until: now + 9000 } };
    boot();
    await tick(500);
    expect($('bubble').classList.contains('sign')).toBe(true);
    current = { ...emptyOverlay(), quill: { id: 2, anim: 'hop', words: 'Boing!', sign: false, until: now + 5000 } };
    await tick(600);
    expect($('bubble').textContent).toBe('Boing!');
    expect($('bubble').classList.contains('sign')).toBe(false);
  });

  it('shows a chip for each lasting dare with its seconds, and drops each when its time is up', async () => {
    current = { ...emptyOverlay(), chips: [{ label: 'Flipped view', endsAt: now + 4000 }, { label: 'Grey screen', endsAt: now + 9000 }] };
    boot();
    await tick(600);
    expect($('chips').children).toHaveLength(2);
    expect($('chips').children[0].textContent).toBe('Flipped view4s');
    await tick(5000);
    expect($('chips').children).toHaveLength(1);
    expect($('chips').children[0].textContent).toContain('Grey screen');
    await tick(5000);
    expect($('chips').children).toHaveLength(0);
  });

  it('shows the pulled prompt until the app stops saying so', async () => {
    current = { ...emptyOverlay(), prompt: { id: 4, text: 'a frog in a teacup' } };
    boot();
    await tick(600);
    expect(showing('prompt')).toBe(true);
    expect($('promptText').textContent).toBe('a frog in a teacup');
    current = emptyOverlay();
    await tick(600);
    expect($('prompt').classList.contains('show')).toBe(false);
    await tick(600);
    expect($('prompt').classList.contains('gone')).toBe(true);
  });

  it('shows a vote with its bars, then its result, then nothing', async () => {
    current = { ...emptyOverlay(), vote: { status: 'open', question: 'What next?', options: [{ label: 'Hat', votes: 3 }, { label: 'Cape', votes: 1 }], endsAt: now + 30_000, winner: -1 } };
    boot();
    await tick(600);
    expect(showing('vote')).toBe(true);
    expect($('voteQ').textContent).toBe('What next?');
    const rows = $('voteList').children;
    expect(rows).toHaveLength(2);
    expect((rows[0].firstChild as HTMLElement).style.width).toBe('75%');
    expect(rows[0].textContent).toContain('Hat');
    expect($('voteFoot').textContent).toBe('30s left');
    current = { ...emptyOverlay(), vote: { status: 'ended', question: 'What next?', options: [{ label: 'Hat', votes: 5 }, { label: 'Cape', votes: 1 }], endsAt: null, winner: 0 } };
    await tick(600);
    expect(rows[0].classList.contains('win')).toBe(true);
    expect($('voteFoot').textContent).toBe('Result: Hat wins');
    current = emptyOverlay();
    await tick(1200);
    expect($('vote').classList.contains('gone')).toBe(true);
  });

  it('wears the streamer theme, and the light one differently', async () => {
    current = { ...emptyOverlay(), theme: { dark: false, text: '#112233', raised: '#ffffff', accent: '#ff0000', line: '#cccccc' }, prompt: { id: 1, text: 'x' } };
    boot();
    await tick(600);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ff0000');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('puts every word in as text: markup in it stays words, and nothing is made from it', async () => {
    const evil = '<img src=x onerror="window.__owned=1"><script>window.__owned=1</script>';
    current = { ...emptyOverlay(), prompt: { id: 1, text: evil }, banner: { text: evil, startedAt: now, endsAt: now + 5000 }, quill: { id: 1, anim: 'cheer', words: evil, sign: false, until: now + 5000 }, vote: { status: 'open', question: evil, options: [{ label: evil, votes: 1 }, { label: 'b', votes: 0 }], endsAt: null, winner: -1 } };
    boot();
    await tick(800);
    expect($('promptText').textContent).toBe(evil);
    expect(document.querySelectorAll('img, script, iframe').length).toBe(0);
    expect((window as unknown as { __owned?: number }).__owned).toBeUndefined();
  });

  it('shows nothing, quietly, when the app cannot be reached, and comes back when it can', async () => {
    current = { ...emptyOverlay(), prompt: { id: 4, text: 'a frog' } };
    boot();
    await tick(600);
    expect(showing('prompt')).toBe(true);
    reply = () => Promise.reject(new Error('down'));
    await tick(600);
    await tick(600);
    expect(nothing()).toBe(true);
    reply = () => Promise.resolve(json(current));
    await tick(2500);
    expect(showing('prompt')).toBe(true);
  });
});
