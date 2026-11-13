// Beta reports: the two promises. Nothing personal goes in one, and nothing goes at all unless it is asked to.
import { describe, expect, it, vi } from 'vitest';
import { buildReport, docShape, MAX_BYTES, reportFits, reportText, scrub } from '../../src/beta/report';
import { sendReport, SEND_WORDS } from '../../src/beta/send';
import { forgetProblems, noteProblem, recentProblems, watchProblems } from '../../src/beta/problems';
import { newDoc } from '../../src/core/doc';

const env = { appVersion: '0.0.1', platform: 'linux' };

describe('what goes in a report', () => {
  it('takes paths and addresses out of what you typed', () => {
    expect(scrub('it broke opening /home/sam/art/secret plan.frameling')).not.toContain('/home/sam');
    expect(scrub('C:\\Users\\Sam\\Documents\\thing.frameling broke')).not.toContain('Sam');
    expect(scrub('write to sam@example.com')).toBe('write to <an address>');
    expect(scrub('file:///home/sam/x.png')).not.toContain('sam');
  });

  it('leaves ordinary words alone', () => {
    const plain = 'It froze when I pressed Export, with the timeline open.';
    expect(scrub(plain)).toBe(plain);
  });

  it('measures a document without reading a thing that is in it', () => {
    const doc = newDoc({ name: 'My secret project', width: 320, height: 240, length: 12, fps: 24 });
    const shape = docShape(doc);
    expect(shape).toMatchObject({ width: 320, height: 240, frames: 12, fps: 24, layers: 1 });
    // Nothing anywhere in the measurements says what it is called or what is drawn.
    expect(JSON.stringify(shape)).not.toContain('secret');
    expect(Object.keys(shape)).not.toContain('name');
  });

  it('never carries the document name, the path or the drawing', () => {
    const doc = newDoc({ name: 'Nan birthday card' });
    const r = buildReport({ note: 'it broke', env, shape: docShape(doc) });
    const text = reportText(r);
    expect(text).not.toContain('Nan');
    expect(text).not.toContain('birthday');
  });

  it('only carries a contact when one was given', () => {
    expect(buildReport({ note: 'x', env }).contact).toBeUndefined();
    expect(buildReport({ note: 'x', contact: '  ', env }).contact).toBeUndefined();
    expect(buildReport({ note: 'x', contact: 'me@example.com', env }).contact).toBe('<an address>');
  });

  it('takes its title and summary from the first line of your note', () => {
    const r = buildReport({ note: 'Export freezes\nevery time, on any drawing', env });
    expect(r.title).toBe('Export freezes');
    expect(r.summary).toBe('Export freezes');
    expect(r.text).toContain('every time');
  });

  it('says something sensible when the note is empty', () => {
    const r = buildReport({ note: '', env });
    expect(r.title).toBeTruthy();
    expect(r.summary).toBe('No note');
  });

  it('is the same report every time, so what you read is what goes', () => {
    const parts = { note: 'same', env, shape: docShape(newDoc({})) };
    expect(reportText(buildReport(parts))).toBe(reportText(buildReport(parts)));
  });

  it('knows when it is too big to send', () => {
    expect(reportFits(buildReport({ note: 'small', env }))).toBe(true);
    const huge = buildReport({ note: 'x', env, problems: Array.from({ length: 20 }, () => 'y'.repeat(500)) });
    huge.data.filler = 'z'.repeat(MAX_BYTES);
    expect(reportFits(huge)).toBe(false);
  });
});

describe('sending', () => {
  const report = buildReport({ note: 'it broke', env });

  it('does nothing at all in a build with no key', async () => {
    const fetcher = vi.fn();
    const out = await sendReport(report, fetcher);
    expect(out).toEqual({ ok: false, why: 'no-key' });
    // The important half: it never even reached for the network.
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('has plain words for every way it can go wrong', () => {
    for (const why of Object.keys(SEND_WORDS) as (keyof typeof SEND_WORDS)[]) {
      expect(SEND_WORDS[why]).toBeTruthy();
      expect(SEND_WORDS[why]).not.toMatch(/[\u2013\u2014]/);
    }
  });
});

describe('the problems it remembers', () => {
  it('keeps the last few, and forgets them when asked', () => {
    forgetProblems();
    for (let i = 0; i < 30; i++) noteProblem(`broke ${i}`);
    const got = recentProblems();
    expect(got.length).toBeLessThanOrEqual(20);
    expect(got[got.length - 1]).toContain('broke 29');
    forgetProblems();
    expect(recentProblems()).toEqual([]);
  });

  it('stops listening when told to', () => {
    forgetProblems();
    const on = vi.fn();
    const off = vi.fn();
    const win = { addEventListener: on, removeEventListener: off } as unknown as Window;
    const stop = watchProblems(win);
    expect(on).toHaveBeenCalledTimes(2);
    stop();
    expect(off).toHaveBeenCalledTimes(2);
  });
});

describe('automatic reports in a beta build', () => {
  it('sends nothing at all without a key, however much goes wrong', async () => {
    const { autoOn, forgetAuto } = await import('../../src/beta/auto');
    forgetAuto();
    // No key in an ordinary build, so nothing is ever sent by itself.
    expect(autoOn()).toBe(false);
    forgetProblems();
    for (let i = 0; i < 10; i++) noteProblem(`broke ${i}`);
    expect(autoOn()).toBe(false);
  });

  it('tells anyone listening when something goes wrong', async () => {
    const { onProblem } = await import('../../src/beta/problems');
    forgetProblems();
    let heard = 0;
    const off = onProblem(() => (heard += 1));
    noteProblem('one');
    noteProblem('two');
    expect(heard).toBe(2);
    off();
    noteProblem('three');
    expect(heard).toBe(2);
  });

  it('gives up after a few, so a build stuck in a loop cannot sit there sending', async () => {
    const { AUTO_MAX } = await import('../../src/beta/auto');
    expect(AUTO_MAX).toBeGreaterThan(0);
    expect(AUTO_MAX).toBeLessThanOrEqual(10);
  });
});
