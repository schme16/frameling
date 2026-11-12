// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { targetFor } from '../../src/export/exporter';

describe('where an export is written when the exporter named it differently', () => {
  it('a browser download takes the new ending (an MP4 that became a MOV)', () => {
    expect(targetFor('download:/abc/Ball.mp4', 'Ball.mov')).toBe('download:/abc/Ball.mov');
    expect(targetFor('download:/abc/Ball', 'Ball.mov')).toBe('download:/abc/Ball.mov');
    expect(targetFor('download:/abc/My.cool.ball.mp4', 'My.cool.ball.mov')).toBe('download:/abc/My.cool.ball.mov');
  });
  it('a file the person picked keeps its name', () => {
    expect(targetFor('file:/abc/Ball.mp4', 'Ball.mov')).toBe('file:/abc/Ball.mp4');
    expect(targetFor('/home/me/Ball.mp4', 'Ball.mov')).toBe('/home/me/Ball.mp4');
  });
  it('nothing changes when the name already matches or has no ending', () => {
    expect(targetFor('download:/abc/Ball.mp4', 'Ball.mp4')).toBe('download:/abc/Ball.mp4');
    expect(targetFor('download:/abc/Ball.mp4', 'Ball')).toBe('download:/abc/Ball.mp4');
  });
});
