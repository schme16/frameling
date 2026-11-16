// @vitest-environment jsdom
// What a still picture does about animation commands: three kinds, one reason, and Add animation on the way.
import { beforeAll, describe, expect, it } from 'vitest';
import { ADD_ANIMATION_FIRST, animationKind, gateEnabled, gateReason, MAKES_FRAMES, withAnimation } from '../../src/core/animationGate';
import { isAnimated } from '../../src/core/animation';
import { newDoc } from '../../src/core/doc';
import { getCommand } from '../../src/core/registry';
import { reasonFor, hasReason } from '../../src/core/commandReasons';
import { resetStore, store } from '../../src/core/store';
import { commandEnabled, commandReason, notNowMessage, runCommand } from '../../src/ui/palette';
import { withoutAnimation, type MenuItem } from '../../src/ui/menus';
import { leftOutForStill, ANIMATION_PANELS } from '../../src/ui/stillZone';
import { loadApp } from '../findability/app';

const still = () => resetStore(newDoc({ animated: false }));
const animated = () => resetStore(newDoc({ animated: true }));
const cmd = (id: string) => getCommand(id)!;

beforeAll(async () => {
  await loadApp();
});

describe('which kind a command is', () => {
  it('the doors are open, frame makers make, the rest of animation needs it, and drawing is untouched', () => {
    expect(animationKind({ id: 'animation.add', category: 'Animation' })).toBe('open');
    expect(animationKind({ id: 'animation.remove', category: 'Animation' })).toBe('open');
    expect(animationKind({ id: 'timeline.newKey', category: 'Timeline' })).toBe('makes');
    expect(animationKind({ id: 'view.panel.timeline', category: 'View' })).toBe('makes');
    expect(animationKind({ id: 'timeline.play', category: 'Timeline' })).toBe('needs');
    expect(animationKind({ id: 'tween.make', category: 'Animate' })).toBe('needs');
    expect(animationKind({ id: 'tools.motion-path', category: 'Tools' })).toBe('needs');
    expect(animationKind({ id: 'edit.undo', category: 'Edit' })).toBe('open');
    expect(animationKind({ id: 'tools.brush', category: 'Tools' })).toBe('open');
  });
  it('every frame maker is a real command', () => {
    for (const id of MAKES_FRAMES) expect(getCommand(id), id).toBeTruthy();
  });
});

describe('on a still', () => {
  it('Play is greyed, with the reason, and the reason is the same on every surface that asks', () => {
    const s = still();
    const play = cmd('timeline.play');
    expect(commandEnabled(play)).toBe(false);
    expect(gateReason(play, s.get())).toBe(ADD_ANIMATION_FIRST);
    expect(commandReason(play)).toBe(ADD_ANIMATION_FIRST);
    expect(reasonFor(play, s.get())).toBe(ADD_ANIMATION_FIRST);
    expect(hasReason(play)).toBe(true);
    expect(notNowMessage(play)).toMatch(/Add animation first/);
  });
  it('the reason says what to do, and has no em dash', () => {
    expect(ADD_ANIMATION_FIRST).toMatch(/Add animation first/);
    expect(ADD_ANIMATION_FIRST).not.toMatch(/[–—]/);
  });
  it('Play works again when animation is on', () => {
    animated();
    expect(gateReason(cmd('timeline.play'), store().get())).toBeUndefined();
  });
  it('Add animation is open on a still and greyed (with a reason) when there is animation', () => {
    still();
    expect(commandEnabled(cmd('animation.add'))).toBe(true);
    expect(commandEnabled(cmd('animation.remove'))).toBe(false);
    expect(commandReason(cmd('animation.remove'))).toMatch(/no animation to turn off/);
    animated();
    expect(commandEnabled(cmd('animation.add'))).toBe(false);
    expect(commandReason(cmd('animation.add'))).toMatch(/already an animation/);
    expect(commandEnabled(cmd('animation.remove'))).toBe(true);
  });
  it('what the frame makers would do is asked of the drawing as it would be with animation on', () => {
    const s = still();
    const next = cmd('timeline.nextFrame');
    // One frame has no next frame, but once animation is on it has.
    expect(commandEnabled(next)).toBe(true);
    expect(withAnimation(s.get()).doc.length).toBeGreaterThan(1);
    expect(s.get().doc.length).toBe(1);
    expect(gateEnabled({ id: 'timeline.nextFrame', category: 'Timeline', enabled: (st) => st.doc.length > 1 }, s.get())).toBe(true);
  });
});

describe('asking for a frame on a still', () => {
  it('turns animation on, says so, and then does it', () => {
    const s = still();
    expect(runCommand(cmd('timeline.nextFrame'))).toBe(true);
    expect(isAnimated(s.get().doc)).toBe(true);
    expect(s.get().ui.frame).toBe(1);
    s.undo();
    expect(isAnimated(s.get().doc)).toBe(false);
  });
  it('Play on a still does nothing, and nothing is added behind the person', () => {
    const s = still();
    expect(runCommand(cmd('timeline.play'))).toBe(false);
    expect(isAnimated(s.get().doc)).toBe(false);
    expect(s.get().ui.playing).toBe(false);
  });
  it('Add animation from the command works, once', () => {
    const s = still();
    expect(runCommand(cmd('animation.add'))).toBe(true);
    expect(s.get().doc.length).toBe(24);
    expect(runCommand(cmd('animation.add'))).toBe(false);
  });
});

describe('the menus on a still', () => {
  const c = (id: string, category: string) => ({ kind: 'command', command: { id, label: id, category, run: () => {} } }) as MenuItem;
  it('leave out the animation entries, empty submenus and the way out, and keep the rest', () => {
    const items: MenuItem[] = [
      c('animation.add', 'Animation'),
      c('animation.remove', 'Animation'),
      { kind: 'separator' },
      c('timeline.play', 'Timeline'),
      c('timeline.newKey', 'Timeline'),
      { kind: 'submenu', label: 'Onion', items: [c('timeline.toggleOnion', 'Timeline')] },
      { kind: 'submenu', label: 'Reference', items: [c('reference.place', 'Reference')] },
      { kind: 'separator' },
      c('edit.undo', 'Edit'),
    ];
    const out = withoutAnimation(items);
    const ids = out.flatMap((i) => (i.kind === 'command' ? [i.command.id] : i.kind === 'submenu' ? [`sub:${i.label}`] : ['-']));
    expect(ids).toEqual(['animation.add', '-', 'sub:Reference', '-', 'edit.undo']);
  });
});

describe('the drawer', () => {
  it('a still leaves out a bottom zone that holds only frames, and nothing else', () => {
    expect(leftOutForStill('bottom', ['timeline'], false, 'draw')).toBe(true);
    expect(leftOutForStill('bottom', ['timeline', 'clip-play'], false, 'draw')).toBe(true);
    expect(leftOutForStill('bottom', ['timeline', 'history'], false, 'draw')).toBe(false);
    expect(leftOutForStill('bottom', [], false, 'draw')).toBe(false);
    expect(leftOutForStill('left', ['timeline'], false, 'draw')).toBe(false);
  });
  it('the drawer exists when either the timeline or Scripts wants it: Scripts open in it keeps it on a still', () => {
    expect(leftOutForStill('bottom', ['timeline', 'scripts'], false, 'draw')).toBe(false);
    expect(leftOutForStill('bottom', ['scripts'], false, 'draw')).toBe(false);
    expect(leftOutForStill('bottom', ['timeline'], false, 'draw')).toBe(true);
  });
  it('an animation keeps it, and so does the Animate room, which shows the Add animation card in its place', () => {
    expect(leftOutForStill('bottom', ['timeline'], true, 'draw')).toBe(false);
    expect(leftOutForStill('bottom', ['timeline'], false, 'animate')).toBe(false);
  });
  it('the panels it knows are real', async () => {
    const { getPanel } = await import('../../src/core/registry');
    for (const id of ANIMATION_PANELS) expect(getPanel(id), id).toBeTruthy();
  });
});
