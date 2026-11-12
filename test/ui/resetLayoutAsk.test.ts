// @vitest-environment jsdom
// Reset layout on a built-in workspace leaves the tools alone, so Quill asks about them, but only when they are changed.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyWorkspace, dock, resetDock, saveWorkspace, setToolGroups } from '../../src/ui/dock';
import { line, LINES, placeholders } from '../../src/ui/mascot/lines';
import { clearToasts, dismissToast, toasts } from '../../src/ui/toast';
import { isCustomArrangement } from '../../src/ui/toolRail';
import { resetLayoutAndAsk } from '../../src/ui/workspaceActions';

const mine = [{ id: 'g1', tools: ['brush', 'pencil'] }];
const shown = () => toasts.get();

beforeAll(async () => {
  await import('../../src/renderer/features');
});
beforeEach(() => {
  resetDock();
  clearToasts();
});

describe('Quill asks about the tools after Reset layout', () => {
  it('has a line with a where and the workspace as its variable', () => {
    expect(LINES['workspaces.resetTools'].vars).toEqual(['workspace']);
    expect(placeholders(LINES['workspaces.resetTools'].text)).toEqual(['workspace']);
    expect(LINES['workspaces.resetTools'].where.length).toBeGreaterThan(10);
    expect(line('workspaces.resetTools', { workspace: 'Draw' })).toBe('Reset your tools in Draw too?');
  });

  it('does not ask when the tools are already the default', () => {
    expect(isCustomArrangement()).toBe(false);
    resetLayoutAndAsk();
    expect(shown().map((t) => t.message)).toEqual(['Panels are back where they started.']);
    expect(shown()[0].decline).toBeUndefined();
  });

  it('asks on a built-in workspace with changed tools, keeping them until Yes', () => {
    setToolGroups(mine);
    resetLayoutAndAsk();
    expect(isCustomArrangement()).toBe(true);
    expect(shown()).toHaveLength(1);
    const t = shown()[0];
    expect(t.message).toBe('Reset your tools in Draw too?');
    expect([t.action?.label, t.decline?.label]).toEqual(['Yes', 'No']);
    t.action!.run();
    expect(isCustomArrangement()).toBe(false);
  });

  it('No leaves the tools as they are', () => {
    setToolGroups(mine);
    resetLayoutAndAsk();
    const t = shown()[0];
    dismissToast(t.id);
    t.decline!.run();
    expect(dock.get().rails?.draw).toEqual(mine);
  });

  it('Yes only resets the workspace it was asked about', () => {
    setToolGroups(mine);
    resetLayoutAndAsk();
    const t = shown()[0];
    applyWorkspace('animate');
    setToolGroups([{ id: 'g2', tools: ['pencil'] }]);
    t.action!.run();
    expect(dock.get().rails?.animate).toEqual([{ id: 'g2', tools: ['pencil'] }]);
  });

  it('does not ask for a workspace of your own, whose tools go back with its panels', () => {
    setToolGroups(mine);
    const ws = saveWorkspace('Mine')!;
    applyWorkspace(ws.id);
    setToolGroups([{ id: 'g3', tools: ['pencil'] }]);
    clearToasts();
    resetLayoutAndAsk();
    expect(shown().map((t) => t.message)).toEqual(['Panels are back where they started.']);
    expect(isCustomArrangement()).toBe(false);
  });
});
