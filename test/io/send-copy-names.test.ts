// A copy you send carries the work, not you. A note is stamped with whoever left it and when, so those stamps come off
// unless the person says to keep them. The words of the notes are the point of sending it, so they stay.
import { describe, expect, it } from 'vitest';
import { newDoc, uid } from '../../src/core/doc';
import type { CanvasNote, Doc } from '../../src/core/format';
import { hasNames, withNamesOff } from '../../src/io/sendCopyNames';

function noted(): Doc {
  const doc = newDoc({ width: 100, height: 80 });
  const note: CanvasNote = {
    id: uid('n'),
    x: 10,
    y: 20,
    text: 'the elbow pops here',
    by: 'Shane',
    at: 1700000000000,
    replies: [{ id: uid('r'), text: 'fixed it', by: 'Anna', at: 1700000900000 }],
  };
  doc.notes = [note];
  return doc;
}

describe('a copy you send does not carry your name', () => {
  it('takes the name and the time off a note and its answers', () => {
    const out = withNamesOff(noted());
    const n = out.notes![0];
    expect(n.by).toBeUndefined();
    expect(n.at).toBeUndefined();
    expect(n.replies![0].by).toBeUndefined();
    expect(n.replies![0].at).toBeUndefined();
  });

  it('keeps everything that is the work: the words, where it sits, and what it is pinned to', () => {
    const before = noted();
    const n = withNamesOff(before).notes![0];
    expect(n.text).toBe('the elbow pops here');
    expect(n.replies![0].text).toBe('fixed it');
    expect([n.x, n.y]).toEqual([10, 20]);
    expect(n.id).toBe(before.notes![0].id);
  });

  it('never changes the drawing it was given', () => {
    const before = noted();
    const copy = JSON.parse(JSON.stringify(before));
    withNamesOff(before);
    expect(JSON.parse(JSON.stringify(before))).toEqual(copy);
    expect(before.notes![0].by).toBe('Shane');
  });

  it('hands back the very same drawing when there is nothing stamped, so it costs nothing', () => {
    const plain = newDoc({ width: 10, height: 10 });
    expect(withNamesOff(plain)).toBe(plain);
    const anonymous = noted();
    anonymous.notes = [{ id: uid('n'), x: 1, y: 2, text: 'no name on this one' }];
    expect(hasNames(anonymous)).toBe(false);
  });

  it('knows when a drawing has somebody on it, including only in an answer', () => {
    expect(hasNames(noted())).toBe(true);
    const onlyReply = newDoc({ width: 10, height: 10 });
    onlyReply.notes = [{ id: uid('n'), x: 1, y: 2, text: 'mine', replies: [{ id: uid('r'), text: 'theirs', by: 'Anna' }] }];
    expect(hasNames(onlyReply)).toBe(true);
    expect(withNamesOff(onlyReply).notes![0].replies![0].by).toBeUndefined();
  });
});
