// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { pressesControl } from '../../src/canvas/input';

describe('presses on controls over the canvas', () => {
  it('leaves buttons and links alone, and draws on everything else', () => {
    document.body.innerHTML = '<div id="root"><canvas id="c"></canvas><div class="banner"><button id="b"><span id="s">Done</span></button><a href="#" id="a">x</a></div></div>';
    expect(pressesControl(document.getElementById('b'))).toBe(true);
    expect(pressesControl(document.getElementById('s'))).toBe(true);
    expect(pressesControl(document.getElementById('a'))).toBe(true);
    expect(pressesControl(document.getElementById('c'))).toBe(false);
    expect(pressesControl(document.getElementById('root'))).toBe(false);
    expect(pressesControl(null)).toBe(false);
  });
});
