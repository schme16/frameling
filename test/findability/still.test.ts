// @vitest-environment jsdom
// A drawing with no animation. Frameling opens to one, so this is what somebody who only wants to draw a picture meets
// first, and it has to be both clean and not a dead end. Three things are held here:
//   1. how much of the app is out of the way on a still, against the same drawing with animation on (STILL_LOAD, exact,
//      and only meant to go down), counted the way STREAM_LOAD counts the streaming tools;
//   2. nothing is lost to it: every command a still tucks out of the menus is still in the command search, and still says
//      how to get it (greyed with "Add animation first", or it turns animation on and carries on);
//   3. Add animation is found by the words a person would try, and sits where an animator looks first.
// Set FINDABILITY_REPORT=1 to print the numbers.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allCommands } from '../../src/core/registry';
import { animationKind, ADD_ANIMATION_FIRST } from '../../src/core/animationGate';
import { store } from '../../src/core/store';
import { commandEnabled, commandReason, paletteItems, rankPalette } from '../../src/ui/palette';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { loadApp, menuLists, quietWorld, SITUATIONS, STILL_SITUATION } from './app';
import { STILL_LOAD } from './known-gaps';

const report: string[] = [];
afterAll(() => {
  SITUATIONS[0].set();
  if (process.env.FINDABILITY_REPORT) process.stdout.write(`\nA drawing with no animation\n${report.join('\n')}\n`);
});

beforeAll(async () => {
  await loadApp();
  quietWorld();
});

/** Every command in some menu, and the commands in the Animate menu, in the current situation. */
function menus(): { all: Set<string>; animate: string[] } {
  syncDynamicCommands();
  const lists = menuLists();
  const all = new Set(lists.flatMap((l) => l.commands));
  const animate = [...new Set(lists.filter((l) => l.path[0] === 'Animate').flatMap((l) => l.commands))];
  return { all, animate };
}

function counts() {
  syncDynamicCommands();
  const m = menus();
  const items = paletteItems().filter((i) => i.kind === 'command');
  return {
    /** Commands in the palette that work right now. */
    palette: items.filter((i) => i.kind === 'command' && commandEnabled(i.command)).length,
    /** Commands in any menu. */
    menu: m.all.size,
    /** Commands in the Animate menu. */
    animateMenu: m.animate.length,
  };
}

describe('a drawing with no animation is out of the way, and the numbers say how much', () => {
  it('looks at the real app', () => {
    STILL_SITUATION.set();
    expect(store().get().doc.length).toBe(1);
    expect(store().get().doc.animated).toBe(false);
    expect(counts().palette).toBeGreaterThan(300);
  });

  it('what is on offer on a still and with animation on is counted exactly, and only goes down', () => {
    STILL_SITUATION.set();
    const still = counts();
    SITUATIONS[0].set();
    const animated = counts();
    report.push(`Still: ${still.palette} in the palette, ${still.menu} in the menus, ${still.animateMenu} in the Animate menu.`);
    report.push(`With animation: ${animated.palette} in the palette, ${animated.menu} in the menus, ${animated.animateMenu} in the Animate menu.`);
    expect({ still, animated }).toEqual(STILL_LOAD);
  });

  it('a still shows the way in under Animate, and tracing pictures, which are for stills too', () => {
    STILL_SITUATION.set();
    const here = menus().animate;
    expect(here[0]).toBe('animation.add');
    expect(here.filter((id) => !id.startsWith('reference.') && id !== 'animation.add')).toEqual([]);
  });
});

describe('nothing is lost to a still', () => {
  const family = () => allCommands().filter((c) => !c.hidden && animationKind(c) !== 'open');

  it('there are a lot of animation commands, so the test is looking at something', () => {
    expect(family().length).toBeGreaterThan(100);
  });

  it('every one is still in the command search', () => {
    STILL_SITUATION.set();
    const inPalette = new Set(paletteItems().filter((i) => i.kind === 'command').map((i) => i.id));
    expect(family().filter((c) => !inPalette.has(c.id)).map((c) => c.id)).toEqual([]);
  });

  it('every one that is greyed on a still says to add animation, and every one that is not turns it on', () => {
    STILL_SITUATION.set();
    const wrong: string[] = [];
    for (const c of family()) {
      if (animationKind(c) === 'needs') {
        if (commandEnabled(c) || commandReason(c) !== ADD_ANIMATION_FIRST) wrong.push(`${c.id} (needs)`);
      } else if (!commandEnabled(c) && !commandReason(c)) {
        // A frame command that is greyed for its own reasons (nothing selected, say) has to say so.
        wrong.push(`${c.id} (makes, greyed with no reason)`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('Add animation is found by the words a person would try', () => {
  // "onion skin" and "play" find their own commands first, greyed with the reason, which is the better answer.
  const words = ['animate', 'animation', 'frames', 'timeline', 'add animation', 'flipbook', 'frame rate', 'fps', 'animating'];
  for (const w of words) {
    it(`"${w}" puts Add animation in the first three results on a still`, () => {
      STILL_SITUATION.set();
      syncDynamicCommands();
      const top = rankPalette(w, paletteItems(), [], 3).map((h) => h.item.id);
      expect(top, `top three for "${w}"`).toContain('animation.add');
    });
  }
});

describe('somebody who wants a second frame falls over the way in', () => {
  // These name a frame, so the best answer is a command that turns animation on and carries on (see animationGate.ts).
  for (const w of ['frame', 'second frame', 'new frame', 'add a frame', 'next frame', 'insert a frame']) {
    it(`"${w}" finds Add animation or a command that adds it and carries on, in the first three`, () => {
      STILL_SITUATION.set();
      syncDynamicCommands();
      const top = rankPalette(w, paletteItems(), [], 3).map((h) => h.item);
      const ok = top.some((i) => i.kind === 'command' && (i.id === 'animation.add' || animationKind(i.command) === 'makes'));
      expect(ok, `top three for "${w}": ${top.map((i) => i.id).join(', ')}`).toBe(true);
    });
  }
});
