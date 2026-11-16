import { describe, expect, it } from 'vitest';
import { SEARCH_FROM, findAnswered, matchArtboards, onFindRequest, requestFind } from '../../src/artboards/find';

const boards = ['Idle', 'Walk', 'Walk fast', 'Run', 'Jump up', 'Sleep'].map((name) => ({ name }));

describe('finding an artboard by name', () => {
  it('keeps everything for an empty search', () => {
    expect(matchArtboards(boards, '')).toHaveLength(6);
    expect(matchArtboards(boards, '   ')).toHaveLength(6);
  });
  it('matches part of a name in any case', () => {
    expect(matchArtboards(boards, 'WAL').map((b) => b.name)).toEqual(['Walk', 'Walk fast']);
  });
  it('needs every word, in any order', () => {
    expect(matchArtboards(boards, 'fast walk').map((b) => b.name)).toEqual(['Walk fast']);
    expect(matchArtboards(boards, 'walk nothing')).toEqual([]);
  });
  it('keeps the list order and does not change the list', () => {
    const copy = [...boards];
    expect(matchArtboards(boards, 'e').map((b) => b.name)).toEqual(['Idle', 'Sleep']);
    expect(boards).toEqual(copy);
  });
  it('searches only once there is a long list', () => {
    expect(SEARCH_FROM).toBeGreaterThan(3);
  });
  it('a request made before the panel opened is answered when it does', async () => {
    requestFind();
    let n = 0;
    const off = onFindRequest(() => {
      n++;
      findAnswered();
    });
    await Promise.resolve();
    expect(n).toBe(1);
    requestFind();
    expect(n).toBe(2);
    off();
    requestFind();
    expect(n).toBe(2);
    findAnswered();
  });
});
